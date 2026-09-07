/**
 * Shared request/result types for the Hydra inference engine.
 * These mirror the LSP-ish contract the swarm exposes over REST/WebSocket,
 * so the NeuralSim and llama.cpp backends are drop-in interchangeable.
 */

import type { Language } from './tokenizer.ts';
import type { Chunk, WorkspaceFile } from './chunker.ts';
import type { Embedding } from './embeddings.ts';

export interface EngineStatus {
  backend: 'neuralsim' | 'llamacpp';
  modelPath: string;
  loaded: boolean;
  version: string;
  tokensProcessed: number;
  averageLatencyMs: number;
  description: string;
}

export interface CompletionCandidate {
  text: string;
  kind: 'token' | 'word' | 'snippet' | 'import' | 'ghost' | 'signature';
  confidence: number;   // 0..1
  sourceAgent: string;  // agent id that produced it
  replaceStart: number; // absolute offset to replace from
}

export interface CompletionRequest {
  filePath: string;
  lang: Language;
  source: string;
  cursor: number;
  context: Chunk[];
  topK?: number;
}

export interface CompletionResult {
  candidates: CompletionCandidate[];
  model: string;
  tokensPredicted: number;
  latencyMs: number;
  votes: number;
}

export type IssueSeverity = 'error' | 'warning' | 'hint' | 'info';
export type IssueKind =
  | 'undefined-identifier'
  | 'unused-variable'
  | 'unused-import'
  | 'missing-semicolon'
  | 'suspicious-comparison'
  | 'bare-except'
  | 'security'
  | 'performance'
  | 'style'
  | 'complexity'
  | 'todo'
  | 'dead-code'
  | 'typo'
  | 'compat';

export interface Issue {
  file: string;
  line: number;
  col: number;
  severity: IssueSeverity;
  code: string;      // machine-readable, e.g. HYD-1042
  kind: IssueKind;
  message: string;
  suggested?: string;
}

export interface AnalyzeRequest {
  filePath: string;
  lang: Language;
  source: string;
}

export interface AnalyzeResult {
  issues: Issue[];
  astNodes: number;
  latencyMs: number;
}

export interface SymbolRef {
  symbol: string;
  filePath: string;
  line: number;
  col: number;
  snippet: string;
  kind: 'definition' | 'import' | 'usage' | 'class' | 'function' | 'variable';
  score: number;
}

export interface ResolveRequest {
  symbol: string;
  workspace: WorkspaceFile[];
}

export interface ResolutionResult {
  refs: SymbolRef[];
  latencyMs: number;
}

export interface RefactorPatch {
  description: string;
  start: number;
  end: number;
  replacement: string;
}

export interface RefactorSuggestion {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'safe';
  patches: RefactorPatch[];
}

export interface RefactorRequest {
  filePath: string;
  lang: Language;
  source: string;
}

export interface RefactorResult {
  suggestions: RefactorSuggestion[];
  latencyMs: number;
}

export interface TestCase {
  name: string;
  framework: string;
  target: string;
  code: string;
}

export interface TestGenRequest {
  filePath: string;
  lang: Language;
  source: string;
}

export interface TestGenResult {
  tests: TestCase[];
  latencyMs: number;
}

export interface ChatRequest {
  prompt: string;
  context: Chunk[];
  filePath?: string;
  workspaceSummary?: string;
}

export interface ChatResult {
  answer: string;
  intent: string;
  latencyMs: number;
}

export interface InferenceEngine {
  backendName: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  analyze(req: AnalyzeRequest): Promise<AnalyzeResult>;
  resolve(req: ResolveRequest): Promise<ResolutionResult>;
  refactor(req: RefactorRequest): Promise<RefactorResult>;
  generateTests(req: TestGenRequest): Promise<TestGenResult>;
  chat(req: ChatRequest): Promise<ChatResult>;
  embed(text: string): Embedding;
  status(): EngineStatus;
  warmup(): Promise<void>;
}