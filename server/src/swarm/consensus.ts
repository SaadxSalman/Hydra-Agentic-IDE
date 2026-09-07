/**
 * Consensus engine — weighted rank aggregation over agent completions.
 *
 * Each completion voter returns a ranked candidate list; Borda-style scores
 * are summed across voters, weighted by each voter's confidence. The merged
 * output is the final ranked candidate list the IDE shows.
 */

import type { CompletionCandidate } from '../engine/types.ts';

export interface Vote {
  agentId: string;
  cluster: 'alpha' | 'beta' | 'gamma' | 'delta';
  candidates: CompletionCandidate[];
}

export interface ConsensusResult {
  candidates: CompletionCandidate[];
  /** agreement ∈ [0,1]: how similar voters' top ranks were */
  agreement: number;
  votesCast: number;
  weightedScore: Record<string, number>;
}

const CLUSTER_WEIGHT: Record<string, number> = { alpha: 1.0, beta: 0.8, gamma: 0.65, delta: 0.5 };

/** Rank one voter's candidate list by confidence (assumed sorted). */
function normRank(c: CompletionCandidate): number {
  return Math.max(0.05, Math.min(1, c.confidence));
}

export function aggregateVotes(votes: Vote[], topK = 5): ConsensusResult {
  const scores = new Map<string, { candidate: CompletionCandidate; score: number }>();

  for (const vote of votes) {
    const weight = CLUSTER_WEIGHT[vote.cluster] ?? 1;
    const n = Math.max(1, vote.candidates.length);
    vote.candidates.forEach((cand, idx) => {
      const rankScore = (n - idx) / n;               // earlier rank → higher
      const conf = normRank(cand);
      const s = weight * (0.4 * rankScore + 0.6 * conf);
      const key = fullKey(cand);
      const prev = scores.get(key);
      if (prev) prev.score += s;
      else scores.set(key, { candidate: cand, score: s });
    });
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const totalScore = ranked.length > 0 ? ranked.reduce((a, r) => a + r.score, 0) : 1;

  // agreement = average fraction of voters that included each top candidate
  const top = ranked.slice(0, Math.max(1, topK));
  let supportSum = 0;
  for (const { candidate } of top) {
    const hits = votes.filter((v) => v.candidates.some((c) => c.text === candidate.text && c.replaceStart === candidate.replaceStart)).length;
    supportSum += hits;
  }
  const agreement = top.length > 0 ? supportSum / (top.length * Math.max(1, votes.length)) : 0;

  const candidates = top.map(({ candidate }) => ({ ...candidate }));
  const _ = totalScore; // kept for future score-space normalization

  return {
    candidates,
    agreement: Math.round(agreement * 100) / 100,
    votesCast: votes.length,
    weightedScore: Object.fromEntries(top.map(({ candidate, score }) => [candidate.text, Math.round(score * 100) / 100])),
  };
}

function fullKey(c: CompletionCandidate): string {
  return `${c.kind}|${c.text}|${c.replaceStart}`;
}

export function agreementOf(votes: Vote[]): number {
  return aggregateVotes(votes, 1).agreement;
}