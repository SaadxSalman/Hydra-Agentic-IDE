/**
 * Swarm Dispatcher & Router — routes DAG tasks to least-loaded agents
 * (power-of-two load balancing), matching the "ultra-fast IPC router"
 * described in the Hydra architecture.
 */

import { WorkerAgent } from './agent.ts';
import type { AgentTask, AgentStats } from './agent.ts';
import { allocate } from './clusters.ts';
import type { ClusterKey } from './clusters.ts';
import { CLUSTER_DEFS } from './clusters.ts';

export class SwarmDispatcher {
  private agents: WorkerAgent[] = [];
  private byCluster: Record<ClusterKey, WorkerAgent[]> = { alpha: [], beta: [], gamma: [], delta: [] };
  private swaps = 0;

  /** Spawn the agent pool. */
  spawn(total: number): void {
    const counts = allocate(total);
    let idx = 0;
    for (const def of CLUSTER_DEFS) {
      for (let i = 0; i < counts[def.key]; i++) {
        const agent = new WorkerAgent(idx++, def.key, def.roles[idx % def.roles.length] ?? def.roles[0]!, def.budgetMs);
        this.agents.push(agent);
        this.byCluster[def.key]!.push(agent);
      }
    }
  }

  get size(): number {
    return this.agents.length;
  }

  get countByCluster(): Record<ClusterKey, number> {
    return {
      alpha: this.byCluster.alpha.length,
      beta: this.byCluster.beta.length,
      gamma: this.byCluster.gamma.length,
      delta: this.byCluster.delta.length,
    };
  }

  /** Pick the least-loaded agent in a cluster (single probe + compare). */
  private pick(cluster: ClusterKey): WorkerAgent {
    const pool = this.byCluster[cluster]!;
    if (pool.length === 0) throw new Error(`No agents for cluster ${cluster}`);
    let a = pool[fastRand() % pool.length]!;
    let b = pool[fastRand() % pool.length]!;
    if (b.load < a.load) {
      const t = a;
      a = b;
      b = t;
      this.swaps++;
    }
    return a;
  }

  /**
   * Dispatch a task to an agent of `cluster`. The `work` fn is executed on
   * the agent after its queue drains (serialized mailbox semantics).
   */
  dispatch<TPayload, TResult>(
    cluster: ClusterKey,
    kind: string,
    payload: TPayload,
    work: (payload: TPayload) => TResult | Promise<TResult>,
  ): Promise<TResult> {
    const agent = this.pick(cluster);
    const task: AgentTask<TPayload> = {
      id: `task-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      cluster,
      kind,
      payload,
    };
    return agent.enqueue(task, work);
  }

  /** Broadcast a task to EVERY agent of a cluster (used at warm-up). */
  async broadcast<TPayload, TResult>(
    cluster: ClusterKey,
    payload: TPayload,
    work: (payload: TPayload) => TResult | Promise<TResult>,
  ): Promise<TResult[]> {
    return Promise.all(this.byCluster[cluster]!.map((agent) =>
      agent.enqueue({ id: `bcast-${Date.now()}-${agent.id}`, cluster, kind: 'warmup', payload }, work)));
  }

  telemetry(): AgentStats[] {
    return this.agents.map((a) => a.telemetry());
  }

  summary(): { activeAgents: number; totalCompleted: number; idle: number; working: number; swaps: number } {
    const all = this.telemetry();
    return {
      activeAgents: all.length,
      totalCompleted: all.reduce((a, t) => a + t.completed, 0),
      idle: all.filter((t) => t.state === 'idle').length,
      working: all.filter((t) => t.state === 'working').length,
      swaps: this.swaps,
    };
  }
}

function fastRand(): number {
  return Math.floor(Math.random() * 0xffff);
}

export type { AgentTask };