/** Lightweight multi-language syntax highlighter (plain regex, no deps). */

const KEYWORDS = {
  python: 'def class return if elif else for while import from as with try except finally raise lambda pass break continue global nonlocal yield assert del in is not and or None True False async await match case self print len range',
  typescript: 'function return if else for while do switch case break continue const let var class extends new this super import export from default try catch finally throw typeof instanceof async await yield static get set of in delete void null undefined true false interface type enum implements private public protected readonly namespace declare as satisfies console',
  javascript: 'function return if else for while do switch case break continue const let var class extends new this super import export from default try catch finally throw typeof instanceof async await yield static get set of in delete void null undefined true false console',
  rust: 'fn let mut const static struct enum trait impl for while loop if else match return break continue use pub mod crate self super where async move ref as in dyn unsafe extern type Some None Ok Err',
  go: 'func package import var const type struct interface map chan go defer if else for range switch case default return break continue select fallthrough goto nil true false make new len cap append',
  css: 'important media supports keyframes import from to and not only',
};

const DEF_KEYWORDS = new Set(['def', 'class', 'fn', 'function', 'func', 'struct', 'enum', 'trait', 'impl', 'mod', 'type', 'interface']);

const cache = new Map();

function buildRe(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const pyComment = lang === 'python' ? '#[^\\n]*|' : '';
  const re = new RegExp(
    `("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)` +
    `|(${pyComment}//[^\\n]*|/\\*[\\s\\S]*?\\*/)` +
    `|(@[A-Za-z_][\\w.]*)` +
    `|(\\b\\d[\\w.]*)` +
    `|([A-Za-z_$][\\w$]*)`,
    'g',
  );
  cache.set(lang, re);
  return re;
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

/**
 * Highlight `source` for `lang`; returns HTML.
 * If `caret` is provided, returns [html, splitAt] with the ghost insertion
 * point handled by the caller (tokens never span the caret for word boundaries).
 */
export function highlight(source, lang) {
  const kw = new Set((KEYWORDS[lang] ?? KEYWORDS.typescript).split(' '));
  const defKw = DEF_KEYWORDS;
  const re = buildRe(lang);
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let lastDef = false;
  let m;
  while ((m = re.exec(source)) !== null) {
    out += escapeHtml(source.slice(last, m.index));
    last = m.index + m[0].length;
    const [full, str, comment, decorator, num, ident] = m;
    if (str) { out += `<span class="s">${escapeHtml(str)}</span>`; lastDef = false; }
    else if (comment) { out += `<span class="c">${escapeHtml(comment)}</span>`; lastDef = false; }
    else if (decorator) { out += `<span class="d">${escapeHtml(decorator)}</span>`; lastDef = false; }
    else if (num) { out += `<span class="n">${escapeHtml(num)}</span>`; lastDef = false; }
    else if (ident) {
      if (lastDef) { out += `<span class="f">${escapeHtml(ident)}</span>`; lastDef = false; }
      else if (kw.has(ident) || defKw.has(ident)) {
        out += `<span class="k">${escapeHtml(ident)}</span>`;
        lastDef = defKw.has(ident);
      } else { out += escapeHtml(ident); lastDef = false; }
    } else { out += escapeHtml(full); }
  }
  out += escapeHtml(source.slice(last));
  return out;
}

const EXT_LANG = {
  py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript',
  cjs: 'javascript', jsx: 'javascript', rs: 'rust', go: 'go', css: 'css', json: 'typescript',
  md: 'python', txt: 'python', yml: 'python', yaml: 'python', toml: 'python',
};

export function langFromPath(path) {
  const ext = String(path).split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'python';
}
