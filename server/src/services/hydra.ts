/**
 * Hydra orchestrator — the public API surface of the router.
 * Wires the inference engine, swarm dispatcher, workspace and consensus layer
 * into the operations the IDE + extension + CLI call.
 */

import type { HydraConfig } from '../config.ts';
import type { HydraLogger } from '../util/logger.ts';
import type { InferenceEngine, CompletionRequest, CompletionResult, ResolutionResult, RefactorResult, TestGenResult, ChatResult, AnalyzeResult } from '../engine/types.ts';
import { Workspace } from '../services/workspace.ts';
import { retrieveContext, DEFAULT_CHUNK_CONFIG } from '../engine/chunker.ts';
import type { WorkspaceFile, Chunk } from '../engine/chunker.ts';
import { SwarmDispatcher } from '../swarm/dispatcher.ts';
import { aggregateVotes } from '../swarm/consensus.ts';
import type { Vote } from '../swarm/consensus.ts';
import type { AgentStats } from '../swarm/agent.ts';
import { simulateComplete } from '../engine/neuralsim_complete.ts';
import { analyzeFile } from '../engine/neuralsim_analyze.ts';
import { resolveSymbol } from '../engine/neuralsim_resolve.ts';
import { suggestRefactor } from '../engine/neuralsim_refactor.ts';
import { generateTestsFor } from '../engine/neuralsim_tests.ts';
import type { ModelInfo } from '../services/modelinfo.ts';
import { detectLanguage } from '../engine/tokenizer.ts';
import type { Language } from '../engine/tokenizer.ts';

export interface TaskTraceEntry {
  id: string;
  cluster: string;
  kind: string;
  at: number;
  durationMs: number;
  nodes: number;
}

export class HydraOrchestrator {
  readonly workspace: Workspace;
  readonly cfg: HydraConfig;
  readonly engine: InferenceEngine;
  private readonly log: HydraLogger;
  private readonly modelInfo: ModelInfo;
  private readonly dispatcher: SwarmDispatcher;
  private traces: TaskTraceEntry[] = [];
  private completionsServed = 0;
  private analyzeCount = 0;
  private readonly bootTime = Date.now();

  constructor(
    cfg: HydraConfig,
    engine: InferenceEngine,
    log: HydraLogger,
    modelInfo: ModelInfo,
    workspace?: Workspace,
  ) {
    this.cfg = cfg;
    this.engine = engine;
    this.log = log;
    this.modelInfo = modelInfo;
    this.workspace = workspace ?? new Workspace();
    this.dispatcher = new SwarmDispatcher();
  }

  boot(): void {
    if (this.cfg.seedWorkspace && this.workspace.list().length === 0) {
      this.workspace.seed();
      this.log.info(`Seeded workspace with ${this.workspace.list().length} sample files.`);
    }
    this.dispatcher.spawn(this.cfg.agents);
    this.log.info(`Swarm ready: ${this.dispatcher.size} agents (${JSON.stringify(this.dispatcher.countByCluster)}).`);
  }

  private chunks(req: CompletionRequest): Chunk[] {
    const query = `${req.filePath} ${req.lang} ${req.source.slice(Math.max(0, req.cursor - 200), req.cursor)}`;
    return retrieveContext(this.workspace.list(), query, { ...DEFAULT_CHUNK_CONFIG, budgetTokens: this.cfg.contextTokens });
  }

  /**
   * Route a completion through the Alpha cluster: each voter agent produces
   * candidates; consensus merges them into one ranked list.
   */
  async complete(req: CompletionRequest): Promise<{ result: CompletionResult; votes: number; traces: TaskTraceEntry[] }> {
    const started = Date.now();
    const context = this.chunks(req);
    const voters = Math.min(this.cfg.voters, 12);

    const votes: Vote[] = await Promise.all(
      Array.from({ length: voters }, (_, i) =>
        this.dispatcher.dispatch('alpha', 'inline-completion', { req, context, seed: i + 1 }, async (payload) => {
          const files = this.workspace.list().map((f) => ({ path: f.path, content: f.content }));
          const r = simulateComplete({ workspace: files, request: { ...payload.req, context: payload.context }, agentSeed: payload.seed, voters });
          return { agentId: `alpha-${i}`, cluster: 'alpha', candidates: r.candidates } satisfies Vote;
        }),
      ),
    );

    const consensus = aggregateVotes(votes, req.topK ?? 5);
    const latency = Date.now() - started;
    this.completionsServed++;
    return {
      result: {
        candidates: consensus.candidates,
        votes: consensus.votesCast,
        model: this.engine.status().modelPath,
        tokensPredicted: consensus.candidates.reduce((a, c) => a + c.text.split(/\s+/).length, 0),
        latencyMs: latency,
      },
      votes: consensus.votesCast,
      traces: [this.trace(votes.length + 1, 'alpha', 'inline-completion', started, latency)],
    };
  }

  /** Route a single file through the Beta cluster: static checking. */
  async analyze(path?: string): Promise<{ result: AnalyzeResult; traces: TaskTraceEntry[] }> {
    const f = path ? this.workspace.get(path) : this.workspace.list()[0];
    if (!f) return { result: { issues: [], astNodes: 0, latencyMs: 0 }, traces: [] };
    const started = Date.now();
    const result = await this.dispatcher.dispatch('beta', 'ast-inspection', f, async (file) =>
      analyzeFile({ filePath: file.path, lang: detectLang(file.path), source: file.content }));
    this.analyzeCount++;
    return { result, traces: [this.trace(1, 'beta', 'ast-inspection', started, result.latencyMs)] };
  }

  /** Route a symbol query through the Gamma cluster: cross-file resolution. */
  async resolve(symbol: string): Promise<{ result: ResolutionResult; traces: TaskTraceEntry[] }> {
    const started = Date.now();
    const result = await this.dispatcher.dispatch(
      'gamma', 'symbol-resolution', { symbol, workspace: this.workspace.list() },
      async (p) => resolveSymbol(p),
    );
    const latency = Date.now() - started;
    return { result: { ...result, latencyMs: latency }, traces: [this.trace(1, 'gamma', 'symbol-resolution', started, latency)] };
  }

  /** Route refactor suggestions through the Delta cluster. */
  async refactor(path: string): Promise<{ result: RefactorResult; traces: TaskTraceEntry[] }> {
    const f = this.workspace.get(path);
    if (!f) return { result: { suggestions: [], latencyMs: 0 }, traces: [] };
    const started = Date.now();
    const result = await this.dispatcher.dispatch('delta', 'refactoring', f, async (file) =>
      suggestRefactor({ filePath: file.path, lang: detectLang(file.path), source: file.content }));
    const latency = Date.now() - started;
    return { result: { ...result, latencyMs: latency }, traces: [this.trace(1, 'delta', 'refactoring', started, latency)] };
  }

  /** Route test synthesis through the Delta cluster. */
  async tests(path: string): Promise<{ result: TestGenResult; traces: TaskTraceEntry[] }> {
    const f = this.workspace.get(path);
    if (!f) return { result: { tests: [], latencyMs: 0 }, traces: [] };
    const started = Date.now();
    const result = await this.dispatcher.dispatch('delta', 'test-synthesis', f, async (file) =>
      generateTestsFor({ filePath: file.path, lang: detectLang(file.path), source: file.content }));
    const latency = Date.now() - started;
    return { result: { ...result, latencyMs: latency }, traces: [this.trace(1, 'delta', 'test-synthesis', started, latency)] };
  }

  /** Assistant chat (engine-backed: NeuralSim or llama.cpp). */
  async chat(prompt: string, filePath?: string): Promise<ChatResult> {
    const source = filePath ? this.workspace.get(filePath)?.content ?? '' : '';
    const context = filePath
      ? this.chunks({ filePath, lang: detectLang(filePath), source, cursor: 0, context: [] })
      : [];
    const stats = this.workspace.stats();
    return this.engine.chat({
      prompt,
      context,
      filePath,
      workspaceSummary: `${stats.files} files / ${stats.lines} lines`,
    });
  }

  suggestions(prefix: string): string[] {
    return this.workspace.suggestions(prefix, 30);
  }

  symbols(symbol: string): ReturnType<Workspace['findSymbol']> {
    return this.workspace.findSymbol(symbol);
  }

  status() {
    const summary = this.dispatcher.summary();
    const telemetry = this.dispatcher.telemetry();
    return {
      ...summary,
      activeNow: telemetry.filter((t) => t.active > 0).length,
      engine: this.engine.status(),
      model: this.modelInfo,
      workspace: this.workspace.stats(),
      completionsServed: this.completionsServed,
      analyzeCount: this.analyzeCount,
      uptimeS: Math.round((Date.now() - this.bootTime) / 1000),
      traces: this.traces.slice(-200),
      clusters: clusterBreakdown(telemetry),
    };
  }

  telemetry(): { agents: AgentStats[]; summary: ReturnType<SwarmDispatcher['summary']> } {
    return { agents: this.dispatcher.telemetry(), summary: this.dispatcher.summary() };
  }

  private trace(nodes: number, cluster: string, kind: string, at: number, durationMs: number): TaskTraceEntry {
    const t: TaskTraceEntry = {
      id: `t-${at}-${Math.floor(Math.random() * 1e5)}`,
      cluster, kind, at, durationMs, nodes,
    };
    this.traces.push(t);
    if (this.traces.length > 500) this.traces.shift();
    return t;
  }
}

function detectLang(path: string): Language {
  return detectLanguage(path);
}

function clusterBreakdown(agents: AgentStats[]): Array<{ key: string; agents: number; working: number; avgLatencyMs: number; backlog: number; completed: number }> {
  const sum = (key: string) => {
    const pool = agents.filter((a) => a.cluster === key);
    const avgMs = pool.length > 0 ? pool.reduce((acc, a) => acc + a.avgLatencyMs, 0) / pool.length : 0;
    return {
      key,
      agents: pool.length,
      working: pool.filter((a) => a.state === 'working').length,
      avgLatencyMs: Math.round(avgMs * 100) / 100,
      backlog: pool.reduce((acc, a) => acc + a.backlog, 0),
      completed: pool.reduce((acc, a) => acc + a.completed, 0),
    };
  };
  return [sum('alpha'), sum('beta'), sum('gamma'), sum('delta')];
}