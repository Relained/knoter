# knoter CLI Agent Guide

Last updated: 2026-06-11
Project: `Documents/knoter/cli`
Language for this file: English

This is the single active agent instruction file for the CLI package.
Claude-specific guidance was merged here; `CLAUDE.md` is no longer maintained.

## Project Snapshot

`knoter` is a Bun/TypeScript CLI inside a monorepo:

- `cli/`: CLI — vault management, indexing, agent work queue, search,
  OS service scheduling.
- `../web/`: React/Vite HTML workbench frontend with an Electron dev shell.
- `../res/templates/`: vault seed content (workflow contract + per-artifact
  templates with default HTML).
- `../docs/`: shared architecture, codebase, planning, testing docs.

The CLI never calls an LLM API directly (embedding endpoint only). LLM work
is done by an external agent process (codex/claude CLI) that `kn sync` spawns
in the vault working directory; the agent reads vault files and `kn search`,
then maintains `artifacts/` markdown + HTML.

## Active Boundaries

- Command surface: `kn vault init|list|switch|delete|status`, `kn sync`,
  `kn search`, `kn service install|uninstall|status`. Nothing else.
- Configuration is file-based only: `~/.config/knoter/config.json` (global:
  vault registry, defaultVaultDir, agent backends, embedding defaults, sync
  interval) + `<vault>/config.json` (partial override). No `KN_*` env vars.
- Vault layout: `<vault>/{templates,sources,artifacts}/` + `<vault>/.db/`
  (meta.db, vectors, vault.lock) + optional `<vault>/config.json`.
  `kn vault init` seeds `templates/` from `../res/templates/`;
  `kn vault delete` removes only `.db/` and the registry entry.
- Layers: `source | artifact` (legacy `rewritten` is fully removed). All
  notes are chunked into FTS; only `kind: llm-wiki` artifacts are embedded
  into zvec — semantic search is llm-wiki-scoped by construction.
- `kn search` default scope `llm-wiki` (hybrid); `--scope
  artifacts|sources|all` is keyword-only and forces keyword mode.
- `kn sync` flow: index pass → enqueue source changes (`agent_queue`) →
  spawn `agent.backend` with a work prompt (skip with reason when not
  configured) → re-index → mark queue items done on exit 0.
- Read surfaces (`kn search`, `kn vault status`) run an index-only implicit
  sync, debounced 10s via meta.db `sync_state`.
- MCP/skill exposure is a future plan; the previous MCP implementation was
  discarded and deleted.

## Runtime And Tools

Use Bun by default:

- Run these commands from `cli/` unless a command explicitly says otherwise.
- Use `bun run src/cli.ts --help` for local CLI execution.
- Use `bunx tsc --noEmit` for the current ad hoc typecheck (the test suite is
  removed pending reintroduction).
- Use `bun install`, not npm/yarn/pnpm, inside `cli/`.
- Prefer Bun-native APIs where already used: `bun:sqlite`, `Bun.file`,
  `Bun.spawn`.

Default local endpoints:

- Embedding API: `http://127.0.0.1:39280`
- Web dev/preview: `http://127.0.0.1:39281`

Package metadata is not final yet: `package.json` still uses the legacy name
`nlpr`, has no `bin.kn`, and has no package-local `check` script. That cleanup
is tracked as P1 work.

## Code Map

| Path | Role |
| --- | --- |
| `src/cli.ts` | Commander entrypoint (vault, sync, search, service). |
| `src/commands/vault.ts` | Vault init (layout + template seeding), registry, status. |
| `src/commands/sync.ts` | Index → queue → agent spawn → re-index orchestration. |
| `src/commands/search.ts` | Scope-based search wrapper. |
| `src/commands/service.ts` | macOS launchd registration for periodic `kn sync` + endpoint probe. |
| `src/core/config.ts` | Global/vault config files, merge, vault registry. No env vars. |
| `src/core/sync.ts` | Vault scan/index, queue enqueue, `ensureVaultSynced` debounce. |
| `src/core/agent-runner.ts` | Work prompt assembly + agent backend spawn. |
| `src/core/document-graph.ts`, `note-lineage.ts`, `lock.ts`, `output.ts`, `logger.ts`, `errors.ts` | Shared infrastructure. |
| `src/stores/meta-store.ts` | Unified SQLite CRUD: notes, chunks, FTS, agent_queue, sync_state, graph. |
| `src/stores/vault-store.ts` | Unified note CRUD facade over meta.db + zvec + embedder (llm-wiki-only embedding). |
| `src/stores/vec-store.ts` | zvec vector schema/helpers (llm-wiki chunks only). |
| `src/pipeline/*` | Markdown parsing, chunking, hashing, embedding, preprocessing. |
| `src/search/*` | Scope-based keyword/semantic/hybrid retrieval and fusion. |

Read these docs before larger changes:

- `../docs/architecture.md`
- `../docs/codebase.md`
- `../docs/plan/` (progress.md, roadmap.md)
- `../docs/testing.md`
- `../res/templates/workflow.md` (the agent contract seeded into vaults)

## Storage Invariants

| Layer | Purpose | Store |
| --- | --- | --- |
| Metadata source of truth | notes, chunks, FTS, agent queue, sync state, graph projection | SQLite (`<vault>/.db/meta.db`) |
| Vector retrieval | llm-wiki dense vectors only | zvec (`<vault>/.db/vectors`) |

- The zvec vector ID and `chunks.id` are the same join key.
- Write SQLite metadata first, then zvec, then mark synced; vector failure
  restores the previous note/chunk snapshot (VaultStore owns this).
- `agent_queue` keeps at most one pending item per source path; a delete
  cancels an unprocessed add.
- HTML files are never indexed (sync scans only `sources/**/*.md` and
  `artifacts/**/*.md`).
- All note CRUD goes through `VaultStore`; do not duplicate chunk/embed
  plumbing in commands.
- Schema migrations in `MetaDB.#initSchema` drop removed subsystems (tags,
  signals, pageindex, preprocessors) and delete legacy rewritten rows.

## zvec Notes

Local zvec types are in `node_modules/@zvec/zvec/src/index.d.ts`.

- Use `ZVecCreateAndOpen(path, schema)` for new collections and `ZVecOpen(path)` for existing ones.
- Current schema uses dense vectors only.
- Nullable scalar/string fields may reject actual `null`; prefer `""` or `[]` as appropriate.
- Embedding dimensions vary by model (`EMBEDDING_DIMENSIONS`); unknown models
  need `--dim` at `kn vault init`.
- Timestamps are Unix epoch milliseconds.
- For filters, omit the `filter` key when no filter is needed.

## Common Change Points

Add or change CLI behavior:

1. Update `src/commands/<command>.ts`.
2. Move shared behavior to `src/core/`.
3. Route DB work through `src/stores/meta-store.ts` / `src/stores/vault-store.ts`.

Change retrieval policy:

1. Update `src/search/hybrid.ts` and `MetaDB.searchFts` scope clauses.
2. Keep the llm-wiki-only embedding invariant unless the product decision
   changes.

Change the agent contract:

1. Update `../res/templates/workflow.md` (new vaults) and document that
   existing vaults keep their own copy.
2. Keep the work prompt in `src/core/agent-runner.ts` consistent with it.

## Verification Baseline

Before code-affecting commits in `cli/`, run:

```bash
cd cli
bunx tsc --noEmit
git diff --check
```

Manual smoke flow lives in `../docs/testing.md` (vault init → source drop →
`kn sync --no-agent` → scoped search → agent pass with a configured backend).

## Development Harness

For code-affecting work, follow this flow:

1. Design: keep scope explicit and small. Split work that spans multiple modules or would exceed roughly 2000 modified lines.
2. Implement: make minimal scoped patches using existing repository patterns.
3. Verify: run the narrowest useful checks plus the baseline when appropriate.
4. Release notes: summarize changed files, intent, risk, and exact verification commands.

Quality gates:

- No code-affecting output is complete without objective verification evidence or a clear test-impact note.
- Preserve existing user decisions and architecture unless explicitly approved.
- Do not merge or present a patch as final when critical/high correctness issues are known.
- User-facing behavior changes need an obvious rollback path or a reason the change is low risk.

When multiple agents are explicitly used:

- Pair each Worker with its own Fast Analyzer before implementation starts.
- A Worker patch advances only after that paired Fast Analyzer returns `PASS`.
- Final Analyzer review must start from changed files, tests run, and the issue report format only, not prior rationale.
- Reopen only blocking issues identified by the Analyzer.
