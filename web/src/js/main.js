/** Hydra-IDE studio bootstrap — wires editor, explorer, panels, swarm view. */
import { api } from './api.js';
import { HydraSocket } from './ws.js';
import { Editor } from './editor.js';
import { initCompletions } from './completions.js';
import { initDiagnostics } from './diagnostics.js';
import { initExplorer } from './explorer.js';
import { initAssistant } from './assistant.js';
import { initPanels } from './panels.js';
import { initSwarm } from './swarm.js';
import { $, el, clear, fmtUptime, fmtBytes, langLabel } from './tools.js';

const ui = {
  code: $('#code'), pre: $('#highlight'), gutter: $('#gutter'), ghostMenu: $('#ghost-menu'),
  tabs: $('#tabs'), fileTree: $('#file-tree'), fileFilter: $('#file-filter'), btnNewFile: $('#btn-new-file'),
  symbolList: $('#symbol-list'), symbolSearch: $('#symbol-search'),
  issueList: $('#issue-list'), diagMeta: $('#diag-meta'),
  btnAnalyze: $('#btn-analyze'), btnAnalyze2: $('#btn-analyze2'),
  chatLog: $('#chat-log'), chatForm: $('#chat-form'), chatInput: $('#chat-input'),
  resolveForm: $('#resolve-form'), resolveInput: $('#resolve-input'), resolveResults: $('#resolve-results'),
  refactorResults: $('#refactor-results'), btnRefactor: $('#btn-refactor'),
  testsResults: $('#tests-results'), btnTests: $('#btn-tests'),
  logView: $('#log-view'), modelMeta: $('#model-meta'), btnRefreshLogs: $('#btn-refresh-logs'),
  swarmKpis: $('#swarm-kpis'), clusterCards: $('#cluster-cards'),
  agentGrid: $('#agent-grid'), taskFeed: $('#task-feed'),
  sbFile: $('#sb-file'), sbLang: $('#sb-lang'), sbDirty: $('#sb-dirty'), sbPos: $('#sb-pos'),
  sbIssues: $('#sb-issues'), sbVotes: $('#sb-votes'), btnSave: $('#btn-save'),
  wsDot: $('#ws-dot'),
  statBackend: $('#stat-backend'), statModel: $('#stat-model'),
  statAgents: $('#stat-agents'), statUptime: $('#stat-uptime'),
  btnViewEditor: $('#btn-view-editor'), btnViewSwarm: $('#btn-view-swarm'),
  editorView: $('#editor-view'), swarmView: $('#swarm-view'),
};

const ws = new HydraSocket();
const editor = new Editor({ textarea: ui.code, pre: ui.pre, gutter: ui.gutter });
initCompletions(editor, ui);
const diagnostics = initDiagnostics(editor, ui);
const explorer = initExplorer(ui, { onOpen, onDelete, onRename });
initAssistant(ui);
const panels = initPanels(ui, { currentPath: () => activePath, onOpen });
const swarm = initSwarm(ui);

/** Open tabs: {path, saved (last saved content), view (in-memory content)} */
const tabs = [];
const dirty = new Set();
let activePath = null;

editor.on('save', () => void save());
editor.on('input', () => {
  const tab = tabs.find((t) => t.path === activePath);
  if (tab) tab.view = editor.getValue();
  syncDirty(tab);
});
editor.on('cursor', ({ line, col }) => { ui.sbPos.textContent = `Ln ${line}, Col ${col}`; });

ui.btnSave.addEventListener('click', () => void save());

function syncDirty(tab) {
  const isDirty = !!tab && tab.view !== tab.saved;
  if (isDirty) dirty.add(activePath); else dirty.delete(activePath);
  ui.sbDirty.hidden = !isDirty;
  renderTabs();
}

async function onOpen(path, line) {
  if (!path) return;
  persistActive();
  let tab = tabs.find((t) => t.path === path);
  if (!tab) {
    try {
      const f = await api.file(path);
      if (f.error) { window.alert(`Cannot open ${path}: not found`); return; }
      tab = { path, saved: f.content, view: f.content };
      tabs.push(tab);
    } catch (err) {
      window.alert(`Open failed: ${err.message}`);
      return;
    }
  }
  activateTab(tab);
  if (line) editor.gotoLine(line);
  void diagnostics.run();
}

function persistActive() {
  const tab = tabs.find((t) => t.path === activePath);
  if (tab) tab.view = editor.getValue();
}

function activateTab(tab) {
  activePath = tab.path;
  editor.setFile(tab.path, tab.view);
  ui.sbFile.textContent = tab.path;
  ui.sbLang.textContent = langLabel(editor.lang);
  syncDirty(tab);
  explorer.setActive(tab.path);
  renderTabs();
}

function renderTabs() {
  clear(ui.tabs);
  for (const t of tabs) {
    const isDirty = dirty.has(t.path);
    ui.tabs.append(el('div', {
      class: `tab${t.path === activePath ? ' active' : ''}`,
      onclick: () => { persistActive(); activateTab(t); },
    },
      el('span', { text: t.path.split('/').pop() }),
      isDirty ? el('span', { class: 'dirty', text: '●' }) : null,
      el('button', {
        class: 'close', text: '×', title: 'close',
        onclick: (e) => { e.stopPropagation(); closeTab(t); },
      }),
    ));
  }
}

function closeTab(tab) {
  if (dirty.has(tab.path) && !window.confirm(`${tab.path} has unsaved changes. Close anyway?`)) return;
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  dirty.delete(tab.path);
  if (activePath === tab.path) {
    activePath = null;
    const next = tabs[idx] ?? tabs[idx - 1];
    if (next) activateTab(next);
    else {
      editor.setFile('', '');
      ui.sbFile.textContent = 'no file';
      ui.sbLang.textContent = '';
      ui.sbIssues.textContent = '';
      ui.sbDirty.hidden = true;
    }
  }
  renderTabs();
}

async function onDelete(path) {
  const tab = tabs.find((t) => t.path === path);
  if (tab) { dirty.delete(path); tabs.splice(tabs.indexOf(tab), 1); renderTabs(); }
  if (activePath === path) {
    const next = tabs[0];
    if (next) activateTab(next);
    else { activePath = null; editor.setFile('', ''); ui.sbFile.textContent = 'no file'; }
  }
}

async function onRename(from, to) {
  const tab = tabs.find((t) => t.path === from);
  if (tab) { tab.path = to; if (activePath === from) activateTab(tab); }
  renderTabs();
}

async function save() {
  if (!activePath) return;
  try {
    await api.saveFile(activePath, editor.getValue());
    const tab = tabs.find((t) => t.path === activePath);
    if (tab) tab.saved = editor.getValue();
    syncDirty(tab);
    void explorer.reload();
    void diagnostics.run();
  } catch (err) {
    window.alert(`Save failed: ${err.message}`);
  }
}
// ---------------- views + panels --------------------------------------------
ui.btnViewEditor.addEventListener('click', () => setView('editor'));
ui.btnViewSwarm.addEventListener('click', () => setView('swarm'));

function setView(v) {
  ui.editorView.hidden = v !== 'editor';
  ui.swarmView.hidden = v !== 'swarm';
  ui.btnViewEditor.classList.toggle('active', v === 'editor');
  ui.btnViewSwarm.classList.toggle('active', v === 'swarm');
}

for (const btn of document.querySelectorAll('.panel-tabs button')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.panel-tabs button')) b.classList.toggle('active', b === btn);
    for (const p of document.querySelectorAll('.panel')) {
      p.classList.toggle('active', p.id === `panel-${btn.dataset.panel}`);
    }
    if (btn.dataset.panel === 'output') panels.activate();
  });
}

// ---------------- websocket + topbar ----------------------------------------
ws.onStatus((s) => {
  ui.wsDot.className = `dot ${s === 'online' ? 'on' : 'off'}`;
  ui.wsDot.title = `WebSocket: ${s}`;
});

ws.on('telemetry', (msg) => {
  swarm.update(msg);
  const status = msg.status ?? {};
  const engine = status.engine ?? {};
  const model = status.model ?? {};
  ui.statBackend.innerHTML = `backend <b>${engine.backend ?? '—'}</b>`;
  ui.statModel.innerHTML = `model <b>${model.exists
    ? `${String(model.name ?? 'model')} · ${fmtBytes(model.sizeBytes)}`
    : 'neuralsim (no gguf)'}</b>`;
  ui.statAgents.innerHTML = `agents <b>${status.agents ?? (msg.agents?.length ?? 0)}</b>`;
  ui.statUptime.innerHTML = `uptime <b>${fmtUptime(status.uptimeS ?? 0)}</b>`;
});

ws.on('task', (msg) => swarm.pushTask(msg));

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void diagnostics.run(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
  }
});

// ---------------- boot --------------------------------------------------------
async function boot() {
  ws.connect();
  await explorer.reload();
  panels.activate();
  try {
    const { files } = await api.files();
    if (files?.length > 0) await onOpen(files[0].path);
  } catch { /* empty workspace is fine */ }
  // status.traces seeds the task feed once at startup
  try {
    const status = await api.status();
    swarm.update({ agents: status.clusters ? undefined : [], summary: status.summary, status });
    swarm.seedFromTraces(status.traces);
  } catch { /* router still warming up */ }
}

boot();

