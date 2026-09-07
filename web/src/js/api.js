/** REST client for the hydra-router JSON API. */

async function handle(res) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const msg = body?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export const api = {
  health: () => fetch('/api/health').then(handle),
  status: () => fetch('/api/status').then(handle),
  telemetry: () => fetch('/api/telemetry').then(handle),
  model: () => fetch('/api/model').then(handle),
  logs: (n = 200) => fetch(`/api/logs?n=${n}`).then(handle),
  tasks: () => fetch('/api/tasks').then(handle),

  workspace: () => fetch('/api/workspace').then(handle),
  files: () => fetch('/api/workspace/files').then(handle),
  file: (path) => fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`).then(handle),
  suggestions: (prefix) => fetch(`/api/suggestions?prefix=${encodeURIComponent(prefix)}`).then(handle),
  symbols: (symbol) => fetch(`/api/symbols?symbol=${encodeURIComponent(symbol)}`).then(handle),

  saveFile: (path, content) =>
    fetch('/api/files/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) }).then(handle),
  createFile: (path, content = '') =>
    fetch('/api/files/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) }).then(handle),
  deleteFile: (path) =>
    fetch('/api/files/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).then(handle),
  renameFile: (from, to) =>
    fetch('/api/files/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) }).then(handle),

  completions: (payload) =>
    fetch('/api/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(handle),
  analyze: (path) =>
    fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).then(handle),
  resolve: (symbol) =>
    fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }).then(handle),
  refactor: (path) =>
    fetch('/api/refactor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).then(handle),
  tests: (path) =>
    fetch('/api/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).then(handle),
  chat: (prompt, filePath) =>
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, filePath }) }).then(handle),
};
