/** Tool panels: symbol resolution, refactoring, test synthesis, output/console. */
import { api } from './api.js';
import { el, clear, emptyNote, fmtBytes } from './tools.js';

export function initPanels(ui, hooks) {
  // ---- symbol resolution -------------------------------------------------
  ui.resolveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const symbol = ui.resolveInput.value.trim();
    const box = ui.resolveResults;
    if (!symbol) return;
    clear(box); box.append(el('div', { class: 'empty', text: 'resolving across workspace…' }));
    try {
      const r = await api.resolve(symbol);
      clear(box);
      const refs = r.result?.refs ?? [];
      if (refs.length === 0) { emptyNote(box, `no references found for “${symbol}”`); return; }
      for (const ref of refs) {
        box.append(el('div', {
          class: 'item',
          onclick: () => hooks.onOpen(ref.filePath, ref.line),
          style: 'cursor:pointer',
        },
          el('div', { class: 't', text: `${ref.kind} · ${ref.symbol} · score ${ref.score.toFixed(2)}` }),
          el('div', { class: 'd', text: `${ref.filePath}:${ref.line}:${ref.col}` }),
          ref.snippet ? el('pre', { text: ref.snippet }) : null,
        ));
      }
    } catch (err) { clear(box); emptyNote(box, `resolve failed: ${err.message}`); }
  });

  // ---- refactoring --------------------------------------------------------
  ui.btnRefactor.addEventListener('click', async () => {
    const box = ui.refactorResults;
    clear(box); box.append(el('div', { class: 'empty', text: 'delta cluster is thinking…' }));
    try {
      const r = await api.refactor(hooks.currentPath());
      clear(box);
      const sug = r.result?.suggestions ?? [];
      if (sug.length === 0) { emptyNote(box, 'no refactor suggestions — file looks tidy'); return; }
      for (const s of sug) {
        box.append(el('div', { class: 'item' },
          el('div', { class: 't', text: `${s.severity} · ${s.title}` }),
          el('div', { class: 'd', text: s.description }),
          ...(s.patches ?? []).map((p) => el('pre', { text: p.replacement ?? '' })),
        ));
      }
    } catch (err) { clear(box); emptyNote(box, `refactor failed: ${err.message}`); }
  });

  // ---- test synthesis -----------------------------------------------------
  ui.btnTests.addEventListener('click', async () => {
    const box = ui.testsResults;
    clear(box); box.append(el('div', { class: 'empty', text: 'synthesizing tests…' }));
    try {
      const r = await api.tests(hooks.currentPath());
      clear(box);
      const tests = r.result?.tests ?? [];
      if (tests.length === 0) { emptyNote(box, 'no testable functions found in this file'); return; }
      for (const t of tests) {
        box.append(el('div', { class: 'item' },
          el('div', { class: 't', text: `${t.framework} · ${t.name}` }),
          el('div', { class: 'd', text: `target: ${t.target}` }),
          el('pre', { text: t.code }),
        ));
      }
    } catch (err) { clear(box); emptyNote(box, `test synthesis failed: ${err.message}`); }
  });

  // ---- output / logs / model ----------------------------------------------
  async function loadOutput() {
    try {
      const [logsR, model] = await Promise.all([api.logs(), api.model()]);
      const view = ui.logView;
      clear(view);
      const logs = logsR.logs ?? [];
      if (logs.length === 0) emptyNote(view, 'no log records yet');
      for (const l of logs.slice(-200)) {
        view.append(el('div', { class: `l ${l.level}` },
          el('span', { class: 'ts', text: new Date(l.ts).toLocaleTimeString() }),
          el('span', { class: 'lvl', text: l.level.toUpperCase() }),
          el('span', { text: l.msg }),
        ));
      }
      const m = model ?? {};
      ui.modelMeta.textContent = m.exists
        ? `${m.name ?? m.path?.split(/[\\/]/).pop()} · ${m.format} v${m.version ?? '?'} · ${m.architecture ?? '?'} · ${fmtBytes(m.sizeBytes)} · ctx ${m.contextLength ?? '?'} · ${m.quantization ?? '?'}`
        : 'model file not found — NeuralSim engine active';
    } catch (err) {
      ui.modelMeta.textContent = `output error: ${err.message}`;
    }
  }

  ui.btnRefreshLogs.addEventListener('click', loadOutput);

  function activate() { loadOutput(); }

  return { activate, loadOutput };
}
