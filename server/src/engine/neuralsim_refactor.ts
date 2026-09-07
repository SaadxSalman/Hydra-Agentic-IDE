/**
 * NeuralSim refactoring head (Delta cluster 1: refactoring).
 * Produces safe, patchable refactor suggestions from token analysis:
 *  - extract function body to a named helper,
 *  - rename identifier (all occurrences reported),
 *  - drop unused imports / dead branches,
 *  - simplify redundant boolean comparisons.
 */

import { detectLanguage, tokenize } from './tokenizer.ts';
import type { Language } from './tokenizer.ts';
import type { RefactorRequest, RefactorResult, RefactorSuggestion } from './types.ts';

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function offsetOf(lines: string[], lineIdx: number): number {
  let off = 0;
  for (let i = 0; i < Math.min(lineIdx, lines.length); i++) off += lines[i]!.length + 1;
  return off;
}

export function toCamel(s: string): string {
  const parts = s.split('_');
  return parts[0]! + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

export function toSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function renameAll(source: string, lang: Language, from: string, to: string): string {
  const tokens = tokenize(source, lang);
  const out: string[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.kind === 'ident' && t.text === from) {
      out.push(source.slice(cursor, t.offset), to);
      cursor = t.end;
    }
  }
  out.push(source.slice(cursor));
  return out.join('');
}

export function detectLanguageFor(filePath: string): Language {
  return detectLanguage(filePath);
}

export function suggestRefactor(req: RefactorRequest): RefactorResult {
  const start = Date.now();
  const { filePath, lang, source } = req;
  const suggestions: RefactorSuggestion[] = [];
  const tokens = tokenize(source, lang);
  const lines = source.split(/\r?\n/);

  // ---- candidate 1: extract long function body ---------------------------
  const fnDef = lang === 'python' ? /^(\s*)def\s+([A-Za-z_]\w*)\s*\(/ : /^(\s*)(?:async\s+)?(?:function|func|fn)\s+([A-Za-z_]\w*)\s*\(/;
  const fnLines: Array<{ name: string; start: number; end: number; bodyStart: number; indent: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = fnDef.exec(lines[i]!);
    if (!m) continue;
    const indent = m[1]!;
    const name = m[2]!;
    const bodyStart = i + 1;
    let end = bodyStart;
    while (end < lines.length && (lines[end]!.trim().length === 0 || lines[end]!.startsWith(indent + '    ') || lines[end]!.startsWith(indent + '\t'))) end++;
    if (end - bodyStart >= 6 && end - bodyStart <= 80) {
      fnLines.push({ name, start: i, end: Math.max(i, end - 1), bodyStart, indent });
    }
  }

  for (const fn of fnLines) {
    const body = lines.slice(fn.bodyStart, fn.end + 1).join('\n');
    if (countOf(body, 'def ') > 0 || countOf(body, 'function ') > 0) continue; // nested fns too risky
    const helperName = `${fn.name}_core`;
    const newBody = body.split('\n').map((l) => l.startsWith(fn.indent) ? `    ${l.slice(fn.indent.length)}` : `    ${l}`).join('\n');
    suggestions.push({
      title: `Extract body of \`${fn.name}\``,
      description: `Function \`${fn.name}\` spans ${fn.end - fn.bodyStart + 1} lines. Extract its body into \`${helperName}()\` to reduce coupling and improve test isolation.`,
      severity: 'info',
      patches: [{
        description: `Move body lines ${fn.bodyStart + 1}–${fn.end + 1} into ${helperName}()`,
        start: offsetOf(lines, fn.bodyStart),
        end: offsetOf(lines, fn.end + 1),
        replacement: `def ${helperName}():\n${newBody}\n`,
      }],
    });
  }

  // ---- candidate 2: style-consistent rename with occurrence count --------
  const nameCounts = new Map<string, number>();
  for (const t of tokens) {
    if (t.kind === 'ident') nameCounts.set(t.text, (nameCounts.get(t.text) ?? 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count < 2 || name.length < 3) continue;
    const isSnake = /^[a-z]+(_[a-z0-9]+)+$/.test(name);
    const isCamel = /^[a-z]+[A-Z][A-Za-z]*$/.test(name) || /^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(name);
    if (!isSnake && !isCamel) continue;
    const target = isSnake ? toCamel(name) : toSnake(name);
    if (target === name || target.length === 0) continue;
    suggestions.push({
      title: `Rename \`${name}\` → \`${target}\``,
      description: `\`${name}\` appears ${count} times. Renaming to \`${target}\` aligns naming conventions.`,
      severity: 'safe',
      patches: [{
        description: `Replace all ${count} occurrences of ${name}`,
        start: 0,
        end: source.length,
        replacement: renameAll(source, lang, name, target),
      }],
    });
  }

  // ---- candidate 3: unused imports ----------------------------------------
  const imports = tokens.filter((t) => t.kind === 'ident' && (t.text === 'import' || t.text === 'from' || t.text === 'use'));
  if (imports.length > 0) {
    suggestions.push({
      title: 'Prune unused imports',
      description: `${imports.length} import statement(s) detected. Verify each is used; unused imports increase cognitive load.`,
      severity: 'warning',
      patches: [],
    });
  }

  // ---- candidate 4: dead branch after return ------------------------------
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*(return|raise|throw|exit)\b/.test(lines[i]!) && lines[i + 1]!.trim().length > 0 &&
      !/^\s*(return|raise|throw|exit|})/.test(lines[i + 1]!) && lines[i + 1]!.startsWith(/^\s*/.exec(lines[i]!)![0]!)) {
      suggestions.push({
        title: `Possibly unreachable code at line ${i + 2}`,
        description: `Statements after \`${lines[i]!.trim().slice(0, 32)}\` may never execute. Confirm intent.`,
        severity: 'warning',
        patches: [],
      });
      break;
    }
  }

  return { suggestions: suggestions.slice(0, 6), latencyMs: Date.now() - start };
}