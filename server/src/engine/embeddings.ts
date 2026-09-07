/**
 * Lightweight embedding + retrieval math for the Hydra engine.
 * Implements a hashed n-gram vector space (a stand-in "continuous state"
 * representation) with cosine similarity. Used by Context Chunking (Gamma)
 * and the completion context ranker.
 *
 * When a real llama.cpp / LFM backend is attached, its embeddings replace
 * these through the same `embed()` interface.
 */

export interface Embedding {
  dim: number;
  values: number[];
}

const DIM = 96;
const NGRAMS = [1, 2, 3];

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h;
}

function hashToRange(h: number, range: number): number {
  return ((h % range) + range) % range;
}

export function hashEmbed(text: string): Embedding {
  const values = new Array<number>(DIM).fill(0);
  const normalized = text.toLowerCase().replace(/[\s]+/g, ' ').trim();

  for (const size of NGRAMS) {
    for (let i = 0; i <= normalized.length - size; i++) {
      const gram = normalized.slice(i, i + size);
      const h = fnv1a(gram);
      const idx = hashToRange(h, DIM);
      const sign = (h & 1) === 0 ? 1.0 : -1.0;
      values[idx] = (values[idx] ?? 0) + sign;
    }
  }

  // L2 normalize
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < values.length; i++) values[i] = (values[i] ?? 0) / norm;

  return { dim: DIM, values };
}

export function cosine(a: Embedding, b: Embedding): number {
  if (a.dim !== b.dim) return 0;
  let dot = 0;
  for (let i = 0; i < a.values.length; i++) dot += (a.values[i] ?? 0) * (b.values[i] ?? 0);
  return dot;
}

export interface VectorEmbedder {
  embed(text: string): Embedding;
}

export function makeHashEmbedder(): VectorEmbedder {
  return { embed: hashEmbed };
}