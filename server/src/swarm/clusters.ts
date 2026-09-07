/** Cluster topology — the 4 agent clusters and their allocation budgets. */

export type ClusterKey = 'alpha' | 'beta' | 'gamma' | 'delta';

export interface ClusterSpec {
  key: ClusterKey;
  label: string;
  /** Target per-task latency budget in ms. */
  budgetMs: number;
  roles: string[];
  pct: number; // share of the total agent pool
}

export const CLUSTER_DEFS: ClusterSpec[] = [
  { key: 'alpha', label: 'Alpha', budgetMs: 8, roles: ['inline-completion', 'token-prediction'], pct: 30 },
  { key: 'beta', label: 'Beta', budgetMs: 25, roles: ['ast-inspection', 'type-inference'], pct: 25 },
  { key: 'gamma', label: 'Gamma', budgetMs: 50, roles: ['context-chunking', 'symbol-resolution'], pct: 25 },
  { key: 'delta', label: 'Delta', budgetMs: 120, roles: ['refactoring', 'test-synthesis'], pct: 20 },
];

/** Rebalance the agent pool according to cluster percentages. */
export function allocate(total: number): Record<ClusterKey, number> {
  const counts: Record<ClusterKey, number> = { alpha: 0, beta: 0, gamma: 0, delta: 0 };
  let assigned = 0;
  for (const def of CLUSTER_DEFS) {
    const n = Math.floor((total * def.pct) / 100);
    counts[def.key] = n;
    assigned += n;
  }
  // assign remainder round-robin to keep the exact total
  let i = 0;
  while (assigned < total) {
    const def = CLUSTER_DEFS[i % CLUSTER_DEFS.length]!;
    counts[def.key] += 1;
    assigned++;
    i++;
  }
  return counts;
}