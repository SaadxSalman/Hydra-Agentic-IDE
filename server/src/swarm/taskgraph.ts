/**
 * DAG task graph — dependency-aware swarm execution.
 * Nodes are micro-cognitive tasks (parse → chunk → predict → vote → rank);
 * ready nodes run in parallel; results merge downstream.
 */

import type { ClusterKey } from './clusters.ts';

export interface TaskNode {
  id: string;
  cluster: ClusterKey;
  kind: string;
  dependsOn: string[];
  run: (inputs: Map<string, unknown>) => unknown | Promise<unknown>;
  meta?: Record<string, unknown>;
}

export interface GraphResult {
  nodeOutputs: Map<string, unknown>;
  durationMs: number;
  executedNodes: number;
}

export const graphNow = Date.now;

/**
 * Execute a DAG: repeatedly run all nodes whose deps are satisfied.
 * Parallelism is cooperative (Node async). Returns merged outputs.
 */
export async function executeGraph(nodes: TaskNode[]): Promise<GraphResult> {
  const started = Date.now();
  const outputs = new Map<string, unknown>();
  const done = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  while (done.size < nodes.length) {
    const ready = nodes.filter((n) =>
      !done.has(n.id) && n.dependsOn.every((d) => done.has(d) || !byId.has(d)));

    if (ready.length === 0) {
      // cycle or missing dep guard
      throw new Error('DAG stalled: no ready nodes (cycle or missing dependency)');
    }

    const results = await Promise.all(ready.map(async (n) => {
      const inputs = new Map<string, unknown>();
      for (const dep of n.dependsOn) {
        if (outputs.has(dep)) inputs.set(dep, outputs.get(dep)!);
      }
      const out = await Promise.resolve(n.run(inputs));
      return { id: n.id, out };
    }));

    for (const r of results) {
      outputs.set(r.id, r.out);
      done.add(r.id);
    }
  }

  return { nodeOutputs: outputs, durationMs: Date.now() - started, executedNodes: nodes.length };
}

/** Small builder helpers for typed tasks. */
export function node(
  id: string,
  cluster: ClusterKey,
  kind: string,
  run: (inputs: Map<string, unknown>) => unknown | Promise<unknown>,
  dependsOn: string[] = [],
): TaskNode {
  return { id, cluster, kind, dependsOn, run };
}