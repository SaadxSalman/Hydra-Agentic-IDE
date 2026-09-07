/** Problems panel: swarm static analysis (Beta cluster) for the active file. */
import { api } from './api.js';
import { el, clear, emptyNote } from './tools.js';

export function initDiagnostics(editor, ui) {
  let issues = [];

  editor.on('cursor', () => { /* position updates handled by main */ });

  async function run() {
    if (!editor.filePath) { render([]); return; }
    try {
      const r = await api.analyze(editor.filePath);
      issues = r.result?.issues ?? [];
      render(issues);
      if (ui.diagMeta) {
        ui.diagMeta.textContent =
          `${issues.length} issue(s) · ast ${r.result?.astNodes ?? 0} nodes · ${r.result?.latencyMs ?? 0}ms`;
      }
      if (ui.sbIssues) {
        ui.sbIssues.textContent = issues.length > 0 ? `⚠ ${issues.length}` : '✓ clean';
      }
    } catch (err) {
      if (ui.diagMeta) ui.diagMeta.textContent = `analyze failed: ${err.message}`;
    }
  }

  function render(list) {
    editor.setIssues(list);
    const box = ui.issueList;
    clear(box);
    if (list.length === 0) { emptyNote(box, 'No problems — the swarm is happy.'); return; }
    for (const i of list) {
      box.append(el('div', {
        class: `issue ${i.severity}`,
        onclick: () => editor.gotoLine(i.line),
      },
        el('span', { class: 'sev', text: i.severity.toUpperCase() }),
        el('div', { class: 'body' },
          el('div', { class: 'm', text: i.message }),
          el('div', { class: 'loc', text: `${i.file}:${i.line}:${i.col}  ·  ${i.kind}` }),
          i.suggested ? el('div', { class: 'fix', text: `fix → ${i.suggested}` }) : null,
        ),
      ));
    }
  }

  ui.btnAnalyze?.addEventListener('click', run);
  ui.btnAnalyze2?.addEventListener('click', run);
  return { run, get issues() { return issues; } };
}
