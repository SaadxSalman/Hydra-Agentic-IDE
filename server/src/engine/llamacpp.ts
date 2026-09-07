/**
 * llama.cpp adapter — talks to a local `llama-server` (or compatible
 * OpenAI-style endpoint) for generative completions + chat. Static analysis,
 * resolution, refactoring and tests still use the deterministic heads so the
 * full IDE surface works no matter which backend is attached.
 */

import type { EngineStatus, InferenceEngine, AnalyzeRequest, AnalyzeResult, CompletionRequest, CompletionResult, ResolveRequest, ResolutionResult, RefactorRequest, RefactorResult, TestGenRequest, TestGenResult, ChatRequest, ChatResult } from './types.ts';
import type { WorkspaceFile } from './chunker.ts';
import { hashEmbed } from './embeddings.ts';
import type { Embedding } from './embeddings.ts';
import { analyzeFile } from './neuralsim_analyze.ts';
import { resolveSymbol } from './neuralsim_resolve.ts';
import { suggestRefactor } from './neuralsim_refactor.ts';
import { generateTestsFor } from './neuralsim_tests.ts';
import type { HydraConfig } from '../config.ts';

interface LlamaCompletionResponse {
  content?: string;
  completion?: string;
  tokens_predicted?: number;
}

export class LlamacppEngine implements InferenceEngine {
  readonly backendName = 'llamacpp';
  private tokensProcessed = 0;
  private latencies: number[] = [];
  private readonly cfg: HydraConfig;

  constructor(cfg: HydraConfig) {
    this.cfg = cfg;
  }

  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cfg.llamaServerUrl}/health`, { signal: AbortSignal.timeout(1200) });
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  async warmup(): Promise<void> {
    await this.complete({ filePath: 'w.ts', lang: 'typescript', source: 'const x = 1;\n', cursor: 6, context: [] });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const constraint = req.topK ?? 3;
    const prompt = buildPrompt(req);
    let candidates: CompletionResult['candidates'] = [];
    let model = 'llama.cpp';
    try {
      const res = await fetch(`${this.cfg.llamaServerUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, n_predict: 10, temperature: 0.2, top_p: 0.9, n_probs: constraint }),
        signal: AbortSignal.timeout(4000),
      });
      const data: LlamaCompletionResponse = await res.json();
      const text = (data.content ?? data.completion ?? '').replace(/\n+$/, '');
      model = 'llama.cpp (local)';
      if (text.length > 0) {
        candidates = [{ text, kind: 'word', confidence: 0.92, sourceAgent: 'llamacpp', replaceStart: req.cursor }];
      }
    } catch {
      candidates = [{ text: '', kind: 'token', confidence: 0, sourceAgent: 'llamacpp', replaceStart: req.cursor }];
    }
    const latency = Date.now() - started;
    this.tokensProcessed += 1;
    this.latencies.push(latency);
    if (this.latencies.length > 1000) this.latencies.shift();
    return { candidates, model, tokensPredicted: 1, latencyMs: latency, votes: 1 };
  }

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> { return analyzeFile(req); }
  async resolve(req: ResolveRequest): Promise<ResolutionResult> { return resolveSymbol(req); }
  async refactor(req: RefactorRequest): Promise<RefactorResult> { return suggestRefactor(req); }
  async generateTests(req: TestGenRequest): Promise<TestGenResult> { return generateTestsFor(req); }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const ctx = req.context.slice(0, 3).map((c) => `// ${c.path} lines ${c.startLine}-${c.endLine}\n${c.text}`).join('\n\n');
    try {
      const res = await fetch(`${this.cfg.llamaServerUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hydra-local',
          messages: [
            { role: 'system', content: 'You are Hydra — a precise, concise AI pair-programmer in a local-first IDE.' },
            ...(ctx.length > 0 ? [{ role: 'system', content: `Relevant code context:\n${ctx}` }] : []),
            { role: 'user', content: req.prompt },
          ],
          temperature: 0.3,
          max_tokens: 320,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const answer = data.choices?.[0]?.message?.content ?? '_(empty response from llama.cpp)_';
      return { answer, intent: 'generative', latencyMs: Date.now() - started };
    } catch {
      return {
        answer: 'llama.cpp unreachable — attach a running `llama-server` and retry.',
        intent: 'general',
        latencyMs: Date.now() - started,
      };
    }
  }

  embed(text: string): Embedding { return hashEmbed(text); }

  status(): EngineStatus {
    const avg = this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0;
    return {
      backend: this.backendName,
      modelPath: this.cfg.modelPath,
      loaded: false,
      version: 'llama.cpp (HTTP adapter)',
      tokensProcessed: this.tokensProcessed,
      averageLatencyMs: Math.round(avg * 100) / 100,
      description: `Streams generative completions from ${this.cfg.llamaServerUrl}.`,
    };
  }
}

function buildPrompt(req: CompletionRequest): string {
  const cursor = Math.min(req.cursor, req.source.length);
  const before = req.source.slice(Math.max(0, cursor - 1400), cursor);
  const after = req.source.slice(cursor, Math.min(req.source.length, cursor + 300));
  return `### File: ${req.filePath}\n### Language: ${req.lang}\n### Context snippets:\n${req.context.slice(0, 2).map((c) => c.text).join('\n---\n')}\n### Code:\n${before}‹CURSOR›${after}`;
}

export type { WorkspaceFile };