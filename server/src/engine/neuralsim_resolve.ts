/**
 * NeuralSim symbol / import resolver (Gamma cluster: cross-file context).
 * Builds a global symbol index over the workspace and answers
 * definition / usage / import queries.
 */

import { detectLanguage, tokenize } from './tokenizer.ts';
import type { Language, Token } from './tokenizer.ts';
import type { ResolveRequest, ResolutionResult, SymbolRef } from './types.ts';

export interface IndexEntry {
  symbol: string;
  kind: SymbolRef['kind'];
  filePath: string;
  line: number;
  col: number;
  snippet: string;
}

/** Scan one file and extract declaration/definition sites. */
export function indexFile(path: string, content: string): IndexEntry[] {
  const lang = detectLanguage(path);
  const tokens = tokenize(content, lang)
    .filter((t) => t.kind !== 'whitespace' && t.kind !== 'newline' && t.kind !== 'comment');
  const lines = content.split(/\r?\n/);
  const entries: IndexEntry[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== 'ident') continue;
    const prev = i > 0 ? tokens[i - 1]!.text : '';
    const next = i + 1 < tokens.length ? tokens[i + 1]!.text : '';
    const lineText = lines[t.line - 1] ?? '';

    let kind: SymbolRef['kind'] | undefined;
    if (prev === 'def' || prev === 'fn' || prev === 'function' || prev === 'func') kind = 'function';
    else if (prev === 'class' || prev === 'interface' || prev === 'struct' || prev === 'enum' || prev === 'trait') kind = 'class';
    else if (prev === 'import' || prev === 'from' || prev === 'use') kind = 'import';
    else if (prev === 'let' || prev === 'var' || prev === 'const') kind = 'variable';
    else if (lang === 'python' && next === '=' && tokenIsAssignment(content, t)) kind = 'variable';

    if (kind) {
      entries.push({
        symbol: t.text,
        kind,
        filePath: path,
        line: t.line,
        col: t.col,
        snippet: lineText.trim().slice(0, 160),
      });
    }
  }
  return entries;
}

function tokenIsAssignment(source: string, t: Token): boolean {
  // `name = ` but not `==`/`>=`/etc.
  const two = source.slice(t.end, t.end + 2);
  return two === '= ' || two === '=\n' || two === '=\r';
}

/**
 * Resolve a symbol across the workspace. Ranks exact name matches by
 * kind (definitions first), then by similarity score.
 */
export function resolveSymbol(req: ResolveRequest): ResolutionResult {
  const start = Date.now();
  const { symbol, workspace } = req;
  const needle = symbol.trim();

  const refs: SymbolRef[] = [];
  const byName = new Map<string, number>();

  for (const file of workspace) {
    for (const e of indexFile(file.path, file.content)) {
      if (e.symbol !== needle) continue;
      const prev = byName.get(e.symbol) ?? 0;
      byName.set(e.symbol, prev + 1);

      let score = e.kind === 'definition' || e.kind === 'function' || e.kind === 'class' ? 1.0 : 0.6;
      if (e.kind === 'variable') score = 0.8;
      score -= refs.length * 0.01;

      refs.push({
        symbol: e.symbol,
        filePath: e.filePath,
        line: e.line,
        col: e.col,
        snippet: e.snippet,
        kind: e.kind,
        score,
      });
    }
  }

  // partial matches (prefix) only if no exact hits — contextual recall
  if (refs.length === 0 && needle.length >= 2) {
    for (const file of workspace) {
      for (const e of indexFile(file.path, file.content)) {
        if (!e.symbol.startsWith(needle) || e.symbol === needle) continue;
        if (refs.length >= 20) break;
        refs.push({
          symbol: e.symbol,
          filePath: e.filePath,
          line: e.line,
          col: e.col,
          snippet: e.snippet,
          kind: e.kind,
          score: 0.3,
        });
      }
    }
  }

  refs.sort((a, b) => b.score - a.score);
  return { refs: refs.slice(0, 30), latencyMs: Date.now() - start };
}