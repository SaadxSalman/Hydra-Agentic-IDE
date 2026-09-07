/**
 * Context Chunking Pipeline (Gamma cluster).
 * Splits workspace files into line-range chunks and ranks them against a
 * query under a token budget — the "context window" fed to completion nodes.
 */

import { codeWords, countLines, detectLanguage } from './tokenizer.ts';
import { hashEmbed } from './embeddings.ts';
import type { Embedding } from './embeddings.ts';

export interface WorkspaceFile {
  path: string;
  content: string;
  mtime: number;
}

export interface Chunk {
  id: string;
  path: string;
  startLine: number; // 1-based inclusive
  endLine: number;   // 1-based inclusive
  text: string;
  score: number;
  embedding: Embedding;
}

export interface ChunkConfig {
  budgetTokens: number;      // ~4 chars per token
  maxChunkLines: number;
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = { budgetTokens: 4096, maxChunkLines: 120 };

function approximateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/**
 * Split one file into overlapping chunks.
 */
export function chunkFile(file: WorkspaceFile, cfg: ChunkConfig): Chunk[] {
  const lang = detectLanguage(file.path);
  const lines = file.content.split(/\r?\n/);
  const chunks: Chunk[] = [];
  const step = Math.max(1, Math.round(cfg.maxChunkLines / 2));

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + cfg.maxChunkLines);
    const text = lines.slice(start, end).join('\n');
    if (text.trim().length === 0) continue;
    chunks.push({
      id: `${file.path}#${start + 1}-${end}`,
      path: file.path,
      startLine: start + 1,
      endLine: end,
      text,
      score: 0,
      embedding: hashEmbed(text),
    });
    if (end >= lines.length) break;
  }

  if (chunks.length === 0) {
    chunks.push({
      id: `${file.path}#1-1`,
      path: file.path,
      startLine: 1,
      endLine: Math.max(1, lines.length),
      text: file.content,
      score: 0,
      embedding: hashEmbed(file.content),
    });
  }
  return chunks;
}

/**
 * Rank chunks from many files against a query, respecting the token budget.
 * Boosts: embedding similarity, recently-modified files, fewer total lines.
 */
export function retrieveContext(
  files: WorkspaceFile[],
  query: string,
  cfg: ChunkConfig = DEFAULT_CHUNK_CONFIG,
): Chunk[] {
  const qWords = new Set(codeWords(query, detectLanguage('query.ts')));
  const qEmbed = hashEmbed(query);

  const all: Chunk[] = [];
  for (const f of files) {
    for (const c of chunkFile(f, cfg)) {
      // lexical overlap boost
      let overlap = 0;
      const cWords = new Set(codeWords(c.text, detectLanguage(c.path)));
      for (const w of cWords) if (qWords.has(w)) overlap++;
      const sim = cosineSimilarity(qEmbed, c.embedding);
      const recencyBoost = Math.min(1.0, (Date.now() - f.mtime) / 86_400_000);
      const score = sim + overlap * 0.06 + recencyBoost * 0.05 - approximateTokens(c.text) / 10_000;
      c.score = score;
      all.push(c);
    }
  }

  all.sort((a, b) => b.score - a.score);

  const picked: Chunk[] = [];
  let used = 0;
  for (const c of all) {
    const cost = approximateTokens(c.text);
    if (used + cost > cfg.budgetTokens && picked.length > 0) break;
    picked.push(c);
    used += cost;
  }
  return picked.sort((a, b) => (a.startLine > b.startLine || (a.startLine === b.startLine && a.endLine > b.endLine)) ? 1 : -1);
}

function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.dim !== b.dim) return 0;
  let dot = 0;
  for (let i = 0; i < a.values.length; i++) dot += (a.values[i] ?? 0) * (b.values[i] ?? 0);
  return dot;
}

export function budgetEstimate(text: string): number {
  return approximateTokens(text);
}