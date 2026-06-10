# knoter CLI Agent Guide

Last updated: 2026-06-10
Project: `Documents/knoter/cli`
Language for this file: English

This is the single active agent instruction file for the CLI package.
Claude-specific guidance was merged here; `CLAUDE.md` is no longer maintained.

## Project Snapshot

`knoter` is a Bun/TypeScript CLI inside a monorepo:

- `cli/`: CLI, MCP server, indexing, search, report/context tooling, and the
  explicit `kn llm` agent workflow.
- `../web/`: React/Vite HTML workbench frontend with an Electron dev shell.
- `../docs/`: shared architecture, codebase, planning, testing, and artifact
  workflow docs.

The CLI stores vault documents, indexes rewritten/artifact Markdown, exposes
search/get/report/template context, and serves MCP tools for external LLM
agents. Normal `kn` commands do not generate prose with an LLM; they only call
an embedding endpoint when indexing or semantic search requires embeddings.
The only LLM-calling surface is the explicit `kn llm` namespace.

## Active Boundaries

- Source documents are metadata/lineage only. They are not chunked, indexed, or
  included in default search.
- `rewritten` and `artifact` documents are parsed, chunked, embedded, stored in
  SQLite FTS, and upserted into zvec.
- Artifacts are indexed; `kind: llm-wiki` artifacts are part of default
  search/report retrieval (date-scope exempt in report retrieval), while all
  other artifact kinds need an explicit `--include-artifacts`.
- Rewriting, task/workout/area/metric extraction, and artifact prose generation
  belong to an external LLM agent.
- `kn llm` is the only namespace allowed to assemble prompts or call an LLM.
  `kn llm rewrite --source <path>` calls the Codex/Claude CLI in an isolated
  agent workspace to update the llm-wiki artifact plus template-justified
  scenario `artifacts/**/*.md` (existing vault artifacts are seeded into the
  workspace for in-place updates), then imports those files into the active
  vault (importing indexes chunks, so the embedding endpoint must be reachable
  unless `--test-embeddings` is passed). A legacy `rewritten.md` output is
  still imported for compatibility but is no longer requested.
- Normal CLI service lifecycle is limited to endpoint status/probing.
  Starting/stopping TEI or packaged-app services is outside product CLI
  behavior. `scripts/test-env.sh tei-start` is a test/dev harness exception.
- `kn mcp` stdio is the compatibility baseline. HTTP/daemon mode exists in code
  but remains experimental.

## Runtime And Tools

Use Bun by default:

- Run these commands from `cli/` unless a command explicitly says otherwise.
- Use `bun run src/cli.ts --help` for local CLI execution.
- Use `bun test` for tests.
- Use `bunx tsc --noEmit` for the current ad hoc typecheck.
- Use `bun install`, not npm/yarn/pnpm, inside `cli/`.
- Bun loads `.env` automatically from the package directory; do not add `dotenv`.
- Prefer Bun-native APIs where already used: `bun:sqlite`, `Bun.file`, and `Bun.$`.

Default local endpoints:

- Embedding API: `http://127.0.0.1:39280`
- Web dev/preview: `http://127.0.0.1:39281`

Package metadata is not final yet: `package.json` still uses the legacy name
`nlpr`, has no `bin.kn`, and has no package-local `check` script. That cleanup
is tracked as P1 work.

## Code Map

| Path | Role |
| --- | --- |
| `src/cli.ts` | Commander entrypoint and command registration. |
| `src/commands/*` | CLI command surfaces and output handling. |
| `src/commands/mcp.ts` | MCP transport command surface; `stdio` is the baseline and HTTP/daemon options are experimental. |
| `src/commands/llm.ts` | `kn llm rewrite` command surface (Codex-driven rewrite/artifact authoring). |
| `src/core/*` | Command-independent business logic shared by CLI/MCP/tests. |
| `src/core/report-*.ts` | Report context bundle, retrieval, continuity, serialization, shared types. |
| `src/core/rewrite-context.ts` | Source-layer rewrite evidence bundle for external agents. |
| `src/core/llm-rewrite.ts` | Codex workspace setup, prompt assembly, output import for `kn llm rewrite`. |
| `src/core/agent-fixtures.ts` | Deterministic agent-style rewritten/artifact scenario fixtures for the test vault. |
| `src/core/document-templates.ts` | Per-artifact document templates: bundled defaults in `templates/` with vault overrides at `.kn/templates/`, scaffold gating (`scaffold: true` frontmatter), and declared `artifactPath` targets. |
| `templates/` | Bundled per-artifact templates: four scaffold-enabled defaults (llm-wiki, calendar, todo, kanban; markdown + HTML pairs) plus eight agent-maintained scenario templates (diet/workout/task/study/project/progress/ideas/reflection). |
| `src/core/logger.ts` | CLI logging helpers. |
| `src/mcp/server.ts` | MCP tool definitions and transport-agnostic server factory. |
| `src/pipeline/*` | Markdown parsing, chunking, hashing, embedding, preprocessing. |
| `src/providers/*` | OpenAI-compatible embedding provider, factory, health checks. |
| `src/search/*` | Hybrid keyword/semantic retrieval, query parsing, score fusion. |
| `src/stores/meta-store.ts` | SQLite metadata, chunks, tags, signals, FTS, document graph, PageIndex placeholders. |
| `src/stores/vec-store.ts` | zvec vector schema, upsert/fetch/query helpers. |
| `scripts/agent-fixtures.ts` | Standalone fixture installer (`bun scripts/agent-fixtures.ts --vault <name>`). |
| `scripts/test-env.sh` | Test vault harness: `tei-start`, `setup`, `ensure`, `demo`, `teardown`, `kn` passthrough. |
| `scripts/tei-e2e-test.sh` | Live TEI/Codex E2E wrapper. |
| `tests/*.test.ts` | CLI behavior, storage, search, MCP, template, graph, fixtures, LLM rewrite, and TEI harness tests. |

Read these docs before larger changes:

- `../docs/architecture.md`
- `../docs/codebase.md`
- `../docs/plan/` (progress.md, roadmap.md)
- `../docs/testing.md`
- `../docs/template.md`

## Storage Invariants

This project uses SQLite and zvec side by side:

| Layer | Purpose | Store |
| --- | --- | --- |
| Metadata source of truth | notes, chunks, tags, signals, FTS, graph projection, change detection | SQLite via `bun:sqlite` |
| Vector retrieval | dense semantic search data | zvec |

Important invariants:

- Each vault has SQLite at `<vault_root>/.kn/meta.db` and a zvec index under the vault.
- The zvec vector ID and `chunks.id` are the same join key.
- For rewritten/artifact indexing, write SQLite metadata first, then zvec, then mark synced.
- Embedding or zvec failure must not leave inconsistent new metadata.
- SQLite `ON DELETE CASCADE` owns note-to-chunk/tag cleanup.
- FTS5 uses external content triggers; avoid manual FTS maintenance unless schema behavior changes.
- `document_graph_edges` rows are a recoverable projection refreshed after
  successful add/sync/add-note flows; they can be rebuilt from notes/chunks.

## zvec Notes

Local zvec types are in `node_modules/@zvec/zvec/src/index.d.ts`.

- Use `ZVecCreateAndOpen(path, schema)` for new collections and `ZVecOpen(path)` for existing ones.
- Current schema uses dense vectors only. Do not reintroduce sparse-vector
  fields unless the schema and tests are changed deliberately.
- Nullable scalar/string fields may reject actual `null`; prefer `""` or `[]` as appropriate.
- Embedding dimensions vary by model: common current values are `nomic-embed-text = 768` and `bge-m3 = 1024`.
- Timestamps are Unix epoch milliseconds.
- For filters, omit the `filter` key when no filter is needed. Do not pass `undefined` or an empty string.
- zvec array filters use `CONTAIN_ANY` and `CONTAIN_ALL`; do not use `ARRAY_CONTAINS()` or similar unsupported helpers.

## Common Change Points

Add or change CLI behavior:

1. Update `src/commands/<command>.ts`.
2. Move shared behavior to `src/core/` when MCP or tests need it.
3. Add or adjust focused tests.
4. Update `tests/command-help.test.ts` when help or command surface changes.

Change retrieval policy:

1. Update `src/search/hybrid.ts` for user search.
2. Update `src/core/report-retrieval.ts` and `src/core/report-continuity.ts` for agent context.
3. Update report/MCP/search tests (`tests/search-quality.test.ts` covers ranking behavior).

Change template behavior:

0. Named document templates (`kn template get <name>` / `scaffold`) live in
   `src/core/document-templates.ts` + `templates/`; the steps below cover the
   single artifact-workflow contract template.
1. Update `../docs/template.md`.
2. Update `src/core/template-validation.ts` only when validation semantics change.
3. Update `tests/template-command-behavior.test.ts`.
4. Check `kn llm rewrite` prompt assembly (`src/core/llm-rewrite.ts`) and agent
   fixtures (`src/core/agent-fixtures.ts`) when scenario/output contracts move.
5. Document agent-facing implications in `../docs/architecture.md` or `../docs/testing.md`.

Add a metadata field:

1. Update parser/frontmatter extraction when relevant.
2. Update `MetaDB` schema, row types, and compatibility helpers such as
   add-column-on-open paths. Add a real migration layer only if introduced
   deliberately.
3. Update serializers exposed through report/MCP payloads.
4. Update insert, reindex, and retrieval tests.

## Verification Baseline

Before code-affecting commits in `cli/`, run:

```bash
cd cli
bunx tsc --noEmit
bun test
git diff --check
```

For live TEI/Codex checks, use the documented opt-in flow:

```bash
cd cli
scripts/tei-e2e-test.sh
```

For web-affecting changes, use the web package commands from `../docs/testing.md`.

## Development Harness

For code-affecting work, follow this flow:

1. Design: keep scope explicit and small. Split work that spans multiple modules or would exceed roughly 2000 modified lines.
2. Implement: make minimal scoped patches using existing repository patterns.
3. Verify: run the narrowest useful tests plus the baseline checks when appropriate.
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
