/**
 * Swarm inline completions: debounced /api/completions calls, ghost text in
 * the editor, and a candidate picker (Tab = accept best, Esc = dismiss).
 */
import { api } from './api.js';

const DEBOUNCE_MS = 160;

export function initCompletions(editor, ui) {
  const menu = ui.ghostMenu;
  let timer = null;
  let seq = 0;
  let candidates = [];
  let dismissedAt = -1;

  editor.on('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void request(), DEBOUNCE_MS);
  });

  editor.dom.textarea.addEventListener('keydown', (e) => {
    if (candidates.length === 0) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      accept(candidates[0]);
    } else if (e.key === 'Escape') {
      dismissedAt = editor.caret;
      hide();
    }
  }, true); // capture: runs before the editor's own Tab handler

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.gm-item');
    if (!item) return;
    const c = candidates[Number(item.dataset.idx)];
    if (c) accept(c);
  });

  function hide() {
    candidates = [];
    menu.hidden = true;
    editor.showGhost(editor.caret, null);
  }

  function accept(c) {
    const caret = editor.caret;
    const start = Math.max(0, Math.min(c.replaceStart ?? caret, caret));
    editor.splice(start, caret, c.text);
    if (ui.sbVotes) ui.sbVotes.textContent = `⌥ ${lastVotes} votes · ${lastMs}ms`;
    hide();
  }

  let lastVotes = 0;
  let lastMs = 0;

  async function request() {
    const mySeq = ++seq;
    const source = editor.getValue();
    const caret = editor.caret;
    const prefix = wordBefore(source, caret);
    if (caret < 2 || prefix.length < 2 || dismissedAt === caret) { hide(); return; }
    if (!editor.filePath) { hide(); return; }

    try {
      const r = await api.completions({
        filePath: editor.filePath,
        lang: editor.lang,
        source,
        cursor: caret,
        topK: 5,
      });
      if (mySeq !== seq) return; // stale response
      lastVotes = r.votes ?? r.result?.votes ?? 0;
      lastMs = r.result?.latencyMs ?? 0;
      const list = (r.result?.candidates ?? [])
        .filter((c) => c.text && c.text.trim() && c.text !== prefix)
        .slice(0, 5);
      candidates = list;
      if (list.length === 0) { hide(); if (ui.sbVotes) ui.sbVotes.textContent = ''; return; }
      renderMenu(prefix);
      editor.showGhost(caret, ghostOf(list[0], prefix));
      if (ui.sbVotes) ui.sbVotes.textContent = `⌥ ${lastVotes} votes · ${lastMs}ms`;
    } catch {
      if (mySeq === seq) hide();
    }
  }

  function renderMenu(prefix) {
    menu.innerHTML = '';
    menu.append(
      Object.assign(document.createElement('div'), {
        className: 'gm-head',
        text: `SWARM COMPLETION — ${candidates.length} candidates`,
      }),
    );
    candidates.forEach((c, i) => {
      const shown = c.text.startsWith(prefix) ? c.text : prefix + c.text;
      menu.append(el('div', { class: 'gm-item', 'data-idx': String(i) },
        el('span', { class: 'kind', text: c.kind }),
        el('span', { text: shown }),
        el('span', { class: 'conf', text: `${Math.round((c.confidence ?? 0) * 100)}%` }),
      ));
    });
    menu.hidden = false;
  }

  function ghostOf(c, prefix) {
    return c.text.startsWith(prefix) ? c.text.slice(prefix.length) : c.text;
  }
}

function wordBefore(src, caret) {
  let i = caret;
  while (i > 0 && /[\w$.]/.test(src[i - 1])) i--;
  return src.slice(i, caret);
}
