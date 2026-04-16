# Comparative Analysis: kn vs qmd vs ir

## Project Overview

| Aspect | kn (this project) | qmd (tobi/qmd) | ir (vlwkaos/ir) |
|--------|-------------------|-----------------|-----------------|
| Language | TypeScript / Bun | TypeScript / Node+Bun | Rust |
| Storage | zvec + SQLite (dual) | SQLite + sqlite-vec | Per-collection SQLite + sqlite-vec |
| Search | FTS5 + dense zvec + linear fusion | FTS5 BM25 + vector + RRF + LLM reranker | FTS5 BM25 + vector + score fusion + LLM reranker |
| Embedding | External provider (local/cloud) | Local GGUF (node-llama-cpp) | Local GGUF (llama.cpp FFI) |
| CJK support | FTS5 trigram tokenizer | Custom embedding model swap (QMD_EMBED_MODEL) | External preprocessor plugin (lindera/mecab) |
| Process model | Short-lived CLI | Short-lived CLI + HTTP MCP daemon | Persistent daemon (Unix socket) |
| Chunking | Heading-aware (planned, no overlap) | Smart break-point scoring + 15% overlap + AST-aware | Break-point scoring + 15% overlap |

---

## Similarity Analysis

### High overlap areas

1. **Hybrid search architecture**: All three combine BM25 keyword search with dense vector semantic search. The conceptual pipeline is nearly identical.
2. **SQLite FTS5 for keyword search**: All use FTS5 as the keyword retrieval engine.
3. **Heading-aware chunking**: All detect markdown headings, code fences, and structural boundaries for chunk splitting.
4. **Collection/Vault model**: All organize documents into isolated workspaces (kn: vaults, qmd: collections, ir: collections).
5. **MCP server exposure**: All plan or implement MCP tool mappings for LLM agent integration.
6. **Change detection via hashing**: All use content hashing (SHA-256 / file_hash) for incremental indexing.
7. **Tag / metadata management**: kn and qmd both support tags; ir uses path-context as an alternative.

### Key differentiators

| Feature | kn | qmd | ir |
|---------|----|----|-----|
| LLM reranking | Not implemented | Yes (Qwen3-Reranker, position-aware blend) | Yes (Qwen3-Reranker, 0.4/0.6 blend) |
| Query expansion | Not implemented | Yes (fine-tuned 1.7B model, lex/vec/hyde sub-queries) | Yes (same model, cached globally) |
| Strong-signal shortcut | No | No | Yes (skips LLM when BM25 score >= 0.75) |
| AST-aware chunking (code) | No | Yes (tree-sitter: TS/JS/Python/Go/Rust) | No |
| Chunk overlap | Deferred | 15% overlap with smart boundary | 15% overlap with smart boundary |
| CJK BM25 tokenization | Trigram (basic) | Embedding model swap only | Lindera morphological analysis (plugin) |
| Daemon mode | No | HTTP MCP only | Full Unix socket daemon |
| LLM cache | No | Reranker scores | Expander + Reranker scores |
| Content-addressed dedup | No | docid (6-char hash) | SHA-256 per file |
| SDK/Library API | No | Yes (createStore()) | No |
| Score normalization | Min-Max (planned) | score/(1+score) for BM25 | score/(1+score) for BM25, linear fusion alpha |

---

## 1. Logic Improvements

### 1.1 Score Fusion: Replace RRF with Weighted Linear Fusion (already planned, validate approach)

**Current state**: `vec-store.ts` implements RRF (mergeByRRF), but specification says to use Min-Max normalized linear fusion.

**What qmd/ir teach**: ir benchmarked both approaches on BEIR datasets. Their finding: **BM25 fusion provides no statistically significant lift over pure vector** with RRF, but score-based linear fusion with alpha=0.80 (vec) works better. qmd uses RRF with position bonuses and position-aware reranker blending.

**Recommendation**: 
- Implement linear fusion as planned in spec, with configurable alpha (default 0.80 vec / 0.20 keyword, matching ir's BEIR-tuned value).
- Remove the `mergeByRRF` function from the active pipeline but keep it as an internal utility for optional comparison/eval.
- Add BM25 score normalization: `normalized = -raw / (1 + -raw)` (same as ir's approach for FTS5 negative scores).

### 1.2 Add Strong-Signal Shortcut

**What ir does**: When the top BM25 result has score >= 0.75 and gap >= 0.10 from the second result, it skips all LLM work (expansion, reranking). This makes exact-match queries nearly instant.

**Recommendation**: Add a strong-signal check in the hybrid search path. When keyword or fused score shows a clear winner, return early without requiring expensive operations. This is especially valuable when `kn ask` triggers search.

### 1.3 Chunk Overlap Implementation

**What qmd/ir do**: Both use 15% overlap with smart boundary detection. The chunker scans a window before the target cut position, scores break points using quadratic distance decay: `final = base_score * (1 - (norm_dist^2) * 0.7)`. This keeps headings and paragraph boundaries as preferred split points.

**Recommendation**: Implement the same break-point scoring algorithm:
- Break-point scores: h1=100, h2=90, h3=80, h4=70, h5=60, h6=50, code fence=80, horizontal rule=60, blank line=20, list item=5, newline=1
- Search window: 200 tokens (800 chars) before the target end position
- Distance decay: `adjusted = score * (1 - (distance/window)^2 * 0.7)`
- Overlap: 15% of chunk size
- Minimum chunk size: 100 tokens (avoid tiny trailing chunks)
- Code fence protection: never split inside fenced code blocks

### 1.4 BM25 Score Normalization

**Current state**: `searchFts()` returns raw FTS5 `rank` values (negative, unbounded).

**What ir does**: Normalizes BM25 scores to [0, 1] with `pos / (1 + pos)` where `pos = -raw`.

**Recommendation**: Normalize FTS5 scores before fusion. Without normalization, linear fusion weights are meaningless because BM25 and vector scores are on different scales. Add:
```typescript
function normalizeBM25(raw: number): number {
  const pos = -raw;
  return pos / (1 + pos);
}
```

### 1.5 FTS5 Query Builder with Injection Safety

**Current state**: `searchFts()` passes query directly to FTS5 MATCH.

**What ir does**: Builds structured FTS5 queries with:
- Bare terms become prefix matches: `"term"*`
- Quoted phrases stay exact: `"exact phrase"`
- Negation: `-bad` becomes `NOT "bad"`
- All positive terms ANDed
- Quotes escaped (`"` doubled)

**Recommendation**: Add a safe FTS5 query builder to prevent injection and improve search quality. Current raw MATCH is vulnerable to syntax errors on user input with special characters.

### 1.6 Compensating Rollback Precision

**Current state**: Spec says compensating rollback on vector write failure, but no implementation yet.

**What ir does**: Content-addressed storage means vector writes are idempotent. Recovery is cheap: just re-embed any document whose vector rows are missing.

**Recommendation**: When implementing the `pending -> synced` flow, prefer idempotent upsert over delete-on-failure. Store the chunk ID list in metadata first, then upsert vectors. On recovery (`kn sync`), scan for pending entries and retry vector upsert rather than deleting metadata.

---

## 2. Additional Useful Features

### 2.1 LLM Reranking (High Impact)

**What qmd/ir do**: Both use Qwen3-Reranker (0.6B, GGUF) as a cross-encoder reranker. ir's BEIR benchmarks show **+7% to +14.5% nDCG@10** on conversational/argument retrieval datasets.

**Implementation path for kn**:
- Add optional reranker in `kn search --mode hybrid` and `kn ask`
- Score blending: `final = fused * 0.4 + rerank * 0.6` (ir's proven ratio)
- Cache reranker scores in SQLite (key: hash(model + query + content_hash))
- Support both local GGUF (via llama.cpp/Bun FFI) and API-based rerankers

### 2.2 Query Expansion

**What qmd does**: Uses a fine-tuned 1.7B model to generate typed sub-queries:
- `lex`: keyword-optimized reformulation
- `vec`: semantic embedding-optimized reformulation  
- `hyde`: hypothetical document embedding

These sub-queries are searched independently, then results are fused via RRF.

**Important caveat from ir**: Expansion without reranking is *harmful* (p<0.05, -0.53% nDCG on NFCorpus). Only enable expansion when a reranker is also available.

**Recommendation**: Add as optional feature in `kn ask` pipeline. Gate on reranker availability.

### 2.3 LLM Result Cache

**What ir does**: Dual-layer cache:
- Global expander cache: `sha256(model + query) -> JSON sub-queries`
- Per-collection reranker cache: `sha256(model + query + content_hash) -> score`

Repeated queries skip all LLM inference entirely.

**Recommendation**: Add an `llm_cache` table to `meta.db`:
```sql
CREATE TABLE IF NOT EXISTS llm_cache (
  cache_key TEXT PRIMARY KEY,
  cache_type TEXT NOT NULL,  -- 'expander' | 'reranker'
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### 2.4 Content-Addressed Storage / Deduplication

**What ir does**: Files are hashed by content (SHA-256). Identical files within a collection share storage. This prevents duplicate indexing and makes incremental updates cheap.

**Current state**: kn has `file_hash` in the notes table but doesn't use it for deduplication.

**Recommendation**: Before indexing, check if `file_hash` already exists for the same vault. Skip re-indexing unchanged content. This makes `kn sync` significantly faster.

### 2.5 AST-Aware Chunking for Code Files

**What qmd does**: Uses tree-sitter to detect function, class, import, and type boundaries in code files (TS, JS, Python, Go, Rust). AST break points are merged with regex break-point scores using the same scoring system.

**Recommendation**: Add as optional `--chunk-strategy auto` flag. For code-heavy vaults, this dramatically improves chunk quality. Use tree-sitter WASM grammars via Bun.

### 2.6 Hierarchical Context Metadata

**What qmd does**: `qmd context add qmd://notes "Personal notes and ideas"` — attaches descriptive context to collections and paths. This context is returned with search results, giving LLMs better selection criteria.

**Recommendation**: Add a `contexts` table to `meta.db` and support `kn context add <path> <description>`. Return context in search results for `kn ask` RAG assembly.

### 2.7 Document Retrieval by ID / Path

**What both qmd and ir do**: `get` command retrieves full documents by path, docid, or substring match. Supports section extraction (`--section "heading"`), line ranges, and fuzzy matching suggestions on miss.

**Recommendation**: Add `kn get <path|id>` command. Useful for MCP tool integration where an LLM needs to fetch full content after search.

### 2.8 HTTP MCP Daemon Mode

**What ir does**: Persistent daemon keeps embedding/reranker models loaded in memory. Warm queries take 30ms vs 3s cold. Models stay in VRAM across requests.

**Current state**: kn spec has `kn serve` for MCP but as stdio only.

**Recommendation**: Add HTTP transport option to `kn serve` with model warmth management. Critical for interactive `kn ask` workflows where cold model loading per query is unacceptable.

---

## 3. Parsing Algorithm Additions

### 3.1 CJK-Compatible Morphological Preprocessing

**Problem**: kn's current FTS5 uses `tokenize="trigram"`. Trigram tokenization is a brute-force approach for CJK — it works for substring matching but produces low-quality BM25 scores because:
- Every 3-byte sequence is a "token", creating massive index bloat
- No morphological awareness: "서울역에서" (at Seoul station) tokenized as overlapping trigrams won't match "서울" (Seoul) effectively in BM25 ranking
- ir's benchmark shows: trigram/no-preprocessor nDCG@10 = 0.0009, lindera nDCG@10 = 0.0460 (50x gain)

**Solution: External Preprocessor Plugin Architecture**

Adopt ir's preprocessor plugin protocol — a language-agnostic, process-based tokenization pipeline:

```
Protocol: stdin/stdout, line-by-line
  Input:  one UTF-8 line per invocation
  Output: one tokenized UTF-8 line (space-separated morphemes)
  Lifetime: stays alive between lines (no per-line spawn)
```

**Implementation plan**:

#### A. Preprocessor Registry

Add to `meta.db`:
```sql
CREATE TABLE IF NOT EXISTS preprocessors (
  alias TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  language TEXT           -- 'ko', 'ja', 'zh', etc.
);

-- Bind preprocessors to vaults (or per-collection in future)
ALTER TABLE vault_config ADD COLUMN preprocessor_alias TEXT;
```

#### B. PreprocessHandle class (`src/preprocess.ts`)

```typescript
interface PreprocessHandle {
  spawn(command: string): PreprocessHandle | null;
  processLine(line: string): string;
  processText(text: string): string;  // split on \n, process each, rejoin
  close(): void;
}

// Chain multiple preprocessors: output of one feeds next
class PreprocessChain {
  handles: PreprocessHandle[];
  processText(text: string): string;
}
```

#### C. Korean Preprocessor Binary

Use lindera with ko-dic (embedded dictionary), Mode::Decompose for compound decomposition:
- Filters non-content morphemes: particles (J*), endings (E*), affixes, symbols
- Output: content morphemes only, space-separated
- Throughput: ~5,600 docs/s on modern hardware

Deploy as pre-built binary (no Rust toolchain required for end users):
```bash
kn preprocessor install ko     # downloads pre-built lindera-tokenize binary
kn preprocessor bind ko        # binds to active vault, triggers re-index
```

#### D. Dual-Path FTS5 Indexing

When a preprocessor is bound:
1. **Index time**: raw content -> preprocessor -> preprocessed text stored in FTS5
2. **Query time**: raw query -> same preprocessor -> search FTS5
3. **Schema change**: switch FTS5 tokenizer from `trigram` to `unicode61` (or `porter unicode61`) when a preprocessor handles morphology

```typescript
// In meta-store.ts, modify FTS5 table creation
const tokenizer = hasPreprocessor ? 'unicode61' : 'trigram';
this.db.run(`
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content, content=chunks, content_rowid=rowid, tokenize="${tokenizer}"
  )
`);
```

#### E. Chinese / Japanese Support

Same plugin architecture:
- **Japanese**: lindera with ipadic dictionary (`kn preprocessor install ja`)
- **Chinese**: bigram tokenizer (`kn preprocessor install zh`) — splits CJK text into overlapping bigrams

### 3.2 Semantic + Mechanical Metadata Linking

**Problem**: Current architecture treats each chunk as an isolated unit. There is no structural metadata that connects chunks back to their document hierarchy or to neighboring chunks. This limits:
- Context reconstruction in `kn ask` (LLM gets isolated snippets)
- Deduplication of adjacent overlapping chunks
- Navigation from search result to precise document location

**Solution: Hierarchical Metadata Graph**

#### A. Heading Hierarchy Chain

Store the heading ancestry for each chunk as a structured path:

```typescript
interface ChunkMetadata {
  // Existing fields
  id: string;
  noteId: string;
  content: string;
  
  // NEW: Structural metadata
  headingPath: string[];      // ["# Introduction", "## Background", "### Prior Work"]
  headingDepth: number;       // 3 (deepest heading level in this chunk)
  sequenceIndex: number;      // 0-based position among all chunks of this note
  prevChunkId: string | null; // linked list for context expansion
  nextChunkId: string | null;
  
  // NEW: Document-level metadata propagated to chunk
  documentTitle: string;
  documentTags: string[];
  frontmatter: Record<string, string>;  // YAML frontmatter key-value pairs
}
```

**Schema addition to `meta.db`**:
```sql
ALTER TABLE chunks ADD COLUMN heading_path TEXT;    -- JSON array: ["# Intro", "## Setup"]
ALTER TABLE chunks ADD COLUMN seq_index INTEGER;    -- 0-based chunk position in note
ALTER TABLE chunks ADD COLUMN prev_chunk_id TEXT;   -- doubly linked list
ALTER TABLE chunks ADD COLUMN next_chunk_id TEXT;
```

**Schema addition to zvec** (add scalar fields):
```typescript
{ name: "heading_path", dataType: ZVecDataType.STRING },  // serialized JSON
{ name: "seq_index", dataType: ZVecDataType.INT32 },
{ name: "doc_title", dataType: ZVecDataType.STRING },
```

#### B. Context Window Expansion

When `kn ask` retrieves a chunk, it can expand context by following the linked list:

```typescript
function expandContext(chunkId: string, windowSize: number = 1): string {
  const chunk = getChunk(chunkId);
  const parts: string[] = [];
  
  // Prepend heading path as context header
  if (chunk.headingPath?.length) {
    parts.push(chunk.headingPath.join(" > "));
  }
  
  // Expand backward
  let prev = chunk.prevChunkId;
  for (let i = 0; i < windowSize && prev; i++) {
    const p = getChunk(prev);
    parts.unshift(p.content);
    prev = p.prevChunkId;
  }
  
  parts.push(chunk.content);
  
  // Expand forward
  let next = chunk.nextChunkId;
  for (let i = 0; i < windowSize && next; i++) {
    const n = getChunk(next);
    parts.push(n.content);
    next = n.nextChunkId;
  }
  
  return parts.join("\n\n");
}
```

#### C. Frontmatter Metadata Extraction + Propagation

Parse YAML frontmatter and propagate to all chunks of the note:

```typescript
function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };
  
  const metadata: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      metadata[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
    }
  }
  return { metadata, body: match[2] };
}
```

Fields like `title`, `date`, `author`, `category` from frontmatter become searchable metadata on every chunk of that note, enabling filters like:
```bash
kn search "neural networks" --tag ml --after 2024-01-01
```

#### D. Deduplication via Heading Path + Sequence

When hybrid search returns multiple adjacent chunks from the same note, merge them:

```typescript
function deduplicateAdjacentChunks(results: SearchResult[]): SearchResult[] {
  // Group by noteId
  const groups = groupBy(results, r => r.noteId);
  
  return Object.values(groups).flatMap(noteChunks => {
    // Sort by sequence index
    noteChunks.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    
    // Merge adjacent (consecutive seq_index) chunks
    const merged: SearchResult[] = [];
    let current = noteChunks[0];
    
    for (let i = 1; i < noteChunks.length; i++) {
      if (noteChunks[i].sequenceIndex === current.sequenceIndex + 1) {
        // Merge: combine content, keep highest score
        current = {
          ...current,
          content: current.content + "\n" + noteChunks[i].content,
          score: Math.max(current.score, noteChunks[i].score),
          sequenceIndex: noteChunks[i].sequenceIndex,
        };
      } else {
        merged.push(current);
        current = noteChunks[i];
      }
    }
    merged.push(current);
    return merged;
  });
}
```

#### E. Embedding with Structural Context (qmd approach)

qmd formats document chunks for embedding as `"title: {title} | text: {content}"`. This injects document-level context into the embedding vector.

**Recommendation**: Format chunks before embedding:
```typescript
function formatForEmbedding(chunk: ChunkMetadata): string {
  const parts: string[] = [];
  if (chunk.documentTitle) parts.push(`title: ${chunk.documentTitle}`);
  if (chunk.headingPath?.length) parts.push(`section: ${chunk.headingPath.join(" > ")}`);
  if (chunk.documentTags?.length) parts.push(`tags: ${chunk.documentTags.join(", ")}`);
  parts.push(`text: ${chunk.content}`);
  return parts.join(" | ");
}
```

This improves semantic search quality because the embedding vector captures not just the chunk text but its structural position and topic context.

---

## Implementation Priority

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P0 | BM25 score normalization | Blocks correct fusion | Low |
| P0 | FTS5 query builder (injection safety) | Security + quality | Low |
| P0 | Chunk overlap + break-point scoring | Core quality | Medium |
| P1 | CJK preprocessor plugin architecture | Korean search quality (50x improvement) | Medium |
| P1 | Heading hierarchy + chunk linking | Context quality for RAG | Medium |
| P1 | Content-addressed dedup in sync | Performance | Low |
| P1 | Frontmatter parsing + propagation | Metadata search quality | Low |
| P2 | LLM reranking | +7-14% retrieval quality | High |
| P2 | LLM result cache | Latency optimization | Low |
| P2 | Strong-signal shortcut | Latency optimization | Low |
| P3 | Query expansion | Quality (only with reranker) | High |
| P3 | AST-aware chunking for code | Code vault quality | Medium |
| P3 | `kn get` document retrieval | MCP completeness | Low |
| P3 | HTTP daemon mode | Warm model latency | Medium |
