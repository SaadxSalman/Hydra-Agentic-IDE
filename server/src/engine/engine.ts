/** Engine factory — picks the backend based on config, probing llama.cpp when in `auto` mode. */
import type { HydraConfig } from '../config.ts';
import type { WorkspaceFile } from './chunker.ts';
import type { InferenceEngine } from './types.ts';
import { NeuralSimEngine } from './neuralsim.ts';
import { LlamacppEngine } from './llamacpp.ts';
import type { HydraLogger } from '../util/logger.ts';

export async function createEngine(
  cfg: HydraConfig,
  workspaceProvider: () => WorkspaceFile[],
  log: HydraLogger,
): Promise<InferenceEngine> {
  const useLlama = cfg.backend === 'llamacpp' || cfg.backend === 'auto';
  if (useLlama) {
    const adapter = new LlamacppEngine(cfg);
    const reachable = await adapter.isReachable();
    if (reachable) {
      log.info(`Engine: llama.cpp adapter online @ ${cfg.llamaServerUrl}`);
      return adapter;
    }
    if (cfg.backend === 'llamacpp') {
      log.warn(`llama.cpp requested but unreachable at ${cfg.llamaServerUrl} — falling back to NeuralSim.`);
    } else {
      log.info('llama.cpp not detected — using NeuralSim (deterministic) backend.');
    }
  } else {
    log.info('Engine: NeuralSim (deterministic) backend forced via --backend neuralsim.');
  }
  return new NeuralSimEngine(cfg, workspaceProvider);
}

export type { InferenceEngine };