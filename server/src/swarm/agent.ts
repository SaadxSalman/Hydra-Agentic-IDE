/**
 * Swarm worker agent — one node of the LFM pool.
 * Each agent owns a serialized mailbox (like a tokio task), reports
 * telemetry, and applies a small latency jitter approximating its cluster
 * budget so the dashboard reflects real scheduling behavior.
 */

import type { ClusterKey } from './clusters.ts';

export type AgentTask<TPayload = unknown> = {
  id: string;
  cluster: ClusterKey;
  kind: string;
  payload: TPayload;
};

export interface AgentStats {
  id: string;
  cluster: ClusterKey;
  role: string;
  index: number;
  active: number;
  completed: number;
  backlog: number;
  avgLatencyMs: number;
  tokens: number;
  lastTaskKind: string;
  state: 'idle' | 'working';
}

export class WorkerAgent {
  readonly id: string;
  readonly cluster: ClusterKey;
  readonly role: string;
  readonly index: number;

  private mailbox: AgentTask[] = [];
  private activeCount = 0;
  private completedCount = 0;
  private latencies: number[] = [];
  private readonly budgetMs: number;

  constructor(index: number, cluster: ClusterKey, role: string, budgetMs: number) {
    this.index = index;
    this.cluster = cluster;
    this.role = role;
    this.budgetMs = Math.max(1, budgetMs);
    this.id = `agent-${cluster}-${String(index).padStart(3, '0')}`;
  }

  /** How much load this agent is under. */
  get load(): number {
    return this.mailbox.length + this.activeCount;
  }

  get isBusy(): boolean {
    return this.load > 2;
  }

  get backlog(): number {
    return Math.max(0, this.mailbox.length);
  }

  /**
   * Enqueue a task. Returns a promise that resolves with the task result
   * after simulating model inference (latency ≈ cluster budget + jitter).
   */
  enqueue<TPayload, TResult>(task: AgentTask<TPayload>, work: (payload: TPayload) => TResult | Promise<TResult>): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      this.mailbox.push({ ...task, kind: task.kind });
      void this.drain<TPayload, TResult>(task.id, work, resolve, reject);
    });
  }

  private async drain<TPayload, TResult>(
    taskId: string,
    work: (payload: TPayload) => TResult | Promise<TResult>,
    resolve: (v: TResult) => void,
    reject: (e: unknown) => void,
  ): Promise<void> {
    const task = this.mailbox.shift();
    if (!task) return;
    this.activeCount++;
    const started = Date.now();

    // inference simulation: budget-shaped latency with deterministic jitter
    const jitter = (taskId.charCodeAt(0) % 7) / 100;
    const wait = this.budgetMs * (0.35 + jitter);
    let result: TResult;
    try {
      result = await Promise.all([work(task.payload as TPayload), sleep(wait)]).then(([r]) => r);
    } catch (err) {
      this.activeCount--;
      reject(err);
      return;
    }

    const elapsed = Date.now() - started;
    this.latencies.push(elapsed);
    if (this.latencies.length > 200) this.latencies.shift();
    this.activeCount--;
    this.completedCount++;
    resolve(result);
  }

  telemetry(): AgentStats {
    const avg = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;
    return {
      id: this.id,
      cluster: this.cluster,
      role: this.role,
      index: this.index,
      active: this.activeCount,
      completed: this.completedCount,
      backlog: this.backlog,
      avgLatencyMs: Math.round(avg * 100) / 100,
      tokens: this.completedCount * 8,
      lastTaskKind: this.lastKind,
      state: this.activeCount > 0 ? 'working' : 'idle',
    };
  }

  private lastKind = '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}