/**
 * NeuralSim completion head — pure, deterministic code-aware prediction.
 * Combines:
 *  1. token n-gram "liquid state memory" over the workspace corpus,
 *  2. language snippet bank matching,
 *  3. import/module suggestions,
 *  4. balanced-construct ghost text.
 */

import { detectLanguage, ngrams, tokenize } from './tokenizer.ts';
import type { CompletionCandidate, CompletionRequest, CompletionResult } from './types.ts';
import { GHOST_SUFFIX, SNIPPET_BANK } from './knowledge.ts';

export interface CorpusEntry {
  path: string;
  content: string;
}

export const MODEL_ID = 'LFM2.5-230M-QAD-Q4_0.gguf (NeuralSim)';

export function stableRank(digest: number, mod: number): number {
  return ((Math.abs(digest) % mod) + mod) % mod;
}

export function hashOf(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

/** Build a corpus-level n-gram transition map (2-gram + 3-gram). */
export function buildLanguageModel(sources: CorpusEntry[]): Map<string, string[]> {
  const model = new Map<string, string[]>();
  for (const entry of sources) {
    const lang = detectLanguage(entry.path);
    const toks = tokenize(entry.content, lang).filter(
      (t) => t.kind !== 'whitespace' && t.kind !== 'newline' && t.kind !== 'comment',
    );
    for (const order of [2, 3]) {
      for (const [key, nexts] of ngrams(toks, order)) {
        const bucket = model.get(key);
        if (bucket) bucket.push(...nexts);
        else model.set(key, [...nexts]);
      }
    }
  }
  return model;
}

function lastWordOf(s: string): string {
  const m = /([A-Za-z_$@][\w$@]*)$/.exec(s);
  return m ? m[1]! : 'value';
}

/** Substitute ${placeholders} in snippet text with context-aware guesses. */
export function renderSnippet(template: string, preceding: string): string {
  const lastWord = lastWordOf(preceding);
  const plural = lastWord.endsWith('s') ? `${lastWord}es` : `${lastWord}s`;
  const pascal = lastWord.length > 0 ? lastWord[0]!.toUpperCase() + lastWord.slice(1) : 'Name';

  return template
    .replaceAll('${name}', lastWord)
    .replaceAll('${Name}', pascal)
    .replaceAll('${items}', plural)
    .replaceAll('${args}', 'arg')
    .replaceAll('${body}', 'pass')
    .replaceAll('${expr}', 'value')
    .replaceAll('${module}', 'module')
    .replaceAll('${Exception}', 'Exception')
    .replaceAll('${e}', 'e')
    .replaceAll('${cond}', 'true')
    .replaceAll('${handle}', 'pass')
    .replaceAll('${ctx}', 'ctx')
    .replaceAll('${var}', 'v')
    .replaceAll('${field}', 'field')
    .replaceAll('${type}', 'str')
    .replaceAll('${Ret}', 'void')
    .replaceAll('${params}', '')
    .replaceAll('${subject}', lastWord)
    .replaceAll('${behaves}', 'behaves correctly')
    .replaceAll('${i}', 'i')
    .replaceAll('${n}', 'n')
    .replaceAll('${x}', 'x')
    .replaceAll('${default}', 'default')
    .replaceAll('${call}', 'task()')
    .replaceAll('${method}', 'run')
    .replaceAll('${prop}', 'prop')
    .replaceAll('${T}', 'T')
    .replaceAll('${iter}', 'items')
    .replaceAll('${pattern}', 'p')
    .replaceAll('${result}', 'ok')
    .replaceAll('${transform}', 'item')
    .replaceAll('${err}', 'err')
    .replaceAll('${decl}', 'const x = 1')
    .replaceAll('${pkg}', 'pkg')
    .replaceAll('${crate}', 'crate');
}

export interface CompleteEnv {
  workspace: CorpusEntry[];
  request: CompletionRequest;
  agentSeed: number;
  voters: number;
}

const FALLBACK_VOCAB = ['()', '(', ')', ':', '};', '}', ']', 'value', 'result', 'data', 'name', 'count', 'items', 'x', ''];
const GHOST_ENTRIES: Array<[string, string]> = Object.entries(GHOST_SUFFIX);

/**
 * Produce completion candidates for this request.
 * `agentSeed` injects per-voter variation so the consensus layer has
 * real disagreement to merge (weighted rank aggregation).
 */
export function simulateComplete(env: CompleteEnv): CompletionResult {
  const start = Date.now();
  const { request, workspace, agentSeed, voters } = env;
  const { source, cursor, lang, topK } = request;
  const k = topK ?? 5;
  const candidates: CompletionCandidate[] = [];

  const model = buildLanguageModel(workspace);
  const tokens = tokenize(source, lang);

  const lineStart = source.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const lineSoFar = source.slice(lineStart, cursor);

  // --- 1. Partial identifier prefix --------------------------------------
  const idMatch = /([A-Za-z_$@][\w$@]*)$/.exec(lineSoFar);
  let prefixWord = '';
  let replaceStart = cursor;
  if (idMatch) {
    prefixWord = idMatch[1]!;
    replaceStart = cursor - prefixWord.length;
  }

  // --- 2. Snippet / construct matching -----------------------------------
  const bank = SNIPPET_BANK[lang] ?? [];
  for (const snip of bank) {
    if (snip.trigger.test(lineSoFar)) {
      candidates.push({
        text: renderSnippet(snip.insertText, lineSoFar),
        kind: 'snippet',
        confidence: 0.9 + stableRank(hashOf(snip.label), 9) / 100,
        sourceAgent: `agent-${agentSeed}`,
        replaceStart,
      });
    }
  }

  // --- 3. N-gram continuation predictions --------------------------------
  const lastToks = tokens
    .filter((t) => t.kind !== 'whitespace' && t.kind !== 'newline' && t.kind !== 'comment')
    .slice(-2)
    .map((t) => t.text);

  const continuations = new Map<string, number>();
  const twoKey = lastToks.join(' ');
  if (model.has(twoKey)) {
    for (const nxt of model.get(twoKey) ?? []) continuations.set(nxt, (continuations.get(nxt) ?? 0) + 1);
  } else if (lastToks.length > 0 && model.has(lastToks[lastToks.length - 1] ?? '')) {
    for (const nxt of model.get(lastToks[lastToks.length - 1] ?? '') ?? []) continuations.set(nxt, (continuations.get(nxt) ?? 0) + 1);
  }

  const vocab: Array<[string, number]> = continuations.size > 0
    ? [...continuations.entries()]
    : FALLBACK_VOCAB.map((w) => [w, 1] as [string, number]);

  let total = 0;
  for (const [, c] of vocab) total += c;

  const picks = Math.max(2, Math.min(4, k));
  for (let p = 0; p < picks; p++) {
    let target = stableRank(hashOf(prefixWord + agentSeed + p), Math.max(1, total)) + stableRank(agentSeed + p * 7, 7);
    let chosen = FALLBACK_VOCAB[stableRank(agentSeed + p, FALLBACK_VOCAB.length)] ?? '';
    for (const [word, count] of vocab) {
      target -= Math.max(1, count);
      if (target <= 0) { chosen = word; break; }
    }
    if (chosen.length === 0) continue;
    if (source.slice(cursor - chosen.length, cursor) === chosen) continue;
    candidates.push({
      text: chosen,
      kind: chosen.includes(' ') || chosen === '()' ? 'word' : 'token',
      confidence: 0.5 + (continuations.get(chosen) ?? 1) / (total + 2) + stableRank(agentSeed, 15) / 100,
      sourceAgent: `agent-${agentSeed}`,
      replaceStart,
    });
  }

  // --- 4. Import suggestions ----------------------------------------------
  if (/import\s+$/.test(lineSoFar) || /from\s+$/.test(lineSoFar)) {
    const seen = new Set<string>();
    for (const entry of workspace) {
      const parts = entry.path.includes('\\') ? entry.path.split('\\') : entry.path.split('/');
      const mod = parts.length >= 2 ? parts[parts.length - 2] : undefined;
      if (mod && mod !== 'node_modules' && !seen.has(mod) && mod.length > 1) {
        seen.add(mod);
        candidates.push({
          text: mod,
          kind: 'import',
          confidence: 0.78,
          sourceAgent: `agent-${agentSeed}`,
          replaceStart: cursor,
        });
      }
    }
  }

  // --- 5. Ghost text for balanced constructs ------------------------------
  for (const [trigger, suffix] of GHOST_ENTRIES) {
    if (lineSoFar.endsWith(trigger)) {
      candidates.push({
        text: suffix,
        kind: 'ghost',
        confidence: 0.98,
        sourceAgent: `agent-${agentSeed}`,
        replaceStart: cursor,
      });
      break;
    }
  }

  return finalize(candidates, k, voters, start);
}

function finalize(
  candidates: CompletionCandidate[],
  k: number,
  voters: number,
  startMs: number,
): CompletionResult {
  const seenKeys = new Set<string>();
  const deduped: CompletionCandidate[] = [];
  candidates.sort((a, b) => b.confidence - a.confidence);
  for (const c of candidates) {
    const key = `${c.kind}|${c.text}|${c.replaceStart}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(c);
    if (deduped.length >= k) break;
  }
  return {
    candidates: deduped,
    model: MODEL_ID,
    tokensPredicted: deduped.length,
    latencyMs: Date.now() - startMs,
    votes: Math.max(1, voters),
  };
}