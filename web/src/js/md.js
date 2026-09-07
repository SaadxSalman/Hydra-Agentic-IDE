/** Minimal safe Markdown renderer for chat bubbles (no dependencies). */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => s.replace(/[&<>"']/g, (ch) => ESC[ch]);

/** Inline pass: code spans, bold, italic — input must already be escaped. */
function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
}

/**
 * Render a small but useful Markdown subset to HTML:
 * fenced code blocks, `code`, **bold**, *italic*, - lists, 1. lists,
 * > blockquotes, # headings, --- rules. Everything is HTML-escaped first,
 * so model/agent output can never inject markup.
 */
export function renderMarkdown(src) {
  const text = String(src ?? '');

  // 1) Pull out fenced code blocks as placeholders (escape their body once).
  const blocks = [];
  const withPlaceholders = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_m, code) => {
    blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  // 2) Block-level line pass.
  const out = [];
  let para = [];
  let list = null;
  let quote = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushQuote = () => { if (quote) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = null; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of withPlaceholders.split('\n')) {
    const line = raw.trimEnd();
    const ph = /^\u0000(\d+)\u0000$/.exec(line.trim());
    if (ph) { flushAll(); out.push(blocks[Number(ph[1])]); continue; }
    if (line.trim() === '') { flushAll(); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const lvl = Math.min(6, h[1].length + 2);
      out.push(`<h${lvl}>${inline(escapeHtml(h[2]))}</h${lvl}>`);
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara(); flushQuote();
      if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(escapeHtml(ul[1]))}</li>`);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara(); flushQuote();
      if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(escapeHtml(ol[1]))}</li>`);
      continue;
    }
    const qt = /^>\s?(.*)$/.exec(line);
    if (qt) { flushPara(); flushList(); if (!quote) quote = []; quote.push(escapeHtml(qt[1])); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }

    flushList(); flushQuote();
    para.push(escapeHtml(line));
  }
  flushAll();
  return out.join('');
}
