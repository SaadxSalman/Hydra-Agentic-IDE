/** Explorer: workspace tree with create/delete/rename + symbol search. */
import { api } from './api.js';
import { el, clear, emptyNote } from './tools.js';

export function initExplorer(ui, hooks) {
  let tree = [];
  let stats = { files: 0, lines: 0, bytes: 0 };
  const collapsed = new Set();
  let activePath = '';

  ui.btnNewFile.addEventListener('click', async () => {
    const path = window.prompt('New file path (e.g. src/utils.py):');
    if (!path) return;
    try {
      await api.createFile(path, `# ${path}\n`);
      await reload();
      hooks.onOpen(path);
    } catch (err) { window.alert(`Create failed: ${err.message}`); }
  });

  ui.fileFilter.addEventListener('input', render);
  ui.symbolSearch.addEventListener('input', () => void renderSymbols(ui.symbolSearch.value.trim()));

  async function reload() {
    try {
      const r = await api.workspace();
      tree = r.tree ?? [];
      stats = r.stats ?? stats;
      render();
    } catch (err) {
      emptyNote(ui.fileTree, `workspace error: ${err.message}`);
    }
  }

  function render() {
    const box = ui.fileTree;
    clear(box);
    const filter = ui.fileFilter.value.trim().toLowerCase();
    if (filter) {
      const flat = [];
      walk(tree, (node, depth) => { if (node.type === 'file') flat.push(node); });
      const hits = flat.filter((f) => f.path.toLowerCase().includes(filter));
      if (hits.length === 0) emptyNote(box, 'no matching files');
      for (const f of hits) box.append(fileNode(f, 0));
      return;
    }
    for (const node of tree) box.append(folderNode(node, 0));
  }

  function walk(nodes, cb, depth = 0) {
    for (const n of nodes ?? []) {
      cb(n, depth);
      if (n.children) walk(n.children, cb, depth + 1);
    }
  }

  function folderNode(node, depth) {
    const isCollapsed = collapsed.has(node.path);
    const row = el('div', {
      class: 'node folder',
      style: `padding-left:${10 + depth * 14}px`,
      onclick: () => { isCollapsed ? collapsed.delete(node.path) : collapsed.add(node.path); render(); },
    },
      el('span', { class: 'caret', text: isCollapsed ? '▸' : '▾' }),
      el('span', { text: node.name }),
    );
    const wrap = el('div', {}, row);
    if (!isCollapsed) for (const c of node.children ?? []) {
      wrap.append(c.type === 'folder' ? folderNode(c, depth + 1) : fileNode(c, depth + 1));
    }
    return wrap;
  }

  function fileNode(node, depth) {
    const ops = el('span', { class: 'ops' });
    const del = el('button', { class: 'mini', title: 'delete', text: '×' });
    const ren = el('button', { class: 'mini', title: 'rename', text: '✎' });
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete ${node.path}?`)) return;
      try { await api.deleteFile(node.path); hooks.onDelete(node.path); await reload(); }
      catch (err) { window.alert(`Delete failed: ${err.message}`); }
    });
    ren.addEventListener('click', async (e) => {
      e.stopPropagation();
      const to = window.prompt(`Rename ${node.path} to:`, node.path);
      if (!to || to === node.path) return;
      try { await api.renameFile(node.path, to); hooks.onRename(node.path, to); await reload(); }
      catch (err) { window.alert(`Rename failed: ${err.message}`); }
    });
    ops.append(ren, del);
    const row = el('div', {
      class: `node file${node.path === activePath ? ' active' : ''}`,
      style: `padding-left:${10 + depth * 14}px`,
      onclick: () => hooks.onOpen(node.path),
    },
      el('span', { class: 'ficon', text: '◦' }),
      el('span', { text: node.name }),
      ops,
    );
    return row;
  }

  async function renderSymbols(prefix) {
    const box = ui.symbolList;
    clear(box);
    if (!prefix) { emptyNote(box, 'type to search workspace symbols'); return; }
    try {
      const r = await api.suggestions(prefix);
      const syms = r.symbols ?? [];
      if (syms.length === 0) { emptyNote(box, 'no symbols match'); return; }
      for (const s of syms) {
        box.append(el('div', {
          class: 'sym',
          onclick: async () => {
            try {
              const res = await api.symbols(s);
              const ref = (res.refs ?? [])[0];
              if (ref) hooks.onOpen(ref.filePath, ref.line);
              else hooks.onOpen(undefined);
            } catch { hooks.onOpen(undefined); }
          },
        },
          el('span', { text: s }),
        ));
      }
    } catch (err) { emptyNote(box, `symbol lookup failed: ${err.message}`); }
  }

  function setActive(path) {
    activePath = path ?? '';
    render();
  }

  return { reload, setActive, get stats() { return stats; } };
}
