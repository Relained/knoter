/**
 * Normalize BM25 raw score to [0, 1].
 * FTS5 returns negative values (more negative = better).
 * Formula: pos / (1 + pos) where pos = -raw
 */
export { normalizeBM25 } from "../stores/meta-store";

/** Default fusion weight: 80% semantic, 20% keyword */
export const DEFAULT_ALPHA = 0.80;

/**
 * Linear score fusion.
 * final = alpha * vecScore + (1 - alpha) * bm25Norm
 */
export function linearFusion(vecScore: number, bm25Norm: number, alpha: number = DEFAULT_ALPHA): number {
  return alpha * vecScore + (1 - alpha) * bm25Norm;
}

export interface FusedResult {
  chunkId: string;
  noteId: string;
  content: string;
  filePath: string;
  title: string | null;
  heading: string | null;
  headingPath: string | null;
  tags: string[];
  createdAt: string | null;
  seqIndex: number;
  score: number;
  scoreDetail: {
    semantic?: number;
    keyword?: number;
    fused: number;
    rerank?: number;
  };
}

/**
 * Strong-signal shortcut check.
 * After fusion, if top result shows clear winner, skip LLM stages.
 * Condition: top * (top - second) >= 0.06 AND top >= 0.40
 * Single result above 0.40 also qualifies.
 */
export function isStrongSignal(scores: number[]): boolean {
  if (scores.length === 0) return false;
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0];
  if (top < 0.40) return false;
  if (sorted.length === 1) return true;
  const second = sorted[1];
  const gap = top - second;
  return top * gap >= 0.06;
}

/**
 * BM25-only tier-0 shortcut (before vector retrieval).
 * Condition: top >= 0.75 AND gap >= 0.10
 */
export function isBm25StrongSignal(scores: number[]): boolean {
  if (scores.length === 0) return false;
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0];
  if (top < 0.75) return false;
  if (sorted.length === 1) return true;
  return top - sorted[1] >= 0.10;
}

/**
 * Merge adjacent chunks from the same note.
 * Group by noteId, sort by seqIndex, merge consecutive chunks.
 * Keep highest score, concatenate content in sequence order.
 */
export function mergeAdjacentChunks(results: FusedResult[]): FusedResult[] {
  // Group by noteId
  const groups = new Map<string, FusedResult[]>();
  for (const r of results) {
    const existing = groups.get(r.noteId) || [];
    existing.push(r);
    groups.set(r.noteId, existing);
  }

  const merged: FusedResult[] = [];
  for (const [noteId, chunks] of groups) {
    // Sort by seqIndex
    chunks.sort((a, b) => a.seqIndex - b.seqIndex);

    let current = { ...chunks[0] };
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].seqIndex === current.seqIndex + 1) {
        // Adjacent — merge
        current.content += "\n" + chunks[i].content;
        current.score = Math.max(current.score, chunks[i].score);
        current.seqIndex = chunks[i].seqIndex; // track last merged index for next comparison
      } else {
        merged.push(current);
        current = { ...chunks[i] };
      }
    }
    merged.push(current);
  }

  // Re-sort by score descending
  merged.sort((a, b) => b.score - a.score);
  return merged;
}
