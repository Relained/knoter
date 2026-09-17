import {
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollection,
} from "@zvec/zvec";
import type {
  ZVecDocInput,
  ZVecDoc,
  ZVecQuery,
  ZVecCollectionOptions,
} from "@zvec/zvec";

import type { FtsResult } from "./meta-store";

// ─── Embedding model dimensions ───────────────────────────────────────────────
export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "bge-m3": 1024,
  "dragonkue/snowflake-arctic-embed-l-v2.0-ko": 1024,
};

export type EmbeddingModel = string;

// ─── Score fusion defaults ──────────────────────────────────────────────────
/** Weight for vector channel in linear fusion (BEIR-tuned default). */
export const DEFAULT_FUSION_ALPHA = 0.80;

// ─── Strong-signal shortcut thresholds ──────────────────────────────────────
/** Fused signal: top*gap >= product AND top >= floor. */
export const STRONG_SIGNAL_PRODUCT = 0.06;
export const STRONG_SIGNAL_FLOOR = 0.40;
/** BM25-only tier-0: top >= floor AND gap >= min_gap. */
export const BM25_STRONG_FLOOR = 0.75;
export const BM25_STRONG_GAP = 0.10;

// ─── Schema factory ───────────────────────────────────────────────────────────
/**
 * Vault zvec collection schema (v4).
 *
 * Only llm-wiki artifact chunks are embedded and stored here; everything else
 * is keyword-search (FTS5) only.
 *
 * Structure:
 *   - embedding (dense FP32): semantic search dense vector
 *   - scalar fields: chunk metadata including structural linking
 */
export function createChunkSchema(
  vaultName: string,
  model: EmbeddingModel = "nomic-embed-text",
): ZVecCollectionSchema {
  const dim = EMBEDDING_DIMENSIONS[model];
  if (!dim) {
    throw new Error(`Unsupported embedding model: ${model}. Supported: ${Object.keys(EMBEDDING_DIMENSIONS).join(", ")}`);
  }

  return new ZVecCollectionSchema({
    name: vaultName,

    // ── Vector fields ──────────────────────────────────────────────────────
    vectors: [
      {
        name: "embedding",
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: dim,
        indexParams: {
          indexType: ZVecIndexType.HNSW,
          metricType: ZVecMetricType.COSINE,
          m: 32,
          efConstruction: 400,
        },
      },
    ],

    // ── Scalar (metadata) fields ───────────────────────────────────────────
    fields: [
      // Note identification
      {
        name: "note_id",
        dataType: ZVecDataType.STRING,
        indexParams: { indexType: ZVecIndexType.INVERT },
      },
      {
        name: "file_path",
        dataType: ZVecDataType.STRING,
        indexParams: { indexType: ZVecIndexType.INVERT },
      },
      {
        name: "title",
        dataType: ZVecDataType.STRING,
        nullable: true,
        indexParams: {
          indexType: ZVecIndexType.INVERT,
          enableExtendedWildcard: true,
        },
      },

      // Chunk content
      {
        name: "heading",
        dataType: ZVecDataType.STRING,
        nullable: true,
      },
      {
        name: "heading_path",
        dataType: ZVecDataType.STRING,
        nullable: true,
      },
      {
        name: "content",
        dataType: ZVecDataType.STRING,
      },
      {
        name: "offset_start",
        dataType: ZVecDataType.INT32,
      },
      {
        name: "offset_end",
        dataType: ZVecDataType.INT32,
      },
      {
        name: "token_count",
        dataType: ZVecDataType.INT32,
      },

      // Structural metadata
      {
        name: "seq_index",
        dataType: ZVecDataType.INT32,
      },
      {
        name: "doc_title",
        dataType: ZVecDataType.STRING,
        nullable: true,
      },

      // Timestamps (Unix epoch milliseconds)
      {
        name: "created_at",
        dataType: ZVecDataType.INT64,
        nullable: true,
        indexParams: {
          indexType: ZVecIndexType.INVERT,
          enableRangeOptimization: true,
        },
      },
      {
        name: "indexed_at",
        dataType: ZVecDataType.INT64,
        indexParams: {
          indexType: ZVecIndexType.INVERT,
          enableRangeOptimization: true,
        },
      },
    ],
  });
}

// ─── Collection helpers ───────────────────────────────────────────────────────

export function createVaultCollection(
  indexDir: string,
  vaultName: string,
  model: EmbeddingModel = "nomic-embed-text",
): ZVecCollection {
  const schema = createChunkSchema(vaultName, model);
  return ZVecCreateAndOpen(indexDir, schema);
}

export function openVaultCollection(
  indexDir: string,
  options?: ZVecCollectionOptions,
): ZVecCollection {
  return ZVecOpen(indexDir, options);
}

// ─── Document builder ─────────────────────────────────────────────────────────

export interface ChunkInput {
  /** Chunk unique ID (chunks.id = zvec doc id) */
  id: string;
  /** Parent note UUID */
  noteId: string;
  /** Vault-relative file path */
  filePath: string;
  /** Note title */
  title?: string;
  /** Immediate heading */
  heading?: string;
  /** Heading ancestry path (serialized JSON) */
  headingPath?: string[];
  /** Chunk text content */
  content: string;
  /** Byte offset in source file */
  offsetStart: number;
  offsetEnd: number;
  /** Token count */
  tokenCount: number;
  /** 0-based chunk position in note */
  seqIndex: number;
  /** Document-level title (propagated from note) */
  docTitle?: string;
  /** Creation time (Date or epoch ms) */
  createdAt?: Date | number;
  /** Dense embedding (float[]) */
  embedding: number[];
}

/**
 * Format chunk with structural context for embedding.
 * "title: X | section: Y | text: content"
 */
export function formatForEmbedding(chunk: {
  docTitle?: string;
  headingPath?: string[];
  content: string;
}): string {
  const parts: string[] = [];
  if (chunk.docTitle) parts.push(`title: ${chunk.docTitle}`);
  if (chunk.headingPath?.length) parts.push(`section: ${chunk.headingPath.join(" > ")}`);
  parts.push(`text: ${chunk.content}`);
  return parts.join(" | ");
}

/** ChunkInput -> ZVecDocInput */
export function toZVecDoc(chunk: ChunkInput): ZVecDocInput {
  const now = Date.now();
  const createdEpoch =
    chunk.createdAt instanceof Date
      ? chunk.createdAt.getTime()
      : (chunk.createdAt ?? now);

  return {
    id: chunk.id,
    vectors: {
      embedding: chunk.embedding,
    },
    fields: {
      note_id: chunk.noteId,
      file_path: chunk.filePath,
      title: chunk.title ?? "",
      heading: chunk.heading ?? "",
      heading_path: chunk.headingPath ? JSON.stringify(chunk.headingPath) : "",
      content: chunk.content,
      offset_start: chunk.offsetStart,
      offset_end: chunk.offsetEnd,
      token_count: chunk.tokenCount,
      seq_index: chunk.seqIndex,
      doc_title: chunk.docTitle ?? "",
      created_at: createdEpoch,
      indexed_at: now,
    },
  };
}

// ─── Query builders ───────────────────────────────────────────────────────────

const DEFAULT_OUTPUT_FIELDS = [
  "note_id",
  "file_path",
  "title",
  "heading",
  "heading_path",
  "content",
  "offset_start",
  "offset_end",
  "token_count",
  "seq_index",
  "doc_title",
  "created_at",
] as const;

/** Semantic (dense vector) search query. */
export function semanticQuery(
  vector: number[],
  topk = 10,
  filter?: string,
): ZVecQuery {
  const q: ZVecQuery = {
    fieldName: "embedding",
    vector,
    topk,
    outputFields: [...DEFAULT_OUTPUT_FIELDS],
    params: { indexType: ZVecIndexType.HNSW, ef: 300 },
  };
  if (filter) (q as any).filter = filter;
  return q;
}

// ─── Search result type ─────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  noteId: string;
  filePath: string;
  title: string | null;
  heading: string | null;
  headingPath: string[] | null;
  content: string;
  offsetStart: number;
  offsetEnd: number;
  tokenCount: number;
  seqIndex: number;
  createdAt: number | null;
  score: number;
  scoreDetail?: { semantic?: number; keyword?: number; rerank?: number };
}

export function toSearchResult(doc: ZVecDoc): SearchResult {
  let headingPath: string[] | null = null;
  if (doc.fields.heading_path) {
    try {
      headingPath = JSON.parse(doc.fields.heading_path);
    } catch { /* ignore parse errors */ }
  }

  return {
    id: doc.id,
    noteId: doc.fields.note_id,
    filePath: doc.fields.file_path,
    title: doc.fields.title || null,
    heading: doc.fields.heading || null,
    headingPath,
    content: doc.fields.content,
    offsetStart: doc.fields.offset_start,
    offsetEnd: doc.fields.offset_end,
    tokenCount: doc.fields.token_count,
    seqIndex: doc.fields.seq_index ?? 0,
    createdAt: doc.fields.created_at,
    score: doc.score,
  };
}

// ─── Linear score fusion ────────────────────────────────────────────────────

export interface FusionEntry {
  id: string;
  semanticScore: number;
  keywordScore: number;
  doc: SearchResult;
}

/**
 * Merge semantic (zvec) and keyword (FTS5) results via weighted linear fusion.
 * final = alpha * semantic_score + (1 - alpha) * keyword_score
 *
 * Both score channels should already be normalized to [0, 1] before calling.
 */
export function mergeByLinearFusion(
  semanticResults: SearchResult[],
  keywordResults: FtsResult[],
  topk = 10,
  alpha = DEFAULT_FUSION_ALPHA,
): SearchResult[] {
  const entries = new Map<string, FusionEntry>();

  // Semantic results — cosine scores are already in [0, 1]
  for (const doc of semanticResults) {
    entries.set(doc.id, {
      id: doc.id,
      semanticScore: doc.score,
      keywordScore: 0,
      doc,
    });
  }

  // Keyword results — scores should be pre-normalized via normalizeBM25()
  for (const kw of keywordResults) {
    const existing = entries.get(kw.chunkId);
    if (existing) {
      existing.keywordScore = kw.score;
    } else {
      // Keyword-only hit: create a partial SearchResult
      entries.set(kw.chunkId, {
        id: kw.chunkId,
        semanticScore: 0,
        keywordScore: kw.score,
        doc: {
          id: kw.chunkId,
          noteId: kw.noteId,
          filePath: "",
          title: null,
          heading: null,
          headingPath: null,
          content: kw.content,
          offsetStart: 0,
          offsetEnd: 0,
          tokenCount: 0,
          seqIndex: 0,
          createdAt: null,
          score: 0,
        },
      });
    }
  }

  return [...entries.values()]
    .map(({ semanticScore, keywordScore, doc }) => {
      const fused = alpha * semanticScore + (1 - alpha) * keywordScore;
      return {
        ...doc,
        score: fused,
        scoreDetail: { semantic: semanticScore, keyword: keywordScore },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topk);
}

// ─── RRF (kept for query expansion sub-query fusion) ────────────────────────

/**
 * RRF (Reciprocal Rank Fusion) for merging multiple ranked lists.
 * Used when query expansion produces multiple sub-query result sets.
 * k = 60 (standard RRF parameter)
 */
export function mergeByRRF(
  resultSets: SearchResult[][],
  topk = 10,
  k = 60,
): SearchResult[] {
  const entries = new Map<
    string,
    { score: number; doc: SearchResult }
  >();

  for (const results of resultSets) {
    for (let i = 0; i < results.length; i++) {
      const doc = results[i]!;
      const rrf = 1 / (k + i + 1);
      const existing = entries.get(doc.id);
      if (existing) {
        existing.score += rrf;
      } else {
        entries.set(doc.id, { score: rrf, doc });
      }
    }
  }

  return [...entries.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topk)
    .map(({ score, doc }) => ({ ...doc, score }));
}

// ─── Strong-signal shortcut ─────────────────────────────────────────────────

/** Check if fused results show a strong enough signal to skip LLM stages. */
export function isStrongSignal(results: SearchResult[]): boolean {
  const top = results[0];
  if (!top || top.score < STRONG_SIGNAL_FLOOR) return false;
  if (results.length < 2) return true;
  const gap = top.score - results[1]!.score;
  return top.score * gap >= STRONG_SIGNAL_PRODUCT;
}

/** BM25-only tier-0 shortcut: top score >= 0.75 and gap >= 0.10. */
export function isBM25StrongSignal(results: FtsResult[]): boolean {
  const top = results[0];
  if (!top || top.score < BM25_STRONG_FLOOR) return false;
  if (results.length < 2) return true;
  return (top.score - results[1]!.score) >= BM25_STRONG_GAP;
}

// ─── Adjacent chunk deduplication ───────────────────────────────────────────

/**
 * Merge adjacent chunk hits from the same note.
 * Groups by noteId, sorts by seqIndex, merges consecutive seqIndex runs.
 */
export function deduplicateAdjacentChunks(results: SearchResult[]): SearchResult[] {
  // Group by noteId
  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    const arr = groups.get(r.noteId) ?? [];
    arr.push(r);
    groups.set(r.noteId, arr);
  }

  const merged: SearchResult[] = [];

  for (const noteChunks of groups.values()) {
    noteChunks.sort((a, b) => a.seqIndex - b.seqIndex);

    let current = { ...noteChunks[0]! };
    let currentEndSeq = current.seqIndex;

    for (let i = 1; i < noteChunks.length; i++) {
      const next = noteChunks[i]!;
      if (next.seqIndex === currentEndSeq + 1) {
        // Adjacent — merge
        current.content = current.content + "\n" + next.content;
        current.score = Math.max(current.score, next.score);
        current.offsetEnd = next.offsetEnd;
        current.tokenCount = current.tokenCount + next.tokenCount;
        currentEndSeq = next.seqIndex;
      } else {
        merged.push(current);
        current = { ...next };
        currentEndSeq = next.seqIndex;
      }
    }
    merged.push(current);
  }

  // Re-sort by score
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

// ─── Hybrid search ──────────────────────────────────────────────────────────

export interface HybridSearchOptions {
  topk?: number;
  filter?: string;
  alpha?: number;
  minScore?: number;
  semanticMin?: number;
  keywordMin?: number;
}

/**
 * Hybrid search: dense vector (zvec) + FTS5 keyword (pre-fetched) + linear fusion.
 *
 * Keyword results must be fetched separately via MetaDB.searchFts() and passed in.
 * This function handles the vector retrieval + score fusion.
 */
export function hybridSearch(
  collection: ZVecCollection,
  denseVector: number[],
  keywordResults: FtsResult[],
  options: HybridSearchOptions = {},
): SearchResult[] {
  const {
    topk = 10,
    filter,
    alpha = DEFAULT_FUSION_ALPHA,
    minScore,
    semanticMin,
    keywordMin,
  } = options;

  // Semantic retrieval
  const semQ = semanticQuery(denseVector, topk * 3, filter);
  const semResults = collection.querySync(semQ).map(toSearchResult);

  // Apply per-channel minimums before fusion
  const filteredSemantic = semanticMin != null
    ? semResults.filter((r) => r.score >= semanticMin)
    : semResults;
  const filteredKeyword = keywordMin != null
    ? keywordResults.filter((r) => r.score >= keywordMin)
    : keywordResults;

  // Linear fusion
  let results = mergeByLinearFusion(filteredSemantic, filteredKeyword, topk, alpha);

  // Post-fusion score cutoff
  if (minScore != null) {
    results = results.filter((r) => r.score >= minScore);
  }

  // Deduplicate adjacent chunks
  results = deduplicateAdjacentChunks(results);

  return results.slice(0, topk);
}

// ─── Filter expression helpers ────────────────────────────────────────────────

/** Date range filter (epoch ms). */
export function dateFilter(after?: Date, before?: Date): string {
  const parts: string[] = [];
  if (after) parts.push(`created_at >= ${after.getTime()}`);
  if (before) parts.push(`created_at <= ${before.getTime()}`);
  return parts.join(" AND ");
}

/** Combine multiple filters with AND. */
export function combineFilters(...filters: (string | undefined)[]): string | undefined {
  const valid = filters.filter((f): f is string => !!f);
  return valid.length > 0 ? valid.join(" AND ") : undefined;
}
