/** Code editor: transparent textarea over a syntax-highlighted mirror. */
import { highlight, langFromPath } from './highlight.js';
import { el, clear, esc } from './tools.js';

export class Editor {
  /**
   * @param {{textarea: HTMLTextAreaElement, pre: HTMLElement, gutter: HTMLElement}} dom
   */
  constructor(dom) {
    this.dom = dom;
    this.filePath = '';
    this.lang = 'python';
    this.issues = [];
    this.listeners = { input: [], save: [], cursor: [] };
    this.ghostText = null; // {at, text}

    const ta = dom.textarea;
    ta.addEventListener('input', () => { this.refresh(); this.emit('input'); });
    ta.addEventListener('keydown', (e) => this.keydown(e));
    ta.addEventListener('scroll', () => this.syncScroll());
    ta.addEventListener('click', () => this.cursor());
    ta.addEventListener('keyup', () => this.cursor());
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta) this.cursor();
    });
    window.addEventListener('resize', () => this.refresh());
  }

  on(evt, cb) { this.listeners[evt]?.push(cb); }
  emit(evt, ...args) { for (const cb of this.listeners[evt] ?? []) cb(...args); }

  setFile(path, content) {
    this.filePath = path;
    this.lang = langFromPath(path);
    this.issues = [];
    this.ghostText = null;
    this.dom.textarea.value = content;
    this.refresh();
    this.cursor();
  }

  getValue() { return this.dom.textarea.value; }
  get caret() { return this.dom.textarea.selectionStart; }

  /** Replace [start, end) with text and place the caret after it. */
  splice(start, end, text, caretAfter = start + text.length) {
    const ta = this.dom.textarea;
    ta.setRangeText(text, start, end, 'end');
    ta.selectionStart = ta.selectionEnd = Math.min(caretAfter, ta.value.length);
    this.ghostText = null;
    this.refresh();
    this.cursor();
    this.emit('input');
  }

  gotoLine(line) {
    const ta = this.dom.textarea;
    const lines = ta.value.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) offset += lines[i].length + 1;
    ta.focus();
    const lineLen = lines[line - 1]?.length ?? 0;
    ta.selectionStart = offset;
    ta.selectionEnd = offset + lineLen;
    this.cursor();
    // scroll the target line into view
    const lh = 20;
    this.dom.textarea.scrollTop = Math.max(0, (line - 1) * lh - this.dom.textarea.clientHeight / 2);
    this.dom.pre.scrollTop = this.dom.textarea.scrollTop;
    this.syncScroll();
  }
  keydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.emit('save');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.emit('cursor');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = this.dom.textarea;
      if (ta.selectionStart !== ta.selectionEnd) {
        const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        this.splice(s, ta.selectionEnd, '  ');
      } else {
        this.splice(ta.selectionStart, ta.selectionEnd, '  ');
      }
    }
  }

  cursor() {
    const ta = this.dom.textarea;
    const upto = ta.value.slice(0, ta.selectionStart);
    const line = upto.split('\n').length;
    const col = upto.length - upto.lastIndexOf('\n');
    this.emit('cursor', { line, col });
  }

  setIssues(issues) {
    this.issues = issues ?? [];
    this.renderGutter();
  }

  showGhost(at, text) {
    this.ghostText = text ? { at, text } : null;
    this.renderHighlight();
  }

  syncScroll() {
    const ta = this.dom.textarea;
    this.dom.pre.scrollTop = ta.scrollTop;
    this.dom.pre.scrollLeft = ta.scrollLeft;
    this.dom.gutter.scrollTop = ta.scrollTop;
  }

  refresh() {
    this.renderHighlight();
    this.renderGutter();
    this.syncScroll();
  }

  renderHighlight() {
    const value = this.dom.textarea.value;
    const g = this.ghostText;
    if (g && g.at >= 0 && g.at <= value.length) {
      this.dom.pre.innerHTML =
        highlight(value.slice(0, g.at), this.lang) +
        `<span class="ghost">${esc(g.text)}</span>` +
        highlight(value.slice(g.at), this.lang);
    } else {
      this.dom.pre.innerHTML = highlight(value, this.lang) + '\n';
    }
  }

  renderGutter() {
    const count = this.dom.textarea.value.split('\n').length;
    const caretLine = this.dom.textarea.value.slice(0, this.caret).split('\n').length;
    const byLine = new Map();
    for (const i of this.issues) {
      const cur = byLine.get(i.line);
      const rank = { error: 3, warning: 2, info: 1, hint: 1 };
      if (!cur || (rank[i.severity] ?? 0) > (rank[cur] ?? 0)) byLine.set(i.line, i.severity);
    }
    const g = this.dom.gutter;
    clear(g);
    for (let i = 1; i <= count; i++) {
      const sev = byLine.get(i);
      g.append(el('div', {
        class: `ln${i === caretLine ? ' cur' : ''}${sev ? ` ${sev}` : ''}`,
        text: String(i),
      }));
    }
  }
}
