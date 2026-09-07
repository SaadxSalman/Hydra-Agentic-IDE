/** WebSocket client with auto-reconnect + typed event dispatch. */

export class HydraSocket {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
    this.backoff = 500;
    this.status = 'connecting';
    this.statusHandlers = new Set();
  }

  on(type, cb) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(cb);
    return () => this.handlers.get(type)?.delete(cb);
  }

  onStatus(cb) { this.statusHandlers.add(cb); return () => this.statusHandlers.delete(cb); }

  emitStatus(s) {
    this.status = s;
    for (const cb of this.statusHandlers) { try { cb(s); } catch { /* ui only */ } }
  }

  connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}//${location.host}/ws`;
    try { this.ws = new WebSocket(url); } catch { return this.scheduleReconnect(); }

    this.ws.onopen = () => { this.backoff = 500; this.emitStatus('online'); };
    this.ws.onclose = () => { this.emitStatus('offline'); this.scheduleReconnect(); };
    this.ws.onerror = () => this.emitStatus('offline');
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      for (const cb of this.handlers.get(msg.type) ?? []) {
        try { cb(msg); } catch (err) { console.error('[ws handler]', err); }
      }
    };
  }

  scheduleReconnect() {
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 8000);
  }

  send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
    return this.ws?.readyState === 1;
  }
}
