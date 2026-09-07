/**
 * Hydra-IDE runtime configuration.
 * All values can be overridden via CLI flags (e.g. `--agents 100`) or environment variables.
 */

export type EngineBackend = 'auto' | 'neuralsim' | 'llamacpp';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HydraConfig {
  /** Host interface the router binds to. */
  host: string;
  /** Main HTTP + WebSocket port. */
  port: number;
  /** Total number of swarm worker agents to spawn. */
  agents: number;
  /** Path to the LFM GGUF model file (used for metadata + future llama.cpp engine). */
  modelPath: string;
  /** Inference backend: auto-probe llama-server, force NeuralSim, or force llama.cpp adapter. */
  backend: EngineBackend;
  /** Base URL of an external llama.cpp `llama-server` instance (used when backend != neuralsim). */
  llamaServerUrl: string;
  /** Worker threads for the HTTP server (Node uses an async single-thread core; this is exposed for parity with the Rust design). */
  workers: number;
  /** Token budget for context chunking (approximate tokens). */
  contextTokens: number;
  /** How many agents vote on each completion request. */
  voters: number;
  /** Debounce window (ms) for IDE keystroke-triggered completions. */
  completionDebounceMs: number;
  /** Enable dev mode (CORS for vite, verbose logs). */
  dev: boolean;
  /** Seed the in-memory IDE workspace with a sample project when empty. */
  seedWorkspace: boolean;
  /** Broadcast telemetry interval in ms. */
  telemetryIntervalMs: number;
  logLevel: LogLevel;
}

export function defaultConfig(): HydraConfig {
  return {
    host: '127.0.0.1',
    port: 8214,
    agents: 100,
    modelPath: './models/LFM2.5-230M-QAD-Q4_0.gguf',
    backend: 'auto',
    llamaServerUrl: 'http://127.0.0.1:8080',
    workers: 4,
    contextTokens: 4096,
    voters: 7,
    completionDebounceMs: 120,
    dev: false,
    seedWorkspace: true,
    telemetryIntervalMs: 250,
    logLevel: 'info',
  };
}

function asInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt ? Number.parseInt(v) : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse `--key value` style CLI args into a HydraConfig.
 * Also supports HYDRAS_* environment variables which take precedence.
 */
export function loadConfig(argv: string[]): HydraConfig {
  const cfg = defaultConfig();

  const pairs = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      pairs.set(key, next);
      i++;
    } else {
      pairs.set(key, 'true');
    }
  }

  const get = (key: string) => pairs.get(key) ?? process.env['HYDRAS_' + key.toUpperCase()];
  const flag = (key: string) => (pairs.get(key) === 'true' || process.env['HYDRAS_' + key.toUpperCase()] === '1' || process.env['HYDRAS_' + key.toUpperCase()] === 'true') &&
    pairs.get(key) !== 'false';

  if (get('help') !== undefined || pairs.has('h')) {
    printHelp();
    process.exit(0);
  }

  if (get('host')) cfg.host = get('host')!;
  if (get('port')) cfg.port = asInt(get('port'), cfg.port);
  if (get('agents')) cfg.agents = Math.max(4, asInt(get('agents'), cfg.agents));
  if (get('model-path') || get('model')) cfg.modelPath = get('model-path') ?? get('model')!;
  if (get('backend')) {
    const b = get('backend')!;
    cfg.backend = (b === 'auto' || b === 'neuralsim' || b === 'llamacpp') ? b : cfg.backend;
  }
  if (get('llama-server')) cfg.llamaServerUrl = get('llama-server')!;
  if (get('workers')) cfg.workers = Math.max(1, asInt(get('workers'), cfg.workers));
  if (get('context-tokens')) cfg.contextTokens = asInt(get('context-tokens'), cfg.contextTokens);
  if (get('voters')) cfg.voters = Math.max(1, Math.min(60, asInt(get('voters'), cfg.voters)));
  if (get('completion-debounce')) cfg.completionDebounceMs = asInt(get('completion-debounce'), cfg.completionDebounceMs);
  if (flag('dev')) cfg.dev = true;
  if (flag('no-seed')) cfg.seedWorkspace = false;
  if (get('telemetry-interval')) cfg.telemetryIntervalMs = asInt(get('telemetry-interval'), cfg.telemetryIntervalMs);
  if (get('log-level')) {
    const l = get('log-level')!;
    cfg.logLevel = (l === 'debug' || l === 'info' || l === 'warn' || l === 'error') ? l : cfg.logLevel;
  }

  return cfg;
}

export function printHelp(): void {
  const text = `
HYDRA-ROUTER — Hydra-IDE Swarm Router & Dispatcher

Usage:
  node server/src/index.ts [options]

Options:
  --host <addr>             Bind host (default 127.0.0.1)
  --port <n>                Router port (default 8214)
  --agents <n>              Total worker agents (default 100)
  --model-path <file>       LFM GGUF path (default ./models/LFM2.5-230M-QAD-Q4_0.gguf)
  --backend <mode>          auto | neuralsim | llamacpp  (default auto)
  --llama-server <url>      External llama.cpp server URL (default http://127.0.0.1:8080)
  --workers <n>             HTTP worker threads (default 4)
  --context-tokens <n>      Context chunking budget (default 4096)
  --voters <n>              Voting agents per completion (default 7)
  --completion-debounce <n> Keystroke debounce ms (default 120)
  --telemetry-interval <n>  Telemetry broadcast ms (default 250)
  --dev                     Dev mode: CORS + verbose logs
  --no-seed                 Do not seed the in-memory workspace
  --log-level <lvl>         debug | info | warn | error
  --help                    Show this help

Example:
  node server/src/index.ts --agents 100 --port 8214 --model ./models/LFM2.5-230M-QAD-Q4_0.gguf
`;
  console.log(text);
}