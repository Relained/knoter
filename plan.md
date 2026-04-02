# KN CLI Implementation Plan (Aligned with `specification.md`)

This plan converts `specification.md` into a build-first execution roadmap.

Principles:
- Active hybrid search is external: SQLite FTS5 (keyword) + zvec dense retrieval (semantic) + normalized linear score fusion.
- Sparse-vector generation/query logic is not part of active implementation.
- Metadata/vector consistency is state-based (`pending` -> `synced`) with rollback + recovery + reconciliation.
- CLI remains short-lived; scheduling is delegated to OS-native schedulers.
- Chunk overlap is intentionally deferred (temporarily not implemented).

---

## 0) Current Baseline

- `meta-store.ts`: metadata store APIs are present (`reindexNote`, tags, FTS5 search, vault status).
- `vec-store.ts`: dense retrieval + filter helpers + RRF merge utilities are present.
- `index.ts`: placeholder CLI only; command system is not implemented yet.
- `plan.md` and `specification.md` now use `kn` command namespace.

---

## 1) Foundation Layer (Phase A)

### A1. CLI skeleton and command wiring
- Create `src/cli.ts` as the `kn` entrypoint (Bun runtime).
- Add global options: output format (`text|json|jsonl`), vault selection, verbosity.
- Register subcommands:
  - `vault`, `add`, `search`, `sync`, `tag`, `cluster`, `ask`, `serve`, `schedule`.

### A2. Shared modules
- `src/config.ts`
  - Manage global config at `~/.kn/config.json`.
  - Include provider-ready fields for embedding/LLM (`baseUrl`, `apiKey`, provider name, model).
  - Add model profile map for prompt safety (for example max context per model such as `llama3: 8192`).
  - Implement active vault registry helpers.
- `src/output.ts`
  - Standard success/error envelopes from spec.
- `src/errors.ts`
  - Typed errors and exit-code mapping.

### A3. Vault-local layout policy
- Ensure per-vault operational data under `<vault_root>/.kn/`.
- Keep vault setup compatible with existing `MetaDB`/zvec open/create helpers.

### A4. Vault-level file locking
- Add lock utility (`src/lock.ts`) with lock file path `<vault_root>/.kn/vault.lock`.
- Commands that mutate data (`kn add`, `kn sync`, tag mutating subcommands, optional cluster apply) must:
  - acquire lock at start,
  - fail fast with clear message if lock already exists,
  - release lock on success/failure (`finally`).
- Optional stale-lock policy: if lock age exceeds configured TTL, allow guarded takeover with `--force-lock`.

Deliverable:
- `kn --help` and `kn <subcommand> --help` paths are functional.

---

## 2) Vault Commands (Phase B)

### B1. `kn vault create/list/switch/delete/status`
- Implement using `meta-store.ts` and `vec-store.ts` integration points.
- `create`:
  - create directories
  - `createVaultCollection(...)`
  - initialize `MetaDB`
  - `setEmbeddingModel(...)`
  - register vault in config
- `status`:
  - source from `MetaDB.getVaultStatus(...)`

### B2. Provider config behavior
- Expose provider metadata in vault creation/status output when available.
- Validate provider config shape (`baseUrl`, `apiKey`) without forcing cloud usage.

Deliverable:
- Vault lifecycle is fully operable with structured output.

---

## 3) Ingestion Pipeline (`kn add`) (Phase C)

### C1. Parser + chunker + hasher
- `src/parser.ts`: frontmatter/title/tags extraction.
- `src/chunker.ts`: heading-aware chunking.
- Explicitly no chunk overlap for now (feature flag or TODO marker only).
- File hash generation for changed detection.

### C2. Embedder runtime policy
- `src/embedder.ts` with provider abstraction.
- Local embedding provider explicitly selected:
  - sequential execution only.
- Non-local provider:
  - bounded concurrency (queue + max concurrency + batch size).
- Add retry with exponential backoff and health checks.
- Add fallback path (primary provider failure -> configured fallback provider).

### C3. State-based write consistency
- Implement command write flow:
  1. metadata write with `vector_sync_status = pending`
  2. vector insert/upsert
  3. metadata transition to `synced`
- Add compensating rollback/invalidation on vector failure.
- Ensure search-visible records are `synced` only.
- Keep chunk IDs identical across metadata and zvec.

### C4. `kn add` command contract
- Support `--recursive`, `--tag`, `--dry-run`.
- Do not implement `--watch` or `--changed` here.

Deliverable:
- `kn add` is safe under partial failures and provider instability.

---

## 4) Search Pipeline (`kn search`) (Phase D)

### D1. Mode implementation
- `semantic`:
  - dense embedding query -> zvec dense retrieval.
- `keyword`:
  - SQLite FTS5 retrieval with scalar constraints.
- `hybrid` (default):
  1. FTS5 keyword retrieval
  2. zvec dense retrieval (+ metadata pre-filter)
  3. Per-result-set Min-Max normalization to `[0.0, 1.0]` for both channels
  4. Linear combination scoring (weighted sum) for final ranking

### D1.1 Hybrid score model
- Replace app-level RRF in active ranking path with normalized linear fusion:
  - `final = (w_semantic * semantic_norm) + (w_keyword * keyword_norm)`
- Add tunable weights in config/flags (defaults can start at `0.5 / 0.5`).
- Keep an internal compatibility switch for RRF only if needed for regression comparison.

### D2. Filter and score handling
- Build filters through `tagFilter`, `dateFilter`, `combineFilters` as applicable.
- Replace `--threshold` with explicit score gates:
  - `--semantic-min <float>`: minimum normalized semantic score for candidate inclusion.
  - optional `--keyword-min <float>`: minimum normalized keyword score.
  - optional `--hybrid-min <float>`: minimum final fused score.
- Apply per-channel min filters before final fusion, then apply `top-k` on fused score.
- Update CLI help text to explain how each min-score flag behaves in `hybrid` mode.

### D3. Post-processing
- Deduplicate and merge adjacent/overlapping hits from the same note before returning.

### D4. Sparse removal guardrails
- Remove/avoid active sparse-vector query path in command runtime.

### D5. Threshold UX and compatibility
- Mark legacy `--threshold` as deprecated alias for `--hybrid-min` during migration window.
- Emit deprecation warning in text mode and structured warning field in JSON mode.

Deliverable:
- `kn search` returns stable hybrid results without sparse-vector dependency.

---

## 5) Sync, Recovery, Reconciliation (`kn sync`) (Phase E)

### E1. Core sync modes
- Implement `--full`, `--prune`, `--changed`.
- `--changed` is one-off changed-only execution.

### E2. Recovery at startup
- On command start, scan pending metadata sync state.
- Resume interrupted vector writes and transition to `synced`.

### E3. Reconciliation/integrity checks
- Compare metadata chunk IDs vs zvec document IDs.
- Repair/prune one-sided records according to deterministic policy.
- Run reconciliation in normal and full sync paths.

Deliverable:
- `kn sync` acts as both sync engine and self-healing integrity guard.

---

## 6) Tag, Cluster, Ask, Serve (Phase F)

### F1. `kn tag`
- `list/add/remove/auto`.
- Always synchronize metadata tag state and zvec `tags` fields.

### F2. `kn cluster`
- Default algorithm policy: HDBSCAN.
- Avoid blocking main thread for heavy clustering:
  - worker-thread path first,
  - optional Bun FFI native path for performance.

### F3. `kn ask`
- Reuse `kn search` retrieval path.
- Context-limit + source reporting + routing override.
- Add model profile guardrails:
  - load max context window from config model profile,
  - reserve token budget for system prompt and template overhead,
  - fill retrieval context only within remaining budget,
  - truncate/pack context deterministically when over budget.
- Return budget telemetry in JSON mode (selected model, budget, consumed tokens/chars estimate).

### F4. `kn serve`
- MCP exposure with JSON-only tool responses.
- Map tool calls to implemented `kn` commands.

Deliverable:
- Core feature commands are available with consistent data contracts.

---

## 7) Scheduler Management (`kn schedule`) (Phase G)

### G1. One-off scheduler control commands
- Implement `enable`, `disable`, `status`, `run-now`.

### G2. OS-native delegation
- Register/unregister periodic jobs through OS scheduler adapters:
  - Linux/macOS: `cron`/`launchd`
  - Windows: Task Scheduler (future adapter)
- No internal daemon or in-process timer loop.

### G3. Job chain defaults
- Periodic chain baseline:
  1. `kn sync --prune`
  2. `kn tag auto`
  3. `kn cluster --suggest-merge`

Deliverable:
- Scheduler lifecycle is externally managed, CLI stays short-lived.

---

## 8) Ordering and Dependencies

1. Phase A: CLI foundation + shared config/output/errors
2. Phase B: vault command suite
3. Phase C: `kn add` pipeline + state-driven consistency
4. Phase D: `kn search` external hybrid pipeline
5. Phase E: `kn sync` recovery + reconciliation
6. Phase F: `kn tag`, `kn cluster`, `kn ask`, `kn serve`
7. Phase G: `kn schedule` OS-native integration

Critical dependency notes:
- Phase D depends on C for indexed data shape.
- Phase E depends on C state fields and vector write semantics.
- Phase G depends on E/F operational command stability.

---

## 9) Acceptance Criteria

- No active sparse-vector runtime in `kn search` pipeline.
- `kn add` enforces `pending -> synced` state transition and compensating rollback.
- Local embedding mode runs sequentially; non-local supports bounded concurrency + retry/backoff + fallback.
- `kn sync` repairs interrupted writes and reconciles metadata/vector mismatch.
- Write commands are protected by vault-level lock file and fail fast on lock contention.
- `kn schedule` performs OS scheduler registration only (short-lived CLI process).
- Hybrid ranking uses Min-Max normalized linear combination, with explicit score-min flags.
- `kn ask` enforces model-profile context budget protection.
- All command outputs conform to common envelope in `text/json/jsonl` formats.
