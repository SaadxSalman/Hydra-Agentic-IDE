/**
 * Language-aware lexer used across the Hydra engine.
 * Produces a stream of tokens with kinds, used by:
 *  - NeuralSim sequence predictions (token n-gram "liquid state" memory)
 *  - AST-lite static analysis (Beta cluster)
 *  - Symbol/import resolution (Gamma cluster)
 *  - Refactor/test synthesis (Delta cluster)
 */

export type TokenKind =
  | 'ident'
  | 'keyword'
  | 'number'
  | 'string'
  | 'comment'
  | 'punct'
  | 'whitespace'
  | 'newline'
  | 'unknown';

export interface Token {
  text: string;
  kind: TokenKind;
  line: number; // 1-based
  col: number;  // 0-based
  offset: number;
  end: number;
}

export type Language =
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'rust'
  | 'go'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'text';

const LANGUAGES: readonly Language[] = [
  'python', 'typescript', 'javascript', 'rust', 'go', 'json', 'html', 'css', 'markdown', 'text',
];

/** Coerce arbitrary input (e.g. a raw client/VS Code languageId) into a known Language. */
export function parseLanguage(value: unknown, fallback: Language = 'text'): Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
    ? value as Language
    : fallback;
}

const KEYWORDS: Record<Language, ReadonlySet<string>> = {
  python: new Set([
    'def', 'class', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while',
    'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'lambda', 'with', 'try',
    'except', 'finally', 'raise', 'yield', 'async', 'await', 'global', 'nonlocal', 'pass',
    'break', 'continue', 'del', 'assert', 'match', 'case',
  ]),
  typescript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'new', 'class', 'interface', 'extends', 'implements', 'type',
    'enum', 'public', 'private', 'protected', 'static', 'readonly', 'abstract', 'async', 'await',
    'import', 'from', 'export', 'default', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
    'in', 'of', 'void', 'never', 'null', 'undefined', 'true', 'false', 'this', 'super', 'keyof',
    'delete', 'yield', 'namespace', 'declare',
  ]),
  javascript: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'new', 'class', 'extends', 'export', 'default', 'import', 'from',
    'try', 'catch', 'finally', 'throw', 'typeof', 'in', 'of', 'void', 'null', 'undefined', 'true',
    'false', 'this', 'super', 'delete', 'yield', 'async', 'await',
  ]),
  rust: new Set([
    'fn', 'let', 'const', 'mut', 'pub', 'use', 'mod', 'struct', 'enum', 'impl', 'trait', 'type',
    'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'move', 'ref', 'static', 'async',
    'await', 'true', 'false', 'Self', 'self', 'where', 'in', 'as', 'break', 'continue',
    'unsafe', 'extern', 'crate', 'super', 'try', 'yield',
  ]),
  go: new Set([
    'package', 'import', 'func', 'var', 'const', 'return', 'if', 'else', 'for', 'while', 'switch',
    'case', 'break', 'continue', 'struct', 'class', 'interface', 'enum', 'new', 'type', 'true',
    'false', 'nil', 'and', 'or', 'not', 'in', 'def', 'pass', 'match', 'default', 'defer', 'goto',
  ]),
  json: new Set(['true', 'false', 'null']),
  html: new Set([
    '!DOCTYPE', 'html', 'head', 'body', 'div', 'span', 'script', 'style', 'link', 'meta',
    'title', 'p', 'a', 'img',
  ]),
  css: new Set(['import', 'charset', 'namespace', 'media', 'supports', 'layer', 'document', 'font-face', 'keyframes']),
  markdown: new Set(['import', 'code', 'sql', 'json', 'text', 'bash']),
  text: new Set<string>(),
};

const SINGLE_CHARS = '(){}[];,.:+-*/%<>=!&|^~?@#`\'"\\';
const SINGLE_SET = new Set(SINGLE_CHARS.split(''));

const LINE_COMMENT: Partial<Record<Language, string>> = {
  python: '#',
  typescript: '//',
  javascript: '//',
  rust: '//',
  go: '//',
};

const BLOCK_COMMENT: Partial<Record<Language, [string, string]>> = {
  typescript: ['/*', '*/'],
  javascript: ['/*', '*/'],
  rust: ['/*', '*/'],
  go: ['/*', '*/'],
  css: ['/*', '*/'],
};

export function detectLanguage(path: string): Language {
  const parts = path.split('.');
  const ext = parts.length > 0 ? parts[parts.length - 1]!.toLowerCase() : '';
  switch (ext) {
    case 'py': case 'pyw': return 'python';
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'json': return 'json';
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'md': case 'markdown': return 'markdown';
    default: return 'text';
  }
}

export function tokenize(source: string, lang: Language = 'text'): Token[] {
  const tokens: Token[] = [];
  const kw = KEYWORDS[lang] ?? KEYWORDS.text;
  const lineComment = LINE_COMMENT[lang];
  const blockComment = BLOCK_COMMENT[lang];
  let i = 0;
  const n = source.length;
  let line = 1;
  let lineStart = 0;

  function push(kind: TokenKind, start: number, end: number) {
    if (end <= start) return;
    const text = source.slice(start, end);
    tokens.push({ text, kind, line, col: start - lineStart, offset: start, end });
  }

  while (i < n) {
    const c = source[i] ?? '';

    if (c === '\n') {
      push('newline', i, i + 1);
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      const s = i;
      while (i < n && (source[i] === ' ' || source[i] === '\t' || source[i] === '\r')) i++;
      push('whitespace', s, i);
      continue;
    }
    if (lineComment && c === lineComment) {
      const s = i;
      while (i < n && source[i] !== '\n') i++;
      push('comment', s, i);
      continue;
    }
    if (blockComment && c === blockComment[0] && source.startsWith(blockComment[0], i)) {
      const s = i;
      const close = blockComment[1];
      const openLen = blockComment[0].length;
      i += openLen;
      while (i < n && !source.startsWith(close, i)) {
        if (source[i] === '\n') { line++; lineStart = i + 1; }
        i++;
      }
      i = Math.min(i + close.length, n);
      push('comment', s, i);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const s = i;
      const quote = c;
      i++;
      let escaped = false;
      while (i < n) {
        const ch = source[i];
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) { i++; break; }
        else if (ch === '\n') { line++; lineStart = i + 1; }
        i++;
      }
      push('string', s, i);
      continue;
    }
    if (lang === 'python' && (source.startsWith('"""', i) || source.startsWith("'''", i))) {
      const s = i;
      const delim = source.slice(i, i + 3);
      i += 3;
      while (i < n && !source.startsWith(delim, i)) {
        if (source[i] === '\n') { line++; lineStart = i + 1; }
        i++;
      }
      i = Math.min(i + 3, n);
      push('string', s, i);
      continue;
    }
    if (/[A-Za-z_$@]/.test(c)) {
      const s = i;
      while (i < n && /[A-Za-z0-9_$?!]/.test(source.charAt(i))) i++;
      if (lang === 'rust') {
        while (i < n && /[A-Za-z0-9_]/.test(source.charAt(i))) i++;
      }
      // guarantee forward progress (e.g. a lone `@`)
      if (i === s) {
        i++;
        push('unknown', s, i);
        continue;
      }
      const word = source.slice(s, i);
      let kind: TokenKind = kw.has(word) ? 'keyword' : 'ident';
      if (word === 'async' && lang !== 'rust') {
        const rest = source.slice(i, i + 4);
        if (rest === ' fn ' || rest === ' def') { kind = 'keyword'; i += 4; }
        else kind = 'keyword';
      }
      push(kind, s, i);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && i + 1 < n && /[0-9]/.test(source.charAt(i + 1)))) {
      const s = i;
      while (i < n && /[0-9a-fA-FxXoObB_.]/.test(source.charAt(i))) i++;
      if (i < n && (source[i] === 'e' || source[i] === 'E')) {
        i++;
        if (i < n && (source[i] === '+' || source[i] === '-')) i++;
        while (i < n && /[0-9]/.test(source.charAt(i))) i++;
      }
      push('number', s, i);
      continue;
    }
    if (SINGLE_SET.has(c)) {
      const s = i;
      const two = source.slice(i, i + 2);
      const three = source.slice(i, i + 3);
      if (['===', '!==', '**=', '<<=', '>>='].includes(three)) i += 3;
      else if (['=>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=',
        '%=', '??', '?.', '::', '->', ':=', '|>', '<<', '>>'].includes(two)) i += 2;
      else i += 1;
      push('punct', s, i);
      continue;
    }
    const s = i;
    i++;
    push('unknown', s, i);
  }
  return tokens;
}

export function linesOf(source: string): string[] {
  return source.split(/\r?\n/);
}

/** Words extracted from code (for embedding + retrieval). */
export function codeWords(source: string, lang: Language = 'text'): string[] {
  const out: string[] = [];
  let prev = '';
  for (const t of tokenize(source, lang)) {
    if (t.kind === 'ident' || t.kind === 'keyword') {
      if (t.text !== prev) out.push(t.text);
      prev = t.text;
    }
  }
  return out;
}

/**
 * Build an n-gram transition map (the NeuralSim "liquid state" memory).
 * key = sequence of (n-1) token texts; value = list of successor tokens.
 */
export function ngrams(tokens: Token[], n: number): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i <= tokens.length - n; i++) {
    const key = tokens.slice(i, i + n - 1).map((t) => t.text).join(' ');
    const next = tokens[i + n - 1]!.text;
    const bucket = map.get(key);
    if (bucket) bucket.push(next);
    else map.set(key, [next]);
  }
  return map;
}

export function countLines(source: string): number {
  if (source.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') n++;
  return n;
}