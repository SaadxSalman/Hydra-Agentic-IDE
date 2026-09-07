/**
 * HYDRA-ROUTER — Hydra-IDE entry point.
 *
 * ```
 * node --experimental-strip-types server/src/index.ts --agents 100 \
 *      --port 8214 --model ./models/LFM2.5-230M-QAD-Q4_0.gguf
 * ```
 * (Node ≥ 23 runs TS source natively; the flag is accepted for older minors.)
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HydraConfig } from './config.ts';
import { loadConfig } from './config.ts';
import { makeLogger } from './util/logger.ts';
import { createEngine } from './engine/engine.ts';
import { parseGguf } from './services/modelinfo.ts';
import { HydraOrchestrator } from './services/hydra.ts';
import { TelemetryHub } from './ws.ts';
import { HydraHttpServer } from './router.ts';
import { Workspace } from './services/workspace.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

export function resolvePaths(cfg: HydraConfig): { modelPath: string; webDist: string } {
  const modelPath = path.isAbsolute(cfg.modelPath)
    ? cfg.modelPath
    : path.resolve(repoRoot, cfg.modelPath);
  const webDist = path.resolve(repoRoot, 'web', 'dist');
  return { modelPath, webDist };
}

export async function main(): Promise<void> {
  const cfg = loadConfig(process.argv.slice(2));
  const log = makeLogger(cfg.logLevel);
  const { modelPath, webDist } = resolvePaths(cfg);
  cfg.modelPath = modelPath;

  log.info('======= HYDRA-ROUTER =======');
  log.info(`nproc = ${cfg.workers} | agents = ${cfg.agents} | port = ${cfg.port} | backend = ${cfg.backend}`);

  // ---- model metadata -----------------------------------------------------
  const modelInfo = await parseGguf(modelPath);
  if (modelInfo.exists) {
    log.info(`Model file OK: ${Math.round(modelInfo.sizeBytes / (1024 * 1024))} MB | ${modelInfo.format} v${modelInfo.version ?? '?'} | ` +
      `arch=${modelInfo.architecture ?? 'unknown'} | name=${modelInfo.name ?? modelPath.split(/[\\/]/).pop()}`);
    if (modelInfo.architecture) log.info(`Detected architecture: ${modelInfo.architecture} (GGUF metadata)`);
  } else {
    log.warn(`Model file not found at ${modelPath} — continuing with metadata-less mode.`);
  }

  // ---- engine + swarm ------------------------------------------------------
  const workspace = new Workspace();
  const engine = await createEngine(cfg, () => workspace.list(), log);
  const orchid = new HydraOrchestrator(cfg, engine, log, modelInfo, workspace);
  orchid.boot();

  await engine.warmup();
  log.info('Engine warm-up complete.');

  // ---- websocket + http -----------------------------------------------------
  const hub = new TelemetryHub(orchid, cfg, log);
  const server = new HydraHttpServer(cfg, orchid, log, hub, webDist);
  server.listen();
  hub.start(cfg.telemetryIntervalMs);

  log.info(`API:  http://${cfg.host}:${cfg.port}/api/health`);
  log.info(`WS:   ws://${cfg.host}:${cfg.port}/ws`);
  log.info(`IDE:  ${cfg.dev ? 'dev mode → vite on http://localhost:5173 (backend on 8214)' : `http://${cfg.host}:${cfg.port}`}`);

  const shutdown = (sig: string) => {
    log.warn(`Received ${sig} — draining swarm and shutting down.`);
    hub.stop();
    server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

await main();

export const __internals = { parseGguf, HydraOrchestrator, resolvePaths };