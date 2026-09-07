/**
 * WebSocket hub — the realtime channel between the IDE / extension and the
 * swarm. Pushes telemetry + logs; accepts task commands (complete / chat /
 * analyze / refactor / tests) and streams their results back as messages.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { HydraOrchestrator } from './services/hydra.ts';
import type { HydraConfig } from './config.ts';
import type { HydraLogger } from './util/logger.ts';
import type { CompletionRequest } from './engine/types.ts';

export interface HubMessage {
  type: string;
  id?: number;
  [key: string]: unknown;
}

export class TelemetryHub {
  private server: WebSocketServer;
  private clients = new Set<WebSocket>();
  private seq = 0;
  private readonly orchid: HydraOrchestrator;
  private readonly cfg: HydraConfig;
  private readonly log: HydraLogger;

  constructor(
    orchid: HydraOrchestrator,
    cfg: HydraConfig,
    log: HydraLogger,
  ) {
    this.orchid = orchid;
    this.cfg = cfg;
    this.log = log;
    this.server = new WebSocketServer({ noServer: true });
  }

  /** Feed an upgraded HTTP request into the WS server. */
  acceptUpgrade(req: unknown, socket: unknown, head: unknown): void {
    this.server.handleUpgrade(req as never, socket as never, head as never, (ws) => {
      this.clients.add(ws);
      this.log.info(`WebSocket client connected (${this.clients.size} total).`);
      ws.on('close', () => {
        this.clients.delete(ws);
        this.log.info(`WebSocket client disconnected (${this.clients.size} left).`);
      });

      ws.on('message', (raw) => {
        void this.handleMessage(ws, raw);
      });

      ws.send(JSON.stringify({ type: 'hello', version: '1.0.0', agents: this.cfg.agents }));
      void this.push(ws, 'telemetry', this.snapshot());
    });
  }

  async handleMessage(ws: WebSocket, raw: unknown): Promise<void> {
    let msg: HubMessage;
    try {
      msg = JSON.parse((raw as Buffer).toString()) as HubMessage;
    } catch {
      return;
    }
    const id = msg.id;
    const ack = (type: string, payload: Record<string, unknown>) => {
      void this.push(ws, type, { ...payload, id });
    };

    try {
      switch (msg.type) {
        case 'complete': {
          const req = msg.request as CompletionRequest;
          const r = await this.orchid.complete(req);
          ack('completion', { candidates: r.result.candidates, latencyMs: r.result.latencyMs, votes: r.votes, traces: r.traces });
          void this.broadcast('task', { kind: 'completion', agent: 'alpha', votes: r.votes, latencyMs: r.result.latencyMs });
          break;
        }
        case 'chat': {
          const r = await this.orchid.chat(String(msg.prompt ?? ''), msg.filePath as string | undefined);
          ack('chat', { answer: r.answer, intent: r.intent, latencyMs: r.latencyMs });
          void this.broadcast('task', { kind: 'chat', agent: 'assistant', latencyMs: r.latencyMs });
          break;
        }
        case 'analyze': {
          const r = await this.orchid.analyze(msg.filePath as string);
          ack('analysis', { issues: r.result.issues, astNodes: r.result.astNodes, latencyMs: r.result.latencyMs, traces: r.traces });
          void this.broadcast('task', { kind: 'analysis', agent: 'beta', latencyMs: r.result.latencyMs });
          break;
        }
        case 'refactor': {
          const r = await this.orchid.refactor(String(msg.filePath ?? ''));
          ack('refactor', { suggestions: r.result.suggestions, latencyMs: r.result.latencyMs, traces: r.traces });
          void this.broadcast('task', { kind: 'refactor', agent: 'delta', latencyMs: r.result.latencyMs });
          break;
        }
        case 'tests': {
          const r = await this.orchid.tests(String(msg.filePath ?? ''));
          ack('tests', { tests: r.result.tests, latencyMs: r.result.latencyMs, traces: r.traces });
          void this.broadcast('task', { kind: 'tests', agent: 'delta', latencyMs: r.result.latencyMs });
          break;
        }
        case 'resolve': {
          const r = await this.orchid.resolve(String(msg.symbol ?? ''));
          ack('resolution', { refs: r.result.refs, latencyMs: r.result.latencyMs, traces: r.traces });
          break;
        }
        case 'ping':
          ack('pong', { at: Date.now() });
          break;
        default:
          ack('error', { message: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      ack('error', { message: String(err instanceof Error ? err.message : err) });
    }
  }

  snapshot(): Record<string, unknown> {
    const t = this.orchid.telemetry();
    return { agents: t.agents, summary: t.summary, status: this.orchid.status() };
  }

  private async push(ws: WebSocket, type: string, payload: Record<string, unknown>): Promise<void> {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
  }

  private async broadcast(type: string, payload: Record<string, unknown>): Promise<void> {
    const frame = JSON.stringify({ type, ...payload, seq: ++this.seq });
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        try { ws.send(frame); } catch { /* drop for dead sockets */ }
      }
    }
  }

  /** Periodic telemetry broadcast. */
  start(intervalMs: number): void {
    setInterval(() => {
      void this.broadcast('telemetry', this.snapshot());
    }, intervalMs);
  }

  stop(): void {
    for (const ws of this.clients) ws.close();
    this.clients.clear();
  }
}