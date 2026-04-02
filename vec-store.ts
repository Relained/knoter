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

// ─── Embedding model dimensions ───────────────────────────────────────────────
export const EMBEDDING_DIMENSIONS = {
  "nomic-embed-text": 768,
  "bge-m3": 1024,
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_DIMENSIONS;

// ─── Schema factory ───────────────────────────────────────────────────────────
/**
 * Vault 단위 zvec collection schema를 생성한다.
 *
 * 구조:
 *   - embedding (dense FP32)  : 시맨틱 검색용 밀집 벡터
 *   - sparse     (sparse FP32): BM25/TF-IDF 키워드 검색용 희소 벡터
 *   - scalar fields           : 청크 메타데이터 (note_id, file_path, title, heading, content, tags, timestamps)
 *
 * 스칼라 필드에는 INVERT 인덱스를 달아 filter 표현식으로 사전 필터링할 수 있게 한다.
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
      {
        name: "sparse",
        dataType: ZVecDataType.SPARSE_VECTOR_FP32,
        // sparse vectors don't need a dimension (internally 0)
      },
    ],

    // ── Scalar (metadata) fields ───────────────────────────────────────────
    fields: [
      // 노트 원본 식별
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

      // 청크 내용
      {
        name: "heading",
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

      // 태그 (배열)
      {
        name: "tags",
        dataType: ZVecDataType.ARRAY_STRING,
        nullable: true,
        indexParams: { indexType: ZVecIndexType.INVERT },
      },

      // 타임스탬프 (Unix epoch milliseconds — INT64로 저장, 정렬/범위 필터용)
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
/**
 * Vault의 zvec 컬렉션을 생성하고 연다.
 * 이미 존재하면 에러를 던진다.
 */
export function createVaultCollection(
  indexDir: string,
  vaultName: string,
  model: EmbeddingModel = "nomic-embed-text",
): ZVecCollection {
  const schema = createChunkSchema(vaultName, model);
  return ZVecCreateAndOpen(indexDir, schema);
}

/**
 * 기존 Vault 컬렉션을 연다.
 */
export function openVaultCollection(
  indexDir: string,
  options?: ZVecCollectionOptions,
): ZVecCollection {
  return ZVecOpen(indexDir, options);
}

// ─── Document builder ─────────────────────────────────────────────────────────
export interface ChunkInput {
  /** 청크 고유 ID (chunks.id = zvec doc id) */
  id: string;
  /** 소속 노트 UUID */
  noteId: string;
  /** Vault 기준 상대 경로 */
  filePath: string;
  /** 노트 제목 */
  title?: string;
  /** 소속 헤딩 계층 */
  heading?: string;
  /** 청크 원문 */
  content: string;
  /** 원본 파일 내 바이트 오프셋 */
  offsetStart: number;
  offsetEnd: number;
  /** 토큰 수 */
  tokenCount: number;
  /** 태그 목록 */
  tags?: string[];
  /** 생성 시각 (Date 또는 epoch ms) */
  createdAt?: Date | number;

  // 벡터
  /** Dense embedding (float[]) */
  embedding: number[];
  /** Sparse vector {termIndex: weight} — BM25 등 */
  sparse?: Record<number, number>;
}

/** ChunkInput → ZVecDocInput 변환 */
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
      sparse: chunk.sparse ?? {},
    },
    fields: {
      note_id: chunk.noteId,
      file_path: chunk.filePath,
      title: chunk.title ?? "",
      heading: chunk.heading ?? "",
      content: chunk.content,
      offset_start: chunk.offsetStart,
      offset_end: chunk.offsetEnd,
      token_count: chunk.tokenCount,
      tags: chunk.tags ?? [],
      created_at: createdEpoch,
      indexed_at: now,
    },
  };
}

// ─── Query builders ───────────────────────────────────────────────────────────

/** 기본 검색 결과 반환 필드 */
const DEFAULT_OUTPUT_FIELDS = [
  "note_id",
  "file_path",
  "title",
  "heading",
  "content",
  "offset_start",
  "offset_end",
  "token_count",
  "tags",
  "created_at",
] as const;

/** 시맨틱 검색 쿼리 */
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

/** 키워드(sparse) 검색 쿼리 */
export function keywordQuery(
  sparseVector: Record<number, number>,
  topk = 10,
  filter?: string,
): ZVecQuery {
  const q: ZVecQuery = {
    fieldName: "sparse",
    vector: sparseVector,
    topk,
    outputFields: [...DEFAULT_OUTPUT_FIELDS],
  };
  if (filter) (q as any).filter = filter;
  return q;
}

/** 검색 결과를 정규화된 형태로 변환 */
export interface SearchResult {
  id: string;
  noteId: string;
  filePath: string;
  title: string | null;
  heading: string | null;
  content: string;
  offsetStart: number;
  offsetEnd: number;
  tokenCount: number;
  tags: string[] | null;
  createdAt: number | null;
  score: number;
  scoreDetail?: { semantic?: number; keyword?: number };
}

export function toSearchResult(doc: ZVecDoc): SearchResult {
  return {
    id: doc.id,
    noteId: doc.fields.note_id,
    filePath: doc.fields.file_path,
    title: doc.fields.title,
    heading: doc.fields.heading,
    content: doc.fields.content,
    offsetStart: doc.fields.offset_start,
    offsetEnd: doc.fields.offset_end,
    tokenCount: doc.fields.token_count,
    tags: doc.fields.tags,
    createdAt: doc.fields.created_at,
    score: doc.score,
  };
}

/**
 * RRF (Reciprocal Rank Fusion) 으로 시맨틱 + 키워드 결과를 병합한다.
 * k = 60 (표준 RRF 파라미터)
 */
export function mergeByRRF(
  semanticResults: ZVecDoc[],
  keywordResults: ZVecDoc[],
  topk = 10,
  k = 60,
): SearchResult[] {
  const entries = new Map<
    string,
    { score: number; semanticScore: number; keywordScore: number; doc: ZVecDoc }
  >();

  for (let i = 0; i < semanticResults.length; i++) {
    const doc = semanticResults[i]!;
    const rrf = 1 / (k + i + 1);
    const existing = entries.get(doc.id);
    if (existing) {
      existing.score += rrf;
      existing.semanticScore = rrf;
    } else {
      entries.set(doc.id, { score: rrf, semanticScore: rrf, keywordScore: 0, doc });
    }
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const doc = keywordResults[i]!;
    const rrf = 1 / (k + i + 1);
    const existing = entries.get(doc.id);
    if (existing) {
      existing.score += rrf;
      existing.keywordScore = rrf;
    } else {
      entries.set(doc.id, { score: rrf, semanticScore: 0, keywordScore: rrf, doc });
    }
  }

  return [...entries.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topk)
    .map(({ score, semanticScore, keywordScore, doc }) => ({
      ...toSearchResult(doc),
      score,
      scoreDetail: { semantic: semanticScore, keyword: keywordScore },
    }));
}

// ─── Hybrid search ───────────────────────────────────────────────────────────

export interface HybridSearchOptions {
  topk?: number;
  filter?: string;
  rrfK?: number;
  minScore?: number;
}

/** 시맨틱 + 키워드 하이브리드 검색을 수행하고 RRF로 병합한다. */
export function hybridSearch(
  collection: ZVecCollection,
  denseVector: number[],
  sparseVector: Record<number, number>,
  options: HybridSearchOptions = {},
): SearchResult[] {
  const { topk = 10, filter, rrfK = 60, minScore } = options;

  const semQ = semanticQuery(denseVector, topk * 2, filter);
  const kwQ = keywordQuery(sparseVector, topk * 2, filter);

  const semResults = collection.querySync(semQ);
  const kwResults = collection.querySync(kwQ);

  let results = mergeByRRF(semResults, kwResults, topk, rrfK);

  if (minScore != null) {
    results = results.filter((r) => r.score >= minScore);
  }

  return results;
}

// ─── Filter expression helpers ────────────────────────────────────────────────

/** 태그 필터 생성 — 지정한 태그를 모두 포함하는 문서 필터 */
export function tagFilter(tags: string[]): string {
  const values = tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ");
  return `tags CONTAIN_ALL (${values})`;
}

/** 날짜 범위 필터 (epoch ms) */
export function dateFilter(after?: Date, before?: Date): string {
  const parts: string[] = [];
  if (after) parts.push(`created_at >= ${after.getTime()}`);
  if (before) parts.push(`created_at <= ${before.getTime()}`);
  return parts.join(" AND ");
}

/** 여러 필터를 AND로 결합 */
export function combineFilters(...filters: (string | undefined)[]): string | undefined {
  const valid = filters.filter((f): f is string => !!f);
  return valid.length > 0 ? valid.join(" AND ") : undefined;
}
