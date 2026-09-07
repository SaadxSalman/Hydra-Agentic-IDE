/**
 * NeuralSim static analysis head (Beta cluster: AST inspection, type-checking).
 * Deterministic rule-based linting over the token stream + line model.
 * Issue codes follow the HYD-NNNN scheme exposed over the /api/analyze endpoint.
 */

import { tokenize } from './tokenizer.ts';
import type { Language, Token } from './tokenizer.ts';
import type { AnalyzeRequest, AnalyzeResult, Issue } from './types.ts';

const HYD = (code: number) => `HYD-${code}`;

interface Rule {
  run(file: string, source: string, lang: Language, tokens: Token[]): Issue[];
}

/** Identifiers we assume are provided by the runtime/stdlib. */
const BUILTINS = new Set([
  'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'sum', 'min', 'max',
  'abs', 'round', 'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'type',
  'isinstance', 'getattr', 'setattr', 'hasattr', 'open', 'require', 'console', 'Promise',
  'Math', 'String', 'Object', 'Array', 'Number', 'JSON', 'panic', 'format', 'printf', 'logger',
  'os', 'sys', 'json', 'io', 'fs', 'path', 'unittest', 'pytest', 'datetime', 're', 'typing',
  'Iterable', 'Optional', 'List', 'Dict', 'describe', 'it', 'expect', 'test', 'beforeEach',
  'afterEach', 'module', 'exports', 'window', 'document', 'process', 'Buffer', 'fn',
]);

const RULES_CORE: Rule[] = [
  {
    // ---- undefined identifiers (light scope model) -----------------------
    run(file, source, lang, tokens) {
      const issues: Issue[] = [];
      const defined = new Set<string>();
      const used = new Map<string, { line: number; col: number }>();

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]!;
        if (t.kind !== 'ident') continue;
        const prev = i > 0 ? tokens[i - 1]!.text : '';
        const next = i + 1 < tokens.length ? tokens[i + 1]!.text : '';
        const name = t.text;

        const isDecl = prev === 'def' || prev === 'fn' || prev === 'function' || prev === 'func' ||
          prev === 'class' || prev === 'interface' || prev === 'struct' || prev === 'enum' ||
          prev === 'trait' || prev === 'let' || prev === 'var' || prev === 'const' ||
          (lang === 'python' && next === '=' && source.slice(t.end, t.end + 2) !== '=') ||
          (lang === 'rust' && (prev === 'let' || prev === 'struct'));

        if (isDecl) {
          defined.add(name);
          continue;
        }
        if (['self', '_', 'this', 'super', 'true', 'false', 'None', 'null', 'undefined'].includes(name)) continue;
        if (!used.has(name)) used.set(name, { line: t.line, col: t.col });
      }

      for (const [name, pos] of used) {
        if (defined.has(name) || BUILTINS.has(name) || name.startsWith('_') || name.length < 2) continue;
        issues.push({
          file, line: pos.line, col: pos.col, severity: 'warning',
          code: HYD(1001), kind: 'undefined-identifier',
          message: `Identifier \`${name}\` is used but never defined in this scope.`,
        });
      }
      return issues;
    },
  },
  {
    // ---- unused variables -------------------------------------------------
    run(file, source, _lang, tokens) {
      const issues: Issue[] = [];
      const declared = new Map<string, { line: number; name: string }>();
      const count = new Map<string, number>();

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]!;
        if (t.kind !== 'ident') continue;
        const prev = i > 0 ? tokens[i - 1]!.text : '';
        const assigned = source.slice(t.end, t.end + 1) === '=' && source.slice(t.end, t.end + 2) !== '=';
        if ((prev === 'let' || prev === 'var' || prev === 'const') || assigned) {
          declared.set(t.text, { line: t.line, name: t.text });
        }
        if (declared.has(t.text)) count.set(t.text, (count.get(t.text) ?? 0) + 1);
      }

      for (const [name, pos] of declared) {
        const seen = count.get(name) ?? 0;
        if (seen <= 1 && !['i', 'j', 'k', 'e', 'x', 'err', 'ex'].includes(name)) {
          issues.push({
            file, line: pos.line, col: 0, severity: 'hint',
            code: HYD(1002), kind: 'unused-variable',
            message: `Variable \`${name}\` is declared but never used.`,
            suggested: `Remove it or prefix with \`_\` to silence HYD-1002.`,
          });
        }
      }
      return issues;
    },
  },
];

const TOKEN_BASED: Rule[][] = [RULES_CORE];

export function analyzeFile(req: AnalyzeRequest): AnalyzeResult {
  const start = Date.now();
  const { filePath, lang, source } = req;
  const rawTokens = tokenize(source, lang);
  const tokens = rawTokens.filter(
    (t) => t.kind !== 'whitespace' && t.kind !== 'newline' && t.kind !== 'comment',
  );
  const issues: Issue[] = [];

  for (const rule of RULES_CORE) {
    try {
      issues.push(...rule.run(filePath, source, lang, tokens));
    } catch { /* a failing rule must not abort analysis */ }
  }

  useLineChecks(filePath, lang, source, issues);

  issues.sort((a, b) => (a.line > b.line || (a.line === b.line && a.col > b.col)) ? 1 : -1);
  return { issues: issues.slice(0, 250), astNodes: rawTokens.length, latencyMs: Date.now() - start };
}

/**
 * Line-based checks: length, TODO markers, security smells, semicolons,
 * redundant comparisons.
 */
function useLineChecks(filePath: string, lang: Language, source: string, issues: Issue[]): void {
  const lines = source.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const text = lines[ln]!;
    const lineNo = ln + 1;

    if (text.length > 120) {
      issues.push({ file: filePath, line: lineNo, col: 120, severity: 'info', code: HYD(2001), kind: 'style',
        message: `Line is ${text.length} chars (limit 120). Consider wrapping.` });
    }

    const todo = /TODO|FIXME|HACK|XXX/.exec(text);
    if (todo && !text.trim().startsWith('//') && !text.trim().startsWith('#') && !text.trim().startsWith('/*')) {
      issues.push({ file: filePath, line: lineNo, col: text.indexOf(todo[0]!), severity: 'info', code: HYD(2002), kind: 'todo',
        message: `In-progress work marker: ${todo[0]}` });
    }

    const sec = /\b(eval|exec|shell\s*=\s*True|os\.system)\b/.exec(text);
    if (sec) {
      issues.push({ file: filePath, line: lineNo, col: text.indexOf(sec[0]!), severity: 'warning', code: HYD(3001), kind: 'security',
        message: `Security smell: \`${sec[0]}\` can execute arbitrary input. Validate and sandbox.`,
        suggested: 'Prefer parameterized APIs and an allowlist.' });
    }

    if (/^\s*except\s*:/.test(text)) {
      issues.push({ file: filePath, line: lineNo, col: 0, severity: 'warning', code: HYD(3002), kind: 'bare-except',
        message: 'Bare `except:` swallows KeyboardInterrupt and SystemExit. Catch a specific exception.',
        suggested: 'except ValueError as exc:' });
    }

    if (lang === 'typescript' || lang === 'javascript') {
      const meaningful = text.replace(/\/\/.*$/, '').trim();
      const stmt = /^(const|let|var|return|import|export|throw|await)\b/.test(meaningful);
      const clamped = meaningful.length === 0 || meaningful.endsWith(';') || meaningful.endsWith('{') ||
        meaningful.endsWith('}') || meaningful.endsWith('(') || meaningful.includes(';') || !meaningful.endsWith(':');
      if (stmt && !clamped) {
        issues.push({ file: filePath, line: lineNo, col: meaningful.length, severity: 'hint', code: HYD(2003), kind: 'missing-semicolon',
          message: 'Statement missing trailing semicolon (style).', suggested: ';' });
      }
    }

    if (/===\s*true\b|==\s*true\b/.test(text) || /===\s*false\b|==\s*false\b/.test(text)) {
      issues.push({ file: filePath, line: lineNo, col: 0, severity: 'hint', code: HYD(2004), kind: 'suspicious-comparison',
        message: 'Comparison against a boolean literal is redundant.', suggested: 'Use the expression directly.' });
    }
  }
}

export { TOKEN_BASED };