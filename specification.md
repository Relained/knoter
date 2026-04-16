# KN CLI Subcommand Specification (LLM-Oriented)

This document defines executable, LLM-friendly specifications for `kn` CLI subcommands.

Implementation update scope (v3):
- Sparse-vector indexing/generation is removed from the active search architecture.
- Hybrid search is now externalized: SQLite FTS5 (keyword) + zvec dense retrieval (semantic) + BM25 score normalization + linear score fusion.
- Write consistency between metadata and vectors is state-driven (`pending` -> `synced`) with recovery and reconciliation.
- Scheduling is short-process CLI + OS-native scheduler registration (no internal daemon loop).
- Vault-level file locking is required for mutating commands.
- `kn ask` uses model-profile context budget guardrails.
- Smart chunking with break-point scoring, 15% overlap, and heading hierarchy tracking.
- CJK-compatible FTS5 via external preprocessor plugin architecture (morphological tokenization).
- Optional LLM reranking and query expansion stages in hybrid search pipeline.
- Content-addressed deduplication via file hash for incremental indexing.
- Structural chunk metadata: heading path, chunk linking (prev/next), frontmatter propagation.
- FTS5 query builder with injection safety.
- Strong-signal shortcut to skip expensive LLM stages when retrieval confidence is high.
- New subcommands: `kn get`, `kn context`, `kn preprocessor`.
- This file focuses on command behavior updates only.

Scope:
- Included: CLI subcommand behavior and I/O expectations
- Excluded: database structure and schema details

Implementation linkage:
- Metadata layer: `meta-store.ts`
- Vector layer: `vec-store.ts`
- Preprocessor layer: `preprocess.ts`

---

## 1) `kn vault`

### 1.1 `kn vault create <name> [--path <dir>] [--model <embedding-model>]`
- Purpose: Initialize a new vault workspace.
- Default behavior:
  - Create vault root and `.kn/` directory.
  - Create vector collection via `createVaultCollection(indexDir, vaultName, model)`.
  - Persist vault embedding model via `MetaDB.setEmbeddingModel(vaultId, model)`.
- Success payload should include:
  - Created vault name/path
  - Effective embedding model
  - Provider configuration summary (embedding/LLM endpoint metadata)

### 1.6 Vault config behavior (applies to vault-scoped operations)
- Purpose: Define provider-compatible runtime settings for local/cloud expansion.
- Required config shape:
  - Embedding provider fields should support `baseUrl` and `apiKey`.
  - LLM provider fields should support `baseUrl` and `apiKey`.
  - Model profile fields should support per-model max context (for example `llama3: 8192`).
- Notes:
  - This is a behavior requirement for CLI commands that read vault config.
  - It does not introduce a new subcommand in this spec.

### 1.2 `kn vault list`
- Purpose: List all registered vaults.
- Success payload should include:
  - Vault names
  - Active vault marker (if any)

### 1.3 `kn vault switch <name>`
- Purpose: Change active vault for the current session.
- Success payload should include:
  - Active vault name

### 1.4 `kn vault delete <name> [--confirm]`
- Purpose: Remove a vault.
- Default behavior:
  - Require safety confirmation unless `--confirm` is provided.
  - Remove vault-local metadata/vector stores together.

### 1.5 `kn vault status [<name>]`
- Purpose: Retrieve aggregated vault status.
- Internal linkage:
  - Use `MetaDB.getVaultStatus(vaultId)`.
- Example status fields:
  - `noteCount`, `chunkCount`, `tagCount`, `lastIndexedAt`, `embeddingModel`

---

## 2) `kn add`

### `kn add <file|dir|glob> [--recursive] [--tag <tag>...] [--dry-run]`
- Purpose: Ingest notes and index them into searchable units.
- Processing pipeline:
  1. File discovery and frontmatter/title/tags extraction
  2. Smart chunking with structural metadata
  3. Dense embedding generation (with structural context formatting)
  4. Persist to metadata and vector stores
- Parsing policy:
  - YAML frontmatter extraction: parse `title`, `date`, `author`, `category`, `tags` and other key-value pairs between `---` delimiters.
  - Title extraction priority: frontmatter `title`/`name` field -> first `# Heading` -> first non-empty line -> filename stem.
  - Extracted frontmatter fields should be propagated as metadata to all chunks of the note.
  - If a preprocessor is bound to the vault, raw content must pass through the preprocessor before FTS5 indexing.
- Chunking policy:
  - Target chunk size: 512 tokens (~2048 chars at 4 chars/token).
  - Chunk overlap: 15% of chunk size (~77 tokens).
  - Minimum chunk size: 100 tokens. Chunks shorter than the minimum should be merged with their predecessor.
  - Break-point scoring algorithm:
    - Scan document for structural break points with base scores:
      - `# Heading` = 100, `## Heading` = 90, `### Heading` = 80, `#### Heading` = 70, `##### Heading` = 60, `###### Heading` = 50
      - Code fence boundary (`` ``` ``) = 80, horizontal rule (`---`/`***`) = 60
      - Blank line = 20, list item = 5, bare newline = 1
    - When approaching target chunk size, search a 200-token window before the cutoff.
    - Score each candidate break point with quadratic distance decay: `adjusted = base_score * (1 - (distance/window)^2 * 0.7)`
    - Cut at the highest-scoring break point within the window.
    - Code fence protection: break points inside fenced code blocks must be ignored.
    - If no qualifying break point exists in the window, fall back to the nearest character boundary at the target position.
  - AST-aware chunking (optional, `--chunk-strategy auto`):
    - For supported code files (`.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rs`), parse with tree-sitter and add AST break points merged with regex scores.
    - AST break-point scores: class/interface/struct/impl/trait = 100, function/method = 90, type alias/enum = 80, import = 60.
    - Markdown and other file types always use regex-based chunking regardless of strategy.
- Structural chunk metadata:
  - Each chunk must record its heading ancestry as `heading_path` (for example `["# Introduction", "## Background"]`).
  - Each chunk must record its 0-based `seq_index` position among all chunks of the same note.
  - Chunks must form a doubly-linked list via `prev_chunk_id` / `next_chunk_id` within the same note.
  - The parent note's `title`, `tags`, and frontmatter fields should be propagated to each chunk for search enrichment.
- Embedding format:
  - Before embedding, each chunk should be formatted with structural context: `"title: {doc_title} | section: {heading_path} | tags: {tags} | text: {content}"`.
  - This format improves semantic search quality by injecting document-level context into the embedding vector.
- Content-addressed deduplication:
  - Before indexing, compute file content hash (SHA-256) and compare against stored `file_hash` for the same vault.
  - If hash matches an existing note and no `--force` flag is set, skip re-indexing that file.
  - This makes `kn add` and `kn sync` incremental: only new or changed files are processed.
- Internal consistency rules:
  - `kn add` is a mutating command and must acquire vault lock (`<vault_root>/.kn/vault.lock`) before write operations.
  - Metadata write should mark vector sync state as `pending` first.
  - Vector write should convert each chunk via `toZVecDoc(chunk)` and then insert/upsert to collection.
  - After successful vector write, metadata sync state should be updated to `synced`.
  - Search-visible records must be isolated to `synced` state only.
  - Insert path must use a rollback wrapper (`try/catch` compensating transaction): if vector write fails, delete or invalidate newly written metadata rows.
  - Prefer idempotent vector upsert for recovery: on `kn sync` recovery, scan pending entries and retry upsert rather than deleting metadata.
  - Chunk IDs must be identical across both layers (`chunks.id == zvec doc id`).
- Embedding execution policy:
  - If local embedding provider/model is explicitly selected, embedding requests must run sequentially to avoid local runtime overload.
  - Otherwise, bounded concurrency is allowed (queue + max concurrency + batch size).
  - Embedding calls must include retry with exponential backoff and health/error checks.
  - Fallback provider path must be supported (for example local -> cloud) through provider config and/or command-level override.
- Option semantics:
  - `--recursive`: recurse through directories
  - `--tag`: add manual tags (merged with extracted tags)
  - `--dry-run`: return parse/chunk results without persistence

Removed options:
- `--watch` is removed from `kn add` (moved out of single-command responsibility).
- `--changed` is not part of `kn add`; it belongs to `kn sync`.

Provider behavior:
- `kn add` should accept provider override behavior (for example `--provider <name>`) if configured by implementation.

---

## 3) `kn search`

### `kn search <query> [--mode semantic|keyword|hybrid] [--top <n>] [--threshold <float>] [--tag <tag>...] [--after <date>] [--before <date>] [--rerank] [--expand]`
- Preferred score flags:
  - `--semantic-min <float>`: minimum normalized semantic score.
  - `--keyword-min <float>`: minimum normalized keyword score.
  - `--hybrid-min <float>`: minimum fused final score.
- Compatibility:
  - `--threshold` is deprecated and should be treated as alias of `--hybrid-min` during migration.
- Purpose: Retrieve chunks relevant to a query.

FTS5 query builder (injection safety):
- User input must never be passed directly to FTS5 MATCH.
- Build structured FTS5 queries from user input:
  - Bare terms become prefix matches: `"term"*`
  - Quoted phrases stay exact: `"exact phrase"`
  - Negation: `-bad` becomes `NOT "bad"`
  - All positive terms are ANDed.
  - Inner double-quotes must be escaped (doubled) to prevent FTS5 syntax injection.
- If a preprocessor is bound to the vault, the query string must pass through the same preprocessor before FTS5 query construction.

BM25 score normalization:
- FTS5 returns negative raw scores (more negative = better match).
- Normalize to `[0, 1]` before fusion: `normalized = pos / (1 + pos)` where `pos = -raw_score`.
- This normalization is required for meaningful linear fusion with vector cosine scores.

- Mode behavior:
  - `semantic`: dense-vector retrieval via `semanticQuery`
  - `keyword`: SQLite FTS5 retrieval with scalar conditions (`WHERE` filters), scores normalized
  - `hybrid` (default):
    1. SQLite FTS5 keyword retrieval + scalar conditions -> normalize BM25 scores
    2. zvec dense retrieval + zvec metadata pre-filter
    3. Linear score fusion: `final = alpha * vec_score + (1 - alpha) * bm25_norm` (default alpha = 0.80)
    4. Fusion weights should be configurable via vault config or flags (default `0.80` semantic / `0.20` keyword, tuned on BEIR benchmarks).

Strong-signal shortcut:
- After score fusion, if the top result shows a clear winner, skip LLM enhancement stages (expansion, reranking) to reduce latency.
- Shortcut condition: `top_score * (top_score - second_score) >= 0.06` AND `top_score >= 0.40`.
- Single-result above floor (>= 0.40) also qualifies as strong signal.
- BM25-only tier-0 shortcut (before vector retrieval): `top_bm25 >= 0.75` AND `gap >= 0.10`.

Optional LLM reranking (`--rerank`):
- When enabled and a reranker model is available, rerank top-20 fused results using a cross-encoder LLM (for example Qwen3-Reranker 0.6B).
- Final score blending: `final = fused_score * 0.4 + rerank_score * 0.6`.
- Reranker scores should be cached in metadata store keyed by `sha256(model_id + query + content_hash)`.
- Cached scores skip LLM inference entirely on repeated queries.
- Expected quality gain: +7% to +14.5% nDCG@10 on conversational/argument retrieval.

Optional query expansion (`--expand`):
- When enabled and an expander model is available, generate typed sub-queries:
  - `lex`: keyword-optimized reformulation for BM25
  - `vec`: semantic embedding-optimized reformulation
  - `hyde`: hypothetical document embedding
- Each sub-query is searched independently; results are fused via RRF across sub-query result lists.
- Expander outputs should be cached globally keyed by `sha256(model_id + query)`.
- Safety constraint: expansion must only be enabled when a reranker is also available. Expansion without reranking is harmful (measured -0.53% nDCG on NFCorpus, p<0.05).

- Filter handling:
  - Tag filter: `tagFilter(tags)`
  - Date filter: `dateFilter(after, before)`
  - Combined filter: `combineFilters(...)`
- Result normalization:
  - Convert vector docs using `toSearchResult`
  - Apply `--semantic-min` / `--keyword-min` before final fusion
  - Apply final score cutoff with `--hybrid-min` after fusion
- Adjacent chunk deduplication:
  - Group results by `noteId`, sort by `seq_index`.
  - Merge consecutive chunks (adjacent `seq_index` values) from the same note into a single result.
  - Merged result keeps the highest score among merged chunks.
  - Merged content is concatenated in sequence order.
- Recommended output fields:
  - `id`, `noteId`, `filePath`, `title`, `heading`, `headingPath`, `content`, `tags`, `createdAt`, `score`, `scoreDetail`

Architecture notes:
- Sparse-vector query path is dropped from the active v3 pipeline.
- Keyword relevance must come from SQLite FTS5 in `keyword`/`hybrid` modes.
- Semantic relevance must come from zvec dense retrieval.
- Hybrid composition baseline is FTS5 keyword (normalized) + zvec semantic retrieval with weighted linear fusion.
- Full hybrid pipeline when LLM stages are enabled: fusion -> strong-signal check -> query expansion -> RRF -> reranking -> final blend.

---

## 4) `kn sync`

### `kn sync [--full] [--prune] [--changed]`
- Purpose: Reconcile file-system state with index state.
- Default behavior:
  - Acquire vault lock before mutating operations.
  - Scan notes directory
  - Content-addressed change detection: compute SHA-256 hash per file and compare against stored `file_hash`. Only process files whose hash differs or is absent.
  - New/changed files: process through `kn add` pipeline
  - Deleted files: remove related note/chunk/tag metadata and vector entries
- Option semantics:
  - `--full`: rebuild full index (ignore hash comparison, re-process everything)
  - `--prune`: remove only entries whose source files no longer exist
  - `--changed`: one-off run that processes changed files only
- Internal linkage points:
  - Metadata identification should use `getNoteByPath`, `listNotes`, `deleteNote(s)` family APIs
  - Vector cleanup should be aligned by note/chunk IDs

Recovery behavior:
- On start, `kn sync` should resume interrupted vector sync work by scanning metadata entries with `vector_sync_status = 'pending'`.
- Recovery should attempt idempotent vector upsert and then mark those entries as `synced`.
- Prefer upsert-based recovery over delete-and-retry to avoid orphaning metadata.

Reconciliation behavior:
- `kn sync` should support integrity checks between metadata chunk IDs and zvec document IDs.
- For one-sided records (metadata-only or vector-only), sync must repair or prune according to policy so both stores converge.
- Reconciliation must run in both normal sync flow and `--full` rebuild flow.

---

## 5) `kn tag`

### 5.1 `kn tag list`
- Purpose: Show tag distribution in the vault.
- Internal linkage:
  - `MetaDB.listAllTags(vaultId)`

### 5.2 `kn tag add <file|glob> <tag>...`
- Purpose: Add tags to matched notes.
- Internal linkage:
  - Metadata: `MetaDB.addTag(noteId, tag, "manual")`
  - Vector: upsert affected chunks to sync `tags` field

### 5.3 `kn tag remove <file|glob> <tag>...`
- Purpose: Remove tags from matched notes.
- Internal linkage:
  - Metadata: `MetaDB.removeTag(noteId, tag)`
  - Vector: sync affected chunks' `tags` field

### 5.4 `kn tag auto [--dry-run]`
- Purpose: Auto-suggest/apply tags from note content.
- Default behavior:
  - Generate suggestions; if `--dry-run`, return suggestions only
  - On apply, persist tags with `source="auto"`

---

## 6) `kn cluster`

### `kn cluster [--algorithm <alg>] [--min-cluster <int>] [--tag <tag>...] [--suggest-merge] [--apply]`
- Purpose: Group similar notes/chunks and provide organization hints.
- Default algorithm policy:
  - Use HDBSCAN as the default clustering algorithm (instead of K-means).
  - Cluster count should be inferred automatically; noisy points should be filtered naturally.
- Input data:
  - Dense vectors plus metadata fields (tags, paths, etc.)
- Output:
  - Cluster groups
  - Optional merge suggestions (`--suggest-merge`)
  - Optional metadata/tag updates (`--apply`)

Performance policy:
- Heavy clustering computation should not block the main CLI thread.
- Preferred execution paths: worker-thread offloading or Bun FFI to native modules (Rust/C++).

---

## 7) `kn get`

### `kn get <path|id> [--collection <name>] [--section <heading>] [--offset <int>] [--max-chars <int>] [--json]`
- Purpose: Retrieve full document content by path, chunk ID, or substring match.
- Path resolution order:
  1. Exact `file_path` match
  2. Suffix match (`%/path`)
  3. Substring match
- Option semantics:
  - `--section <heading>`: extract only the named heading section (case-insensitive match).
  - `--offset <int>`: start from character offset within the document.
  - `--max-chars <int>`: truncate output to N characters.
  - `--json`: return full metadata as JSON envelope.
- On miss, return suggestions of similar file paths (fuzzy matching) in the error payload.
- Internal linkage:
  - Use `MetaDB.getNoteByPath(vaultId, filePath)` for path lookup.
  - Read file content from disk using the stored `file_path`.

### `kn get <id1> <id2> ... [--max-chars <int>] [--json]`
- Purpose: Batch retrieve multiple documents.
- Returns `{ found: [...], not_found: [...] }` structure in JSON mode.

---

## 8) `kn context`

### 8.1 `kn context add <path> <description>`
- Purpose: Attach descriptive metadata to a path or path prefix within the vault.
- Context is hierarchical: a description on `docs/api/` applies to all notes under that prefix.
- Context descriptions are returned alongside search results to help LLMs understand document purpose.
- Internal linkage:
  - Store in `contexts` table: `(vault_id, path_prefix, description)`.

### 8.2 `kn context list`
- Purpose: Show all registered context descriptions for the active vault.

### 8.3 `kn context remove <path>`
- Purpose: Remove context description for a path.

### 8.4 `kn context set-global <description>`
- Purpose: Set a vault-wide context description that applies to all notes.

---

## 9) `kn preprocessor`

### 9.1 Purpose
CJK languages (Korean, Japanese, Chinese) and other agglutinative languages require morphological tokenization for effective BM25 keyword search. Without preprocessing, FTS5 treats agglutinated words as single tokens, producing near-zero recall.

Preprocessor plugin architecture uses an external process protocol:
- Protocol: stdin/stdout, line-by-line. One UTF-8 line in, one tokenized UTF-8 line out.
- Process stays alive between lines (no per-line spawn overhead).
- Any executable following this protocol can be registered.

### 9.2 `kn preprocessor install <language>`
- Purpose: Download and register a pre-built preprocessor binary for a supported language.
- Supported languages:
  - `ko`: Korean — lindera with ko-dic dictionary, Mode::Decompose for compound decomposition. Filters non-content morphemes (particles, endings, affixes, symbols). Output: content morphemes only, space-separated.
  - `ja`: Japanese — lindera with ipadic dictionary.
  - `zh`: Chinese — bigram tokenizer (splits CJK text into overlapping bigrams).
- Binaries are downloaded from project releases and cached locally.
- After install, show interactive prompt to bind to vault(s) immediately.

### 9.3 `kn preprocessor add <alias> <command>`
- Purpose: Register a custom preprocessor from any executable.
- Example: `kn preprocessor add mecab "mecab -Owakati"`

### 9.4 `kn preprocessor bind <alias> [<vault>]`
- Purpose: Bind a registered preprocessor to a vault. Triggers FTS5 re-index.
- When bound:
  - FTS5 tokenizer should switch from `trigram` to `unicode61` (morphological preprocessor handles segmentation).
  - All existing FTS5 content must be rebuilt through the preprocessor.
  - Both index-time content and query-time queries pass through the preprocessor.

### 9.5 `kn preprocessor list`
- Purpose: Show registered preprocessors and their vault bindings.

### 9.6 `kn preprocessor remove <alias> [--delete]`
- Purpose: Unregister a preprocessor. `--delete` also removes the binary.

### 9.7 Preprocessor chain behavior
- Multiple preprocessors can be chained: output of one feeds into the next.
- Each preprocessor specializes in one language and passes other text through unchanged.
- FTS5's own tokenizer always runs as the final stage after all preprocessors.

Expected quality impact (Korean MIRACL benchmark, 213 queries):
- No preprocessor: nDCG@10 = 0.0009
- Lindera morphological: nDCG@10 = 0.0460 (50x gain)
- Lindera + hybrid + rerank: nDCG@10 = 0.8411

---

## 10) `kn ask`

### `kn ask <question> [--context-limit <n>] [--context-window <int>] [--model <name>] [--routing auto|local|cloud] [--show-sources] [--raw]`
- Purpose: Produce a RAG answer with retrieved context.
- Default pipeline:
  1. Retrieve relevant chunks via `kn search` (hybrid mode, with reranking if available)
  2. Expand context using chunk linked list (`--context-window`, default 1)
  3. Build context from top-N results (`--context-limit`)
  4. Call LLM and generate answer
  5. Include sources (`notePath`, `chunkId`) when requested
- Internal linkage:
  - Retrieval should follow the same query-builder/hybrid logic in `vec-store.ts`

Context window expansion:
- For each retrieved chunk, follow `prev_chunk_id` / `next_chunk_id` links to include surrounding chunks.
- `--context-window <int>`: number of neighbor chunks to include on each side (default: 1, meaning 1 prev + hit + 1 next = up to 3 chunks per result).
- Prepend the chunk's `heading_path` as a context header (for example `"Introduction > Background > Prior Work"`).
- If path contexts are registered via `kn context`, include the matching context description as a preamble for that result.

Context assembly format:
- Each retrieved result should be formatted as:
  ```
  [Source: {filePath} | Section: {headingPath}]
  {context_description (if registered)}
  {expanded_content}
  ```

Model-profile context safety:
- `kn ask` should load max context limits from config model profiles.
- Prompt assembly must reserve budget for system instructions/template overhead.
- Retrieved context should be packed only within remaining budget.
- If overflow occurs, apply deterministic truncation/packing strategy: drop lowest-scored results first, then truncate the last included result.

LLM cache integration:
- `kn ask` should check the LLM cache for previously generated answers to identical queries against the same vault state.
- Cache key: `sha256(model + query + sorted_chunk_ids)`.
- Cached answers should be returned immediately with a `cached: true` flag in JSON output.

---

## 11) `kn serve`

### `kn serve [--transport stdio|sse|http] [--port <int>] [--daemon]`
- Purpose: Expose CLI capabilities as MCP tools.
- Transport modes:
  - `stdio` (default): launched as subprocess by each MCP client.
  - `sse`: Server-Sent Events transport.
  - `http`: HTTP Streamable transport. Exposes `POST /mcp` (MCP JSON) and `GET /health` (liveness).
- Daemon mode (`--daemon`):
  - When `--http --daemon` is specified, start as background process, write PID to `<vault_root>/.kn/mcp.pid`.
  - `kn serve stop`: stop daemon via PID file.
  - Embedding/reranker models stay loaded in memory across requests for warm latency (~30ms vs ~3s cold).
  - Idle model disposal: dispose embedding/reranking contexts after 5 minutes idle, recreate transparently on next request.
- Recommended tool mappings:
  - `kn_search` -> `kn search`
  - `kn_add_note` -> `kn add`
  - `kn_vault_status` -> `kn vault status`
  - `kn_cluster` -> `kn cluster`
  - `kn_tag_auto` -> `kn tag auto`
  - `kn_ask` -> `kn ask`
  - `kn_get` -> `kn get`
  - `kn_multi_get` -> `kn get` (batch)
  - `kn_context` -> `kn context`
  - `kn_update` -> `kn sync`
- Output contract:
  - MCP mode should use JSON-only payloads

---

## 12) `kn schedule`

### `kn schedule enable [--interval <duration>]`
- Purpose: Register periodic maintenance jobs through OS-level schedulers.
- Recommended task chain:
  1. `kn sync --prune`
  2. `kn tag auto`
  3. `kn cluster --suggest-merge`

Execution model:
- `kn schedule` commands are one-off scheduler management commands.
- They configure timer-based automatic execution of `kn sync` and related jobs.
- In-process timer loops (for example `setInterval` in a long-running CLI process) are not part of this spec.
- Platform integrations should target native schedulers (for example `cron` on Linux, `launchd` on macOS).
- The CLI itself remains a short-lived process; periodic execution is delegated to OS-native schedulers.

### `kn schedule disable`
- Purpose: Unregister scheduler entries previously created by `kn schedule enable`.

### `kn schedule status`
- Purpose: Show scheduler state and last run result.

### `kn schedule run-now`
- Purpose: Execute the configured maintenance task chain immediately once.

---

## 13) Common Output Contract

- `text`: human-readable
- `json`: tool/LLM-friendly (recommended)
- `jsonl`: stream-friendly

Minimum success envelope:
- `ok: true`
- `command`, `vault`, `timestamp`
- command-specific `data`

Minimum error envelope:
- `ok: false`
- `error.code`, `error.message`
- `command`, `vault` (when available)

---

## 14) Implementation Consistency Checklist (for LLM Agents)

Data consistency:
- `kn add`/`kn sync` must keep chunk IDs identical between metadata and vector layers.
- `kn add` must write metadata with `pending`, then vector data, then flip to `synced`; search should read `synced` only.
- `kn add` insert path must include compensating rollback/invalidation when vector write fails. Prefer idempotent upsert for recovery.
- Mutating commands must use vault-level lock file (`.kn/vault.lock`) and fail fast on lock contention.
- After `kn tag add/remove/auto`, metadata tags and vector `tags` fields must be synchronized.
- Content-addressed dedup: `kn add`/`kn sync` must compare file hash before re-indexing; skip unchanged files unless `--full`/`--force`.

Embedding and provider:
- Local embedding mode should run sequentially; non-local mode should use bounded concurrency with retry/backoff.
- Embedding provider fallback path must be available when primary provider fails.
- Chunks must be formatted with structural context before embedding: `"title: X | section: Y | tags: Z | text: content"`.

Chunking and structure:
- Smart chunking must use break-point scoring with quadratic distance decay and 15% overlap.
- Each chunk must store `heading_path`, `seq_index`, `prev_chunk_id`, `next_chunk_id`.
- Frontmatter fields must be propagated from note to all its chunks.
- Minimum chunk size (100 tokens) must be enforced; short chunks merge with predecessor.

Search pipeline:
- FTS5 queries must go through the injection-safe query builder; never pass raw user input to MATCH.
- BM25 raw scores must be normalized to `[0, 1]` via `pos / (1 + pos)` before fusion.
- Active hybrid retrieval should be FTS5 keyword (normalized) + dense zvec (semantic) + weighted linear fusion (default alpha = 0.80 vec / 0.20 keyword).
- Search filters should be composed through `tagFilter` / `dateFilter` / `combineFilters`.
- Use explicit score-min flags (`--semantic-min`, `--keyword-min`, `--hybrid-min`); keep `--threshold` only as deprecated alias.
- Sparse-vector logic should not be used by active `kn search` modes.
- Strong-signal shortcut must be checked before LLM enhancement stages.
- Adjacent overlapping chunk hits from the same note must be deduplicated/merged by `seq_index` before returning.

LLM enhancement:
- Query expansion must only be enabled when a reranker is also available (expansion without reranking is harmful).
- Reranker scores must be cached by `sha256(model_id + query + content_hash)`.
- Expander outputs must be cached by `sha256(model_id + query)`.
- LLM cache entries should be stored in the metadata store.

Preprocessor:
- If a preprocessor is bound to a vault, both index-time content and query-time queries must pass through the same preprocessor.
- FTS5 tokenizer must switch from `trigram` to `unicode61` when a morphological preprocessor is bound.
- Rebinding or removing a preprocessor must trigger FTS5 re-index.

Context and retrieval:
- `kn ask` context expansion must follow chunk `prev_chunk_id`/`next_chunk_id` links.
- `kn ask` should enforce model-profile context budget limits; drop lowest-scored results first on overflow.
- `kn context` descriptions must be included in search result payloads and `kn ask` context assembly.

Sync and recovery:
- `kn sync` should include reconciliation (metadata IDs vs vector IDs) and self-healing.
- `kn sync` recovery should use idempotent upsert for pending entries, not delete-and-retry.
- `kn add` should not implement `--watch` or `--changed`; changed-only flow belongs to `kn sync --changed`.

Other:
- `kn vault status` output should derive from `MetaDB.getVaultStatus`.
- `kn serve` HTTP daemon must manage model warmth (load on first request, dispose after idle timeout).
- `kn serve` tool mappings must include `kn_get`, `kn_multi_get`, `kn_context`, `kn_update`.
