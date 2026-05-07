import { MetaDB, type FtsResult } from "../stores/meta-store";
import { openVaultCollection, semanticQuery, type EmbeddingModel } from "../stores/vec-store";
import type { SearchFilters } from "./query-builder";
import { linearFusion, isStrongSignal, isBm25StrongSignal, mergeAdjacentChunks, DEFAULT_ALPHA, type FusedResult } from "./fusion";
import { logger } from "../core/logger";
import { loadVaultConfig } from "../core/config";
import { createEmbeddingProvider } from "../providers/factory";
import { join } from "node:path";

export type SearchMode = "semantic" | "keyword" | "hybrid";

export interface SearchOptions {
  mode: SearchMode;
  top: number;               // max results, default 10
  semanticMin?: number;       // min semantic score
  keywordMin?: number;        // min keyword score
  hybridMin?: number;         // min fused score
  tags?: string[];
  after?: string;
  before?: string;
  lang?: string;              // language filter: "cjk", "latin", "mixed", etc.
  includeArtifacts?: boolean; // artifact chunks are excluded by default
  alpha?: number;             // fusion weight, default 0.80
}

export interface SearchResult {
  results: FusedResult[];
  mode: SearchMode;
  totalFound: number;
  strongSignal: boolean;
}

/**
 * Main search function orchestrating three modes: semantic, keyword, and hybrid.
 */
export async function search(
  vaultRoot: string,
  vaultId: string,
  query: string,
  options: SearchOptions
): Promise<SearchResult> {
  const metaDb = new MetaDB(vaultRoot);
  const alpha = options.alpha ?? DEFAULT_ALPHA;

  try {
    if (options.mode === "keyword") {
      return await keywordSearch(metaDb, vaultId, query, options);
    }

    if (options.mode === "semantic") {
      return await semanticSearch(vaultRoot, vaultId, query, options);
    }

    // Hybrid mode (default)
    return await hybridSearch(metaDb, vaultRoot, vaultId, query, options, alpha);
  } finally {
    metaDb.close();
  }
}

/**
 * Keyword-only search via FTS5.
 * 1. Build safe FTS5 query
 * 2. Call metaDb.searchFts with tag/date filters applied
 * 3. Map to FusedResult with keyword score
 */
async function keywordSearch(
  metaDb: MetaDB,
  vaultId: string,
  query: string,
  options: SearchOptions
): Promise<SearchResult> {
  logger.debug(`Keyword search for: "${query}"`);

  // searchFts internally builds the FTS5 query, so pass raw query
  let results = metaDb.searchFts(query, options.top * 2, vaultId, 0, !!options.includeArtifacts);

  logger.debug(`FTS returned ${results.length} results`);

  // Apply keyword score filter
  if (options.keywordMin !== undefined) {
    results = results.filter(r => r.score >= options.keywordMin!);
    logger.debug(`After keywordMin filter: ${results.length} results`);
  }

  // Apply tag filter if provided
  if (options.tags && options.tags.length > 0) {
    results = filterByTags(metaDb, results, options.tags);
    logger.debug(`After tag filter: ${results.length} results`);
  }

  // Apply date filter if provided
  if (options.after || options.before) {
    results = filterByDates(metaDb, results, options.after, options.before);
    logger.debug(`After date filter: ${results.length} results`);
  }

  // Map to FusedResult
  const fusedResults = results.slice(0, options.top).map(ftsResult =>
    ftsResultToFused(metaDb, ftsResult, { keyword: ftsResult.score, fused: ftsResult.score })
  );

  const strongSignal = isBm25StrongSignal(results.map(r => r.score));
  logger.debug(`Strong keyword signal: ${strongSignal}`);

  return {
    results: fusedResults,
    mode: "keyword",
    totalFound: results.length,
    strongSignal,
  };
}

/**
 * Semantic-only search via zvec.
 * 1. Generate query embedding (placeholder zeros for now)
 * 2. Build zvec filter from tags/dates
 * 3. Query semantic index
 * 4. Map to FusedResult with semantic score
 */
async function semanticSearch(
  vaultRoot: string,
  vaultId: string,
  query: string,
  options: SearchOptions
): Promise<SearchResult> {
  logger.debug(`Semantic search for: "${query}"`);

  const metaDb = new MetaDB(vaultRoot);

  try {
    // Generate query embedding from vault config provider
    const vaultConfig = await loadVaultConfig(vaultRoot);
    const embedder = createEmbeddingProvider(vaultConfig);
    const embeddings = await embedder.embed([query]);
    const queryEmbedding = embeddings[0];

    // Open zvec collection
    const vectorPath = join(vaultRoot, ".kn", "vectors");
    const collection = openVaultCollection(vectorPath, {});

    // Build zvec filter from tags/dates
    const zvecFilter = buildZvecFilter(options.tags, options.after, options.before);

    // Query semantic index using semanticQuery builder
    logger.debug(`Querying zvec with filter: ${zvecFilter || "none"}`);

    const zvecQuery = semanticQuery(queryEmbedding, options.top * 2, zvecFilter);
    const queryResult = collection.querySync(zvecQuery);
    let results = queryResult || [];
    if (!options.includeArtifacts) {
      results = results.filter((r: any) => {
        const noteId = r.fields?.note_id || r.data?.note_id;
        const noteRow = metaDb.getNote(noteId);
        return noteRow?.layer !== "artifact";
      });
    }

    logger.debug(`Semantic search returned ${results.length} results`);

    // Apply semantic score filter
    if (options.semanticMin !== undefined) {
      results = results.filter(r => r.score >= options.semanticMin!);
      logger.debug(`After semanticMin filter: ${results.length} results`);
    }

    // Convert to FusedResult
    const fusedResults = results.slice(0, options.top).map((zvecResult: any) => {
      const noteRow = metaDb.getNote(zvecResult.fields?.note_id || zvecResult.data?.note_id);
      return zvecResultToFused(zvecResult, noteRow);
    });

    const strongSignal = results.length > 0 && isStrongSignal(results.map((r: any) => r.score));
    logger.debug(`Strong semantic signal: ${strongSignal}`);

    return {
      results: fusedResults,
      mode: "semantic",
      totalFound: results.length,
      strongSignal,
    };
  } finally {
    metaDb.close();
  }
}

/**
 * Hybrid search: keyword + semantic with linear fusion.
 * 1. Do keyword search first
 * 2. Check for BM25 strong signal — if found, skip semantic
 * 3. Do semantic search
 * 4. Merge results by chunk ID with linear fusion
 * 5. Apply hybridMin filter and strong signal check
 */
async function hybridSearch(
  metaDb: MetaDB,
  vaultRoot: string,
  vaultId: string,
  query: string,
  options: SearchOptions,
  alpha: number
): Promise<SearchResult> {
  logger.debug(`Hybrid search for: "${query}" with alpha=${alpha}`);

  // Step 1: Keyword search (searchFts builds FTS5 query internally)
  let keywordResults = metaDb.searchFts(query, options.top * 2, vaultId, 0, !!options.includeArtifacts);
  logger.debug(`Keyword search returned ${keywordResults.length} results`);

  // Apply keyword score filter if provided
  if (options.keywordMin !== undefined) {
    keywordResults = keywordResults.filter(r => r.score >= options.keywordMin!);
    logger.debug(`After keywordMin filter: ${keywordResults.length} results`);
  }

  // Step 2: Check for BM25 strong signal
  const bm25Strong = isBm25StrongSignal(keywordResults.map(r => r.score));
  logger.debug(`BM25 strong signal: ${bm25Strong}`);

  if (bm25Strong) {
    // Skip semantic search, return keyword results
    logger.debug("BM25 strong signal detected, skipping semantic search");

    let results = keywordResults.slice(0, options.top);

    // Apply tag/date filters
    if (options.tags && options.tags.length > 0) {
      results = filterByTags(metaDb, results, options.tags);
    }
    if (options.after || options.before) {
      results = filterByDates(metaDb, results, options.after, options.before);
    }

    const fusedResults = results.map(ftsResult =>
      ftsResultToFused(metaDb, ftsResult, { keyword: ftsResult.score, fused: ftsResult.score })
    );

    return {
      results: fusedResults,
      mode: "hybrid",
      totalFound: results.length,
      strongSignal: true,
    };
  }

  // Step 3: Do semantic search
  const vaultConfig = await loadVaultConfig(vaultRoot);
  const embedder = createEmbeddingProvider(vaultConfig);
  const embeddings = await embedder.embed([query]);
  const queryEmbedding = embeddings[0];

  const vectorPath = join(vaultRoot, ".kn", "vectors");
  const collection = openVaultCollection(vectorPath, {});

  const zvecFilter = buildZvecFilter(options.tags, options.after, options.before);

  logger.debug(`Semantic search with filter: ${zvecFilter || "none"}`);

  const zvecQuery = semanticQuery(queryEmbedding, options.top * 2, zvecFilter);
  const queryResult = collection.querySync(zvecQuery);
  let semanticResults = queryResult || [];
  if (!options.includeArtifacts) {
    semanticResults = semanticResults.filter((r: any) => {
      const noteId = r.fields?.note_id || r.data?.note_id;
      const noteRow = metaDb.getNote(noteId);
      return noteRow?.layer !== "artifact";
    });
  }

  logger.debug(`Semantic search returned ${semanticResults.length} results`);

  // Apply semantic score filter if provided
  if (options.semanticMin !== undefined) {
    semanticResults = semanticResults.filter(r => r.score >= options.semanticMin!);
    logger.debug(`After semanticMin filter: ${semanticResults.length} results`);
  }

  // Step 4: Merge results by chunk ID with linear fusion
  const merged = mergeResultsByChunkId(
    metaDb,
    semanticResults,
    keywordResults,
    alpha
  );

  logger.debug(`Merged ${merged.length} unique chunks`);

  // Step 5: Apply hybridMin filter
  let filtered = merged;
  if (options.hybridMin !== undefined) {
    filtered = merged.filter(r => r.score >= options.hybridMin!);
    logger.debug(`After hybridMin filter: ${filtered.length} results`);
  }

  // Check fused strong signal
  const fusedScores = filtered.map(r => r.score);
  const strongSignal = isStrongSignal(fusedScores);
  logger.debug(`Strong fused signal: ${strongSignal}`);

  // Merge adjacent chunks and sort
  let finalResults = mergeAdjacentChunks(filtered).slice(0, options.top ?? 10);

  // Apply language filter if specified
  if (options.lang) {
    finalResults = filterByLanguage(metaDb, finalResults, options.lang);
    logger.debug(`After language filter (${options.lang}): ${finalResults.length} results`);
  }

  return {
    results: finalResults,
    mode: "hybrid",
    totalFound: merged.length,
    strongSignal,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Convert FTS result to FusedResult structure.
 */
function ftsResultToFused(
  metaDb: MetaDB,
  ftsResult: FtsResult,
  scoreDetail: Partial<FusedResult["scoreDetail"]>
): FusedResult {
  const chunkRow = metaDb.getChunk(ftsResult.chunkId);
  const noteRow = metaDb.getNote(ftsResult.noteId);
  const tags = metaDb.getTagsByNote(ftsResult.noteId).map(t => t.tag);

  let headingPath: string | null = null;
  if (chunkRow?.heading_path) {
    headingPath = chunkRow.heading_path;
  }

  return {
    chunkId: ftsResult.chunkId,
    noteId: ftsResult.noteId,
    content: ftsResult.content,
    filePath: noteRow?.file_path || "",
    title: noteRow?.title || null,
    heading: chunkRow?.heading || null,
    headingPath,
    tags,
    createdAt: noteRow?.created_at || null,
    seqIndex: chunkRow?.seq_index || 0,
    score: scoreDetail.fused ?? ftsResult.score,
    scoreDetail: {
      fused: scoreDetail.fused ?? ftsResult.score,
      ...(scoreDetail.keyword !== undefined && { keyword: scoreDetail.keyword }),
    },
  };
}

/**
 * Convert zvec result to FusedResult structure.
 */
function zvecResultToFused(
  zvecResult: any,
  noteRow: any
): FusedResult {
  const fields = zvecResult.fields || {};
  const tags = fields.tags || [];

  let headingPath: string | null = null;
  if (fields.heading_path) {
    try {
      const parsed = JSON.parse(fields.heading_path);
      headingPath = typeof parsed === "object" ? JSON.stringify(parsed) : null;
    } catch {
      headingPath = fields.heading_path;
    }
  }

  return {
    chunkId: zvecResult.id,
    noteId: fields.note_id,
    content: fields.content,
    filePath: fields.file_path,
    title: fields.title || null,
    heading: fields.heading || null,
    headingPath,
    tags,
    createdAt: noteRow?.created_at || null,
    seqIndex: fields.seq_index || 0,
    score: zvecResult.score,
    scoreDetail: {
      semantic: zvecResult.score,
      fused: zvecResult.score,
    },
  };
}

/**
 * Merge semantic and keyword results by chunk ID with linear fusion.
 */
function mergeResultsByChunkId(
  metaDb: MetaDB,
  semanticResults: any[],
  keywordResults: FtsResult[],
  alpha: number
): FusedResult[] {
  const merged = new Map<string, { semantic?: number; keyword?: number; zvecResult?: any; ftsResult?: FtsResult }>();

  // Add semantic results
  for (const zvecResult of semanticResults) {
    merged.set(zvecResult.id, {
      semantic: zvecResult.score,
      zvecResult,
    });
  }

  // Add/merge keyword results
  for (const ftsResult of keywordResults) {
    const existing = merged.get(ftsResult.chunkId);
    if (existing) {
      existing.keyword = ftsResult.score;
      existing.ftsResult = ftsResult;
    } else {
      merged.set(ftsResult.chunkId, {
        keyword: ftsResult.score,
        ftsResult,
      });
    }
  }

  // Convert to FusedResult with linear fusion
  const results: FusedResult[] = [];

  for (const [chunkId, entry] of merged.entries()) {
    const semantic = entry.semantic ?? 0;
    const keyword = entry.keyword ?? 0;
    const fused = linearFusion(semantic, keyword, alpha);

    let fused_result: FusedResult;

    if (entry.zvecResult) {
      // Primary source from semantic
      const noteId = entry.zvecResult.fields?.note_id || entry.zvecResult.data?.note_id;
      fused_result = zvecResultToFused(entry.zvecResult, metaDb.getNote(noteId));
      fused_result.score = fused;
      fused_result.scoreDetail = {
        semantic,
        keyword,
        fused,
      };
    } else if (entry.ftsResult) {
      // Primary source from keyword
      fused_result = ftsResultToFused(metaDb, entry.ftsResult, {
        keyword,
        fused,
      });
      fused_result.scoreDetail = {
        keyword,
        fused,
      };
    } else {
      continue;
    }

    results.push(fused_result);
  }

  // Sort by fused score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Build zvec filter expression from tags and dates.
 */
function buildZvecFilter(
  tags?: string[],
  after?: string,
  before?: string
): string | undefined {
  const parts: string[] = [];

  // Tag filter: tags CONTAIN_ANY ("tag1", "tag2")
  if (tags && tags.length > 0) {
    const tagExprs = tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(", ");
    parts.push(`tags CONTAIN_ANY (${tagExprs})`);
  }

  // Date filters: created_at >= timestamp_ms
  if (after) {
    try {
      const afterMs = new Date(after).getTime();
      if (!isNaN(afterMs)) {
        parts.push(`created_at >= ${afterMs}`);
      }
    } catch {
      // Ignore invalid date
    }
  }

  if (before) {
    try {
      const beforeMs = new Date(before).getTime();
      if (!isNaN(beforeMs)) {
        parts.push(`created_at <= ${beforeMs}`);
      }
    } catch {
      // Ignore invalid date
    }
  }

  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/**
 * Filter FTS results by tags.
 */
function filterByTags(
  metaDb: MetaDB,
  results: FtsResult[],
  tags: string[]
): FtsResult[] {
  if (tags.length === 0) return results;

  const tagSet = new Set(tags);
  return results.filter(r => {
    const noteTags = metaDb.getTagsByNote(r.noteId).map(t => t.tag);
    return noteTags.some(t => tagSet.has(t));
  });
}

/**
 * Filter FTS results by date range.
 */
function filterByDates(
  metaDb: MetaDB,
  results: FtsResult[],
  after?: string,
  before?: string
): FtsResult[] {
  if (!after && !before) return results;

  return results.filter(r => {
    const noteRow = metaDb.getNote(r.noteId);
    if (!noteRow?.created_at) return true;

    const noteDate = new Date(noteRow.created_at).getTime();

    if (after) {
      const afterTime = new Date(after).getTime();
      if (noteDate < afterTime) return false;
    }

    if (before) {
      const beforeTime = new Date(before).getTime();
      if (noteDate > beforeTime) return false;
    }

    return true;
  });
}

/**
 * Filter FusedResult by language.
 */
function filterByLanguage(
  metaDb: MetaDB,
  results: FusedResult[],
  lang?: string
): FusedResult[] {
  if (!lang) return results;

  return results.filter(r => {
    const noteRow = metaDb.getNote(r.noteId);
    if (!noteRow?.language) return true; // Include results with no language set

    return noteRow.language === lang;
  });
}
