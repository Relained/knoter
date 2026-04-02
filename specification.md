# KN CLI Subcommand Specification (LLM-Oriented)

This document defines executable, LLM-friendly specifications for `kn` CLI subcommands.

Implementation update scope (v2):
- Sparse-vector indexing/generation is removed from the active search architecture.
- Hybrid search is now externalized: SQLite FTS5 (keyword) + zvec dense retrieval (semantic) + Min-Max normalization + linear score fusion.
- Write consistency between metadata and vectors is state-driven (`pending` -> `synced`) with recovery and reconciliation.
- Scheduling is short-process CLI + OS-native scheduler registration (no internal daemon loop).
- Vault-level file locking is required for mutating commands.
- `kn ask` uses model-profile context budget guardrails.
- This file focuses on command behavior updates only.

Scope:
- Included: CLI subcommand behavior and I/O expectations
- Excluded: database structure and schema details

Implementation linkage:
- Metadata layer: `meta-store.ts`
- Vector layer: `vec-store.ts`

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
  1. File discovery/parsing
  2. Chunking
  3. Dense embedding generation
  4. Persist to metadata and vector stores
- Chunking policy (temporary):
  - Chunk overlap is specified at design level but is temporarily NOT implemented.
  - Current implementation should use non-overlap chunking until overlap is explicitly enabled.
- Internal consistency rules:
  - `kn add` is a mutating command and must acquire vault lock (`<vault_root>/.kn/vault.lock`) before write operations.
  - Metadata write should mark vector sync state as `pending` first.
  - Vector write should convert each chunk via `toZVecDoc(chunk)` and then insert/upsert to collection.
  - After successful vector write, metadata sync state should be updated to `synced`.
  - Search-visible records must be isolated to `synced` state only.
  - Insert path must use a rollback wrapper (`try/catch` compensating transaction): if vector write fails, delete or invalidate newly written metadata rows.
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

### `kn search <query> [--mode semantic|keyword|hybrid] [--top <n>] [--threshold <float>] [--tag <tag>...] [--after <date>] [--before <date>]`
- Preferred score flags:
  - `--semantic-min <float>`: minimum normalized semantic score.
  - `--keyword-min <float>`: minimum normalized keyword score.
  - `--hybrid-min <float>`: minimum fused final score.
- Compatibility:
  - `--threshold` is deprecated and should be treated as alias of `--hybrid-min` during migration.
- Purpose: Retrieve chunks relevant to a query.
- Mode behavior:
  - `semantic`: dense-vector retrieval via `semanticQuery`
  - `keyword`: SQLite FTS5 retrieval with scalar conditions (`WHERE` filters)
  - `hybrid` (default):
    1. SQLite FTS5 keyword retrieval + scalar conditions
    2. zvec dense retrieval + zvec metadata pre-filter
    3. Min-Max normalize keyword and semantic channel scores to `[0.0, 1.0]`
    4. Linear fusion (`final = w_semantic * semantic_norm + w_keyword * keyword_norm`)
- Filter handling:
  - Tag filter: `tagFilter(tags)`
  - Date filter: `dateFilter(after, before)`
  - Combined filter: `combineFilters(...)`
- Result normalization:
  - Convert vector docs using `toSearchResult`
  - Apply `--semantic-min` / `--keyword-min` before final fusion
  - Apply final score cutoff with `--hybrid-min` after fusion
  - Deduplicate/merge adjacent overlapping chunk hits from the same note before returning to UI/LLM
- Recommended output fields:
  - `id`, `noteId`, `filePath`, `title`, `heading`, `content`, `tags`, `createdAt`, `score`, `scoreDetail`

Architecture notes:
- Sparse-vector query path is dropped from the active v2 pipeline.
- Keyword relevance must come from SQLite FTS5 in `keyword`/`hybrid` modes.
- Semantic relevance must come from zvec dense retrieval.
- Hybrid composition baseline is FTS5 keyword + zvec metadata + zvec semantic retrieval with normalized linear fusion.

---

## 4) `kn sync`

### `kn sync [--full] [--prune] [--changed]`
- Purpose: Reconcile file-system state with index state.
- Default behavior:
  - Acquire vault lock before mutating operations.
  - Scan notes directory
  - New/changed files: process through `kn add` pipeline
  - Deleted files: remove related note/chunk/tag metadata and vector entries
- Option semantics:
  - `--full`: rebuild full index
  - `--prune`: remove only entries whose source files no longer exist
  - `--changed`: one-off run that processes changed files only
- Internal linkage points:
  - Metadata identification should use `getNoteByPath`, `listNotes`, `deleteNote(s)` family APIs
  - Vector cleanup should be aligned by note/chunk IDs

Recovery behavior:
- On start, `kn sync` should resume interrupted vector sync work by scanning metadata entries with `vector_sync_status = 'pending'`.
- Recovery should attempt vector upsert and then mark those entries as `synced`.

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

## 7) `kn ask`

### `kn ask <question> [--context-limit <n>] [--model <name>] [--routing auto|local|cloud] [--show-sources] [--raw]`
- Purpose: Produce a RAG answer with retrieved context.
- Default pipeline:
  1. Retrieve relevant chunks via `kn search`
  2. Build context from top-N results (`--context-limit`)
  3. Call LLM and generate answer
  4. Include sources (`notePath`, `chunkId`) when requested
- Internal linkage:
  - Retrieval should follow the same query-builder/hybrid logic in `vec-store.ts`

Model-profile context safety:
- `kn ask` should load max context limits from config model profiles.
- Prompt assembly must reserve budget for system instructions/template overhead.
- Retrieved context should be packed only within remaining budget.
- If overflow occurs, apply deterministic truncation/packing strategy.

---

## 8) `kn serve`

### `kn serve [--transport stdio|sse] [--port <int>]`
- Purpose: Expose CLI capabilities as MCP tools.
- Recommended tool mappings:
  - `kn_search` -> `kn search`
  - `kn_add_note` -> `kn add`
  - `kn_vault_status` -> `kn vault status`
  - `kn_cluster` -> `kn cluster`
  - `kn_tag_auto` -> `kn tag auto`
  - `kn_ask` -> `kn ask`
- Output contract:
  - MCP mode should use JSON-only payloads

---

## 9) `kn schedule`

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

## 10) Common Output Contract

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

## 11) Implementation Consistency Checklist (for LLM Agents)

- `kn add`/`kn sync` must keep chunk IDs identical between metadata and vector layers.
- `kn add` must write metadata with `pending`, then vector data, then flip to `synced`; search should read `synced` only.
- `kn add` insert path must include compensating rollback/invalidation when vector write fails.
- Mutating commands must use vault-level lock file (`.kn/vault.lock`) and fail fast on lock contention.
- Local embedding mode should run sequentially; non-local mode should use bounded concurrency with retry/backoff.
- Embedding provider fallback path must be available when primary provider fails.
- `kn add` should not implement `--watch` or `--changed`; changed-only flow belongs to `kn sync --changed`.
- Search filters should be composed through `tagFilter` / `dateFilter` / `combineFilters`.
- Active hybrid retrieval should be FTS5 (keyword) + dense zvec (semantic) + Min-Max normalization + linear fusion.
- Use explicit score-min flags (`--semantic-min`, `--keyword-min`, `--hybrid-min`); keep `--threshold` only as deprecated alias.
- Sparse-vector logic should not be used by active `kn search` modes.
- `kn sync` should include reconciliation (metadata IDs vs vector IDs) and self-healing.
- After `kn tag add/remove/auto`, metadata tags and vector `tags` fields must be synchronized.
- `kn vault status` output should derive from `MetaDB.getVaultStatus`.
- `kn ask` should enforce model-profile context budget limits.
