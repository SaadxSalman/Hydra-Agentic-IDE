/** Tiny DOM + format helpers shared by all studio modules. */

export function $(sel) { return document.querySelector(sel); }

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function fmtUptime(s) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function langLabel(lang) {
  return { typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', rust: 'Rust', go: 'Go', css: 'CSS' }[lang] ?? lang ?? 'Plain';
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function emptyNote(node, text) {
  clear(node);
  node.append(el('div', { class: 'empty', text }));
}
