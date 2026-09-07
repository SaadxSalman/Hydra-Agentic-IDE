/**
 * In-memory IDE workspace: files + folders + symbol indexes.
 * Seeded with a sample project so the IDE is usable immediately.
 */

import type { WorkspaceFile } from '../engine/chunker.ts';
import { indexFile } from '../engine/neuralsim_resolve.ts';
import type { IndexEntry } from '../engine/neuralsim_resolve.ts';
import { detectLanguage } from '../engine/tokenizer.ts';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

export const SAMPLE_FILES: Record<string, string> = {
  'src/main.py': `"""Hydra sample — main entrypoint."""
import json
import os
from typing import Optional

from hydra_core.broker import TaskBroker
from hydra_core.swarm import SwarmNode


def load_config(path: str) -> dict:
    """Load a JSON configuration file."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


class HydraRunner:
    """Orchestrates the 100-agent local swarm."""

    def __init__(self, agents: int, model_path: Optional[str] = None):
        self.agents = agents
        self.model_path = model_path
        self.broker = TaskBroker()
        self.swarm = SwarmNode(count=agents, backend="neuralsim")

    def start(self):
        self.swarm.spawn()
        for task in self.broker.drain():
            self.swarm.dispatch(task)
        return self.swarm.summary()


def main() -> None:
    config = load_config("hydra.json")
    runner = HydraRunner(agents=config.get("agents", 100))
    report = runner.start()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
`,
  'src/hydra_core/broker.py': `"""Task broker: DAG scheduling + consensus aggregation."""
from collections import deque
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class Task:
    id: str
    cluster: str
    payload: dict
    deps: list[str] = field(default_factory=list)


class TaskBroker:
    """Thread-safe task queue with dependency-aware dispatch."""

    def __init__(self):
        self._queue: deque[Task] = deque()
        self._lock = Lock()

    def submit(self, task: Task):
        with self._lock:
            self._queue.append(task)

    def drain(self):
        with self._lock:
            ready, self._queue = list(self._queue), deque()
        return ready

    def size(self):
        with self._lock:
            return len(self._queue)
`,
  'src/hydra_core/swarm.py': `"""Swarm node pool: spawns 100 concurrent worker agents."""
import threading
import time
from dataclasses import dataclass, field


@dataclass
class SwarmNode:
    count: int = 100
    backend: str = "neuralsim"
    latencies_ms: list[float] = field(default_factory=list)

    def spawn(self):
        """Spawn a pool of worker threads (one per agent)."""
        for i in range(self.count):
            threading.Thread(target=self._worker, args=(i,), daemon=True).start()

    def _worker(self, idx: int):
        while True:
            time.sleep(0.001)

    def dispatch(self, task):
        self.latencies_ms.append(1.0)

    def summary(self) -> dict:
        return {"agents": self.count, "backend": self.backend}
`,
  'src/hydra_core/consensus.py': `"""Consensus engine: weighted rank aggregation over agent votes."""


def aggregate(votes: list[list[str]]) -> list[str]:
    """Borda-style aggregation of ranked candidate lists."""
    scores: dict[str, float] = {}
    n = len(votes) or 1
    for ranked in votes:
        weight = 1.0 / len(ranked) if ranked else 0.0
        for rank, item in enumerate(ranked):
            scores[item] = scores.get(item, 0.0) + (len(ranked) - rank) * weight
    return [item for item, _ in sorted(scores.items(), key=lambda kv: -kv[1])]
`,
  'src/web/app.ts': `// Hydra sample — browser IDE entry point.
export interface ClusterState {
  key: string;
  agents: number;
  budgetMs: number;
  avgLatencyMs: number;
}

export class SwarmSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;

  constructor(url = \`ws://\${location.host}:8214/ws\`) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
  }

  onTelemetry(cb: (state: ClusterState[]) => void): void {
    this.ws?.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'telemetry') cb(msg.clusters);
    });
  }
}
`,
  'worker.ts': `// Hydra sample — Node worker pool (tokio-style tasks).
export interface Task {
  id: string;
  cluster: 'alpha' | 'beta' | 'gamma' | 'delta';
  payload: Record<string, unknown>;
}

export class WorkerPool {
  private readonly workers: number;

  constructor(workers = 100) {
    this.workers = workers;
  }

  async dispatch<T>(task: Task, handler: (t: Task) => Promise<T>): Promise<T> {
    void this.workers;
    return handler(task);
  }
}
`,
  'hydra.json': `{
  "name": "hydra-sample-workspace",
  "agents": 100,
  "backend": "neuralsim",
  "clusters": {
    "alpha": { "agents": 30, "budgetMs": 8, "roles": ["completion"] },
    "beta": { "agents": 25, "budgetMs": 25, "roles": ["ast", "types"] },
    "gamma": { "agents": 25, "budgetMs": 50, "roles": ["context", "imports"] },
    "delta": { "agents": 20, "budgetMs": 120, "roles": ["refactor", "tests"] }
  }
}
`,
  'README.md': `# Hydra sample workspace

This workspace was seeded by the Hydra Router so you can explore the IDE
immediately — completions, static analysis, symbol resolution, refactors
and test synthesis all run locally against these files.

> Tip: open \`src/hydra_core/broker.py\`, place the cursor at the end of a
> line and start typing — the Alpha completion cluster responds instantly.
`,
};

export class Workspace {
  private files = new Map<string, WorkspaceFile>();
  private indexCache = new Map<string, IndexEntry[]>();
  private listeners = new Set<(path: string, action: 'write' | 'delete') => void>();
  private readonly searchRoot: string;

  constructor(searchRoot = 'workspace') {
    this.searchRoot = searchRoot;
  }

  seed(): void {
    for (const [path, content] of Object.entries(SAMPLE_FILES)) {
      this.write(path, content);
    }
  }

  list(): WorkspaceFile[] {
    return [...this.files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  get(path: string): WorkspaceFile | undefined {
    return this.files.get(normalize(path));
  }

  write(path: string, content: string): WorkspaceFile {
    const key = normalize(path);
    const file = this.files.get(key);
    const next: WorkspaceFile = file
      ? { ...file, content, mtime: Date.now() }
      : { path: key, content, mtime: Date.now() };
    this.files.set(key, next);
    this.indexCache.set(key, indexFile(key, content));
    this.emit(key, 'write');
    return next;
  }

  delete(path: string): boolean {
    const key = normalize(path);
    const removed = this.files.delete(key);
    this.indexCache.delete(key);
    if (removed) this.emit(key, 'delete');
    return removed;
  }

  rename(from: string, to: string): boolean {
    const f = this.get(from);
    if (!f) return false;
    this.delete(from);
    this.write(to, f.content);
    return true;
  }

  tree(): TreeNode[] {
    const root: TreeNode = { name: this.searchRoot, path: this.searchRoot, type: 'folder', children: [] };
    for (const path of [...this.files.keys()].sort()) {
      const parts = path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const name = parts[i]!;
        const childPath = parts.slice(0, i + 1).join('/');
        if (!node.children) node.children = [];
        let child = node.children.find((c) => c.name === name);
        if (!child) {
          child = { name, path: childPath, type: isLast ? 'file' : 'folder', ...(isLast ? {} : { children: [] }) };
          node.children.push(child);
        }
        node = child;
      }
    }
    return [root];
  }

  stats(): { files: number; lines: number; bytes: number } {
    let lines = 0;
    let bytes = 0;
    for (const f of this.files.values()) {
      lines += f.content.split('\n').length;
      bytes += f.content.length;
    }
    return { files: this.files.size, lines, bytes };
  }

  /** Global symbol index query (exact symbol matches only). */
  findSymbol(symbol: string): IndexEntry[] {
    const out: IndexEntry[] = [];
    for (const entries of this.indexCache.values()) {
      for (const e of entries) if (e.symbol === symbol) out.push(e);
    }
    return out;
  }

  suggestions(search: string, limit = 30): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const entries of this.indexCache.values()) {
      for (const e of entries) {
        if (e.symbol.startsWith(search) && !seen.has(e.symbol)) {
          seen.add(e.symbol);
          out.push(e.symbol);
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  onChange(cb: (path: string, action: 'write' | 'delete') => void): void {
    this.listeners.add(cb);
  }

  private emit(path: string, action: 'write' | 'delete'): void {
    for (const cb of this.listeners) {
      try { cb(path, action); } catch { /* listener errors ignored */ }
    }
  }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

export { detectLanguage, indexFile };