/** Diagnostic self-check for boot hang. */
import { Workspace } from './services/workspace.ts';
import { makeLogger } from './util/logger.ts';
import { NeuralSimEngine } from './engine/neuralsim.ts';
import { HydraOrchestrator } from './services/hydra.ts';
import { defaultConfig } from './config.ts';

const cfg = defaultConfig();
cfg.agents = 8;
cfg.backend = 'neuralsim';
const log = makeLogger('debug');

console.log('step1 new Workspace');
const ws = new Workspace();
console.log('step2 seed');
ws.seed();
console.log('step2b seeded count=', ws.list().length);
console.log('step3 new NeuralSimEngine');
const engine = new NeuralSimEngine(cfg, () => ws.list());
console.log('step4 new HydraOrchestrator');
const orchid = new HydraOrchestrator(cfg, engine, log, {
  path: '', exists: false, sizeBytes: 0, format: '', version: null, architecture: null,
  name: null, contextLength: null, quantization: null, fileType: null, tensorCount: null, metadataCount: 0,
}, ws);
console.log('step5 boot');
orchid.boot();
console.log('step5b booted');
console.log('step6 warmup');
await engine.warmup();
console.log('step6b warmed');
console.log('step7 complete via orchid');
const r = await orchid.complete({
  filePath: 'src/main.py', lang: 'python',
  source: 'def add(a, b):\n    return a + b\n\nres = add(1, 2)\n', cursor: 28, context: [], topK: 4,
});
console.log('step7b candidates=', r.result.candidates.map((c) => c.text).join(' | '));
console.log('step8 status', JSON.stringify(orchid.status().clusters));
console.log('ALL OK');