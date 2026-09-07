/**
 * Hydra-IDE Swarm Bridge for VS Code.
 * Talks to a running hydra-router over its REST API:
 *   - inline completions (Alpha cluster, consensus-ranked)
 *   - "Ask the Swarm" assistant chat
 *   - static analysis diagnostics for the active file (Beta cluster)
 *   - live swarm telemetry in the status bar
 */
const vscode = require('vscode');

let statusItem;
let pollTimer = null;

function cfg() { return vscode.workspace.getConfiguration('hydra'); }
function endpoint() { return (cfg().get('endpoint') || 'http://127.0.0.1:8214').replace(/\/+$/, ''); }

async function post(path, body) {
  const res = await fetch(`${endpoint()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`hydra-router ${path} -> HTTP ${res.status}`);
  return res.json();
}

async function get(path) {
  const res = await fetch(`${endpoint()}${path}`);
  if (!res.ok) throw new Error(`hydra-router ${path} -> HTTP ${res.status}`);
  return res.json();
}

function activate(context) {
  const channel = vscode.window.createOutputChannel('Hydra Swarm');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = 'hydra.status';
  statusItem.text = '$(zap) hydra';
  statusItem.show();
  context.subscriptions.push(statusItem, channel);

  // ---- inline completions -------------------------------------------------
  let timer = null;
  const provider = {
    async provideInlineCompletionItems(document, position, _ctx, token) {
      const debounce = Number(cfg().get('debounceMs') ?? 180);
      if (debounce > 0) {
        await new Promise((r) => { if (timer) clearTimeout(timer); timer = setTimeout(r, debounce); });
      }
      if (token.isCancellationRequested) return undefined;

      const prefix = document.getText(
        new vscode.Range(position.with({ character: Math.max(0, position.character - 40) }), position),
      );
      if (prefix.trim().length < 2) return undefined;
      const offset = document.offsetAt(position);

      try {
        const r = await post('/api/completions', {
          filePath: vscode.workspace.asRelativePath(document.uri),
          lang: document.languageId,
          source: document.getText(),
          cursor: offset,
          topK: 3,
        });
        const best = (r.result?.candidates ?? [])[0];
        if (!best || !best.text) return undefined;
        const replaceStart = Math.max(0, Math.min(best.replaceStart ?? offset, offset));
        const startPos = document.positionAt(replaceStart);
        return [new vscode.InlineCompletionItem(best.text, new vscode.Range(startPos, position))];
      } catch {
        return undefined; // router offline — stay silent
      }
    },
  };
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider),
  );

  // ---- commands -------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('hydra.ask', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Ask the Hydra swarm (status, security, performance, explain…)',
        placeHolder: 'e.g. review my security',
      });
      if (!prompt) return;
      const ed = vscode.window.activeTextEditor;
      channel.appendLine(`> ${prompt}`);
      try {
        const r = await post('/api/chat', {
          prompt,
          filePath: ed ? vscode.workspace.asRelativePath(ed.document.uri) : undefined,
        });
        channel.appendLine(`[${r.intent ?? 'chat'} · ${r.latencyMs ?? 0}ms] ${r.answer}`);
        channel.show(true);
      } catch (err) {
        void vscode.window.showErrorMessage(`Hydra: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('hydra.analyze', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) { void vscode.window.showWarningMessage('Hydra: open a file first.'); return; }
      const path = vscode.workspace.asRelativePath(ed.document.uri);
      try {
        const r = await post('/api/analyze', { path });
        const issues = r.result?.issues ?? [];
        if (issues.length === 0) {
          void vscode.window.showInformationMessage('Hydra: no problems found.');
          return;
        }
        channel.appendLine(`analysis of ${path} (${r.result.latencyMs}ms):`);
        for (const i of issues) {
          channel.appendLine(`  ${i.severity.toUpperCase()} ${i.code} ${path}:${i.line}:${i.col} — ${i.message}`);
        }
        channel.show(true);
      } catch (err) {
        void vscode.window.showErrorMessage(`Hydra: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('hydra.status', async () => {
      try {
        const s = await get('/api/status');
        const model = s.model?.exists ? s.model.name : 'neuralsim';
        void vscode.window.showInformationMessage(
          `Hydra swarm: ${s.agents} agents · engine ${s.engine?.backend} · model ${model} · ` +
          `${s.completionsServed} completions · uptime ${s.uptimeS}s`,
        );
      } catch (err) {
        void vscode.window.showErrorMessage(`Hydra: router unreachable (${err.message})`);
      }
    }),
  );

  // ---- status bar telemetry ---------------------------------------------------
  async function poll() {
    try {
      const t = await get('/api/telemetry');
      const agents = t.agents ?? [];
      const working = agents.filter((a) => a.state === 'working').length;
      statusItem.text = `$(zap) ${working}/${agents.length} agents`;
      statusItem.tooltip = `Hydra swarm — ${working} working · ${endpoint()}`;
    } catch {
      statusItem.text = '$(circle-slash) hydra offline';
    }
  }
  pollTimer = setInterval(poll, Number(cfg().get('statusPollMs') ?? 3000));
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
}

function deactivate() { /* timers disposed via subscriptions */ }

module.exports = { activate, deactivate };
