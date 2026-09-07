/** NeuralSim — deterministic zero-dependency inference backend. Mirrors the `InferenceEngine` contract. */
import type { EngineStatus, InferenceEngine, AnalyzeRequest, AnalyzeResult, CompletionRequest, CompletionResult, ResolveRequest, ResolutionResult, RefactorRequest, RefactorResult, TestGenRequest, TestGenResult, ChatRequest, ChatResult } from './types.ts';
import type { WorkspaceFile } from './chunker.ts';
import { hashEmbed } from './embeddings.ts';
import type { Embedding } from './embeddings.ts';
import { simulateComplete } from './neuralsim_complete.ts';
import { analyzeFile } from './neuralsim_analyze.ts';
import { resolveSymbol } from './neuralsim_resolve.ts';
import { suggestRefactor } from './neuralsim_refactor.ts';
import { generateTestsFor } from './neuralsim_tests.ts';
import { chatAnswer } from './neuralsim_chat.ts';
import type { AssistantFacts } from './neuralsim_chat.ts';
import type { HydraConfig } from '../config.ts';

export class NeuralSimEngine implements InferenceEngine {
  readonly backendName = 'neuralsim';
  private tokensProcessed = 0;
  private latencies: number[] = [];
  private readonly bootTime = Date.now();
  private readonly workspaceProvider: () => WorkspaceFile[];
  private readonly cfg: HydraConfig;

  constructor(cfg: HydraConfig, workspaceProvider: () => WorkspaceFile[]) {
    this.cfg = cfg;
    this.workspaceProvider = workspaceProvider;
  }

  private track(ms: number): void {
    this.tokensProcessed += 1;
    this.latencies.push(ms);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  async warmup(): Promise<void> {
    await this.complete({ filePath: 'warmup.ts', lang: 'typescript', source: 'const x = 1;\n', cursor: 6, context: [] });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const corpus = this.workspaceProvider().map((f) => ({ path: f.path, content: f.content }));
    const voters = this.cfg.voters;
    const results: CompletionResult[] = [];
    for (let v = 0; v < Math.min(3, voters); v++) {
      results.push(simulateComplete({ workspace: corpus, request: req, agentSeed: v + 1, voters }));
    }
    const merged = mergeResults(results, req.topK ?? 5);
    const latency = results.length > 0 ? results.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / results.length : 1;
    this.track(latency);
    return { ...merged, votes: voters, latencyMs: latency };
  }

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    const started = Date.now();
    const res = analyzeFile(req);
    const latency = Date.now() - started;
    this.track(latency);
    return { ...res, latencyMs: latency };
  }

  async resolve(req: ResolveRequest): Promise<ResolutionResult> {
    const started = Date.now();
    const res = resolveSymbol(req);
    const latency = Date.now() - started;
    this.track(latency);
    return { ...res, latencyMs: latency };
  }

  async refactor(req: RefactorRequest): Promise<RefactorResult> {
    const started = Date.now();
    const res = suggestRefactor(req);
    const latency = Date.now() - started;
    this.track(latency);
    return { ...res, latencyMs: latency };
  }

  async generateTests(req: TestGenRequest): Promise<TestGenResult> {
    const started = Date.now();
    const res = generateTestsFor(req);
    const latency = Date.now() - started;
    this.track(latency);
    return { ...res, latencyMs: latency };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const res = chatAnswer(req, this.facts());
    const latency = Date.now() - started;
    this.track(latency);
    return { ...res, latencyMs: latency };
  }

  embed(text: string): Embedding { return hashEmbed(text); }

  status(): EngineStatus {
    const avg = this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0;
    return {
      backend: this.backendName,
      modelPath: this.cfg.modelPath,
      loaded: true,
      version: '1.0.0 (deterministic)',
      tokensProcessed: this.tokensProcessed,
      averageLatencyMs: Math.round(avg * 100) / 100,
      description: 'Deterministic code-aware engine — no weights required, runs on any hardware.',
    };
  }

  private facts(): AssistantFacts {
    const files = this.workspaceProvider();
    const lines = files.reduce((acc, f) => acc + f.content.split('\n').length, 0);
    return {
      workspaceFiles: files.length,
      workspaceLines: lines,
      agents: this.cfg.agents,
      backend: this.backendName,
      clusters: CLUSTER_FACTS,
      uptimeS: Math.max(1, Math.round((Date.now() - this.bootTime) / 1000)),
      completionsServed: this.latencies.length,
      version: '1.0.0',
    };
  }
}

const CLUSTER_FACTS = [
  { key: 'Alpha', agents: 30, budgetMs: 8 },
  { key: 'Beta', agents: 25, budgetMs: 25 },
  { key: 'Gamma', agents: 25, budgetMs: 50 },
  { key: 'Delta', agents: 20, budgetMs: 120 },
];

function mergeResults(results: CompletionResult[], topK: number): CompletionResult {
  const byKey = new Map<string, CompletionResult['candidates'][number]>();
  for (const r of results) for (const c of r.candidates) {
    const key = `${c.kind}|${c.text}|${c.replaceStart}`;
    const prev = byKey.get(key);
    if (!prev || c.confidence > prev.confidence) byKey.set(key, c);
  }
  const candidates = [...byKey.values()].sort((a, b) => b.confidence - a.confidence).slice(0, topK);
  return { candidates, model: results.length > 0 ? results[0]!.model : 'NeuralSim', tokensPredicted: candidates.length, latencyMs: 0, votes: results.length };
}

export type { Embedding };