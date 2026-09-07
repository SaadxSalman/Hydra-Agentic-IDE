import type { LogLevel } from '../config.ts';

export type LogFn = (msg: string, ...meta: unknown[]) => void;

export interface HydraLogger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  /** Subscribe to every structured log record (used by the console panel + WebSocket). */
  onLog: (cb: (record: LogRecord) => void) => void;
  /** Most recent records (ring buffer). */
  recent: (n: number) => LogRecord[];
}

export interface LogRecord {
  ts: number;
  level: LogLevel;
  msg: string;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Timestamped, leveled logger with a ring buffer so the IDE console can
 * tail router logs in real time.
 */
export function makeLogger(level: LogLevel = 'info'): HydraLogger {
  const subscribers = new Set<(r: LogRecord) => void>();
  const ring: LogRecord[] = [];
  const minRank = LEVEL_RANK[level];

  function emit(lvl: LogLevel, msg: string) {
    if (LEVEL_RANK[lvl] < minRank) return;
    const rec: LogRecord = { ts: Date.now(), level: lvl, msg };
    ring.push(rec);
    if (ring.length > 2000) ring.shift();
    for (const cb of subscribers) {
      try { cb(rec); } catch { /* subscriber failure must not crash the router */ }
    }
    const line = `[${new Date(rec.ts).toISOString()}] [${lvl.toUpperCase().padEnd(5)}] ${msg}`;
    if (lvl === 'error') console.error(line);
    else console.log(line);
  }

  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
    onLog: (cb) => { subscribers.add(cb); },
    recent: (n) => ring.slice(-n),
  };
}