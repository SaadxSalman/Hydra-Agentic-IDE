/**
 * HTTP REST router for the Hydra-IDE backend.
 * Serves the JSON API, static IDE build (web/dist) and upgrades WebSockets.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { HydraConfig } from './config.ts';
import type { HydraLogger } from './util/logger.ts';
import { HydraOrchestrator } from './services/hydra.ts';
import { TelemetryHub } from './ws.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

export class HydraHttpServer {
  private readonly server: ReturnType<typeof createServer>;
  private readonly cfg: HydraConfig;
  private readonly orchid: HydraOrchestrator;
  private readonly log: HydraLogger;
  private readonly hub: TelemetryHub;
  private readonly webDist: string;

  constructor(
    cfg: HydraConfig,
    orchid: HydraOrchestrator,
    log: HydraLogger,
    hub: TelemetryHub,
    webDist: string,
  ) {
    this.cfg = cfg;
    this.orchid = orchid;
    this.log = log;
    this.hub = hub;
    this.webDist = webDist;
    this.server = createServer((req, res) => void this.route(req, res));
  }

  listen(): void {
    this.server.listen(this.cfg.port, this.cfg.host, () => {
      this.log.info(`Hydra Router listening on http://${this.cfg.host}:${this.cfg.port}`);
      if (!this.cfg.dev) {
        if (webExists(this.webDist)) this.log.info(`Web IDE served from ${this.webDist}`);
        else this.log.info('Web IDE not built — run `npm run build -w web` or use `npm run dev` (vite).');
      }
    });
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${this.cfg.host}`);
    const p = url.pathname;

    if (p === '/ws' && (req.headers.upgrade ?? '').toLowerCase() === 'websocket') {
      this.hub.acceptUpgrade(req, res.socket ?? undefined, Buffer.alloc(0));
      return;
    }

    if (this.cfg.dev) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') {
        res.writeHead(204); res.end(); return;
      }
    }

    try {
      if (p.startsWith('/api/')) { await this.api(req, res, p, url); return; }
      await this.static(p, req, res);
    } catch (err) {
      this.json(res, 500, { error: String(err instanceof Error ? err.message : err) });
    }
  }

  private async api(req: IncomingMessage, res: ServerResponse, p: string, url: URL): Promise<void> {
    const json = (body: unknown, code = 200) => this.json(res, code, body);
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);

    switch (true) {
      case p === '/api/health': return json({ ok: true, service: 'hydra-router', version: 1, time: Date.now() });
      case p === '/api/status': return json(this.orchid.status());
      case p === '/api/telemetry': return json(this.orchid.telemetry());
      case p === '/api/agents': return json({ agents: this.orchid.telemetry().agents });
      case p === '/api/model': return json(this.orchid.status().model);
      case p === '/api/logs': return json({ logs: this.log.recent(200) });
      case p === '/api/tasks': return json({ traces: this.orchid.status().traces });
      case p === '/api/workspace': return json({ tree: this.orchid.workspace.tree(), stats: this.orchid.workspace.stats() });
      case p === '/api/workspace/file': return json(this.orchid.workspace.get(url.searchParams.get('path') ?? '') ?? { error: 'not found' }, 404);
      case p === '/api/workspace/files': return json({ files: this.orchid.workspace.list() });
      case p === '/api/suggestions': return json({ symbols: this.orchid.suggestions(url.searchParams.get('prefix') ?? '') });
      case p === '/api/symbols': return json({ refs: this.orchid.symbols(url.searchParams.get('symbol') ?? '') });

      case p === '/api/files/save' && req.method === 'POST':
        return json({ saved: this.orchid.workspace.write(String(body.path ?? ''), String(body.content ?? '')) });
      case p === '/api/files/create' && req.method === 'POST':
        return json({ created: this.orchid.workspace.write(String(body.path ?? ''), String(body.content ?? '')) });
      case p === '/api/files/delete' && req.method === 'POST':
        return json({ deleted: this.orchid.workspace.delete(String(body.path ?? '')) });
      case p === '/api/files/rename' && req.method === 'POST':
        return json({ renamed: this.orchid.workspace.rename(String(body.from ?? ''), String(body.to ?? '')) });

      case p === '/api/completions' && req.method === 'POST': {
        const r = await this.orchid.complete({
          filePath: String(body.filePath ?? 'untitled.ts'),
          lang: String(body.lang ?? 'typescript'),
          source: String(body.source ?? ''),
          cursor: Number(body.cursor ?? 0),
          context: Array.isArray(body.context) ? body.context : [],
          topK: Number(body.topK ?? 5),
        });
        return json(r);
      }
      case p === '/api/analyze' && req.method === 'POST':
        return json(await this.orchid.analyze(body.path as string | undefined));
      case p === '/api/resolve' && req.method === 'POST':
        return json(await this.orchid.resolve(String(body.symbol ?? '')));
      case p === '/api/refactor' && req.method === 'POST':
        return json(await this.orchid.refactor(String(body.path ?? '')));
      case p === '/api/tests' && req.method === 'POST':
        return json(await this.orchid.tests(String(body.path ?? '')));
      case p === '/api/chat' && req.method === 'POST':
        return json(await this.orchid.chat(String(body.prompt ?? ''), body.filePath as string | undefined));

      default: return json({ error: 'route not found', path: p }, 404);
    }
  }

  // ------------------------------------------------------------------ static
  private async static(p: string, _req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!webExists(this.webDist)) {
      this.json(res, 200, {
        service: 'hydra-router', ok: true,
        notice: 'Web IDE not built yet. Run `npm run build -w web` then reload, or use `npm run dev`.',
        endpoints: '/api/health /api/status /api/telemetry /api/model /api/workspace /api/completions /api/analyze /api/refactor /api/tests /api/chat /api/logs /ws',
      });
      return;
    }
    let rel = p === '/' || p === '/index.html' ? 'index.html' : p.replace(/^\/+/, '');
    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(this.webDist, rel);
    try {
      const data = await readFile(full);
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      // try index.html as fallback for unknown asset routes
      try {
        const data = await readFile(path.join(this.webDist, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      } catch {
        this.json(res, 404, { error: 'not found' });
      }
    }
  }

  private json(res: ServerResponse, code: number, body: unknown): void {
    const data = JSON.stringify(body ?? {});
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
    res.end(data);
  }

  stop(): void { this.server.close(); }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    chunks.push(buf);
    size += buf.length;
    if (size > 1_000_000) throw new Error('payload too large');
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
  } catch {
    throw new Error('invalid JSON body');
  }
}

let _webExistsDist: string | null = null;
export function webExists(dist: string): boolean {
  if (_webExistsDist === dist) return true;
  try {
    if (existsSync(path.join(dist, 'index.html'))) {
      _webExistsDist = dist;
      return true;
    }
  } catch { /* ignore */ }
  return false;
}