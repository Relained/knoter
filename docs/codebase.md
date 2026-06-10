# knoter codebase guide

이 문서는 코드를 처음 읽을 때의 진입점이다. 정책과 제품 방향은
`docs/architecture.md`, 실행 환경과 테스트는 `docs/testing.md`를 우선한다.

## Runtime Shape

`knoter`는 Bun 기반 TypeScript CLI와 React/Vite web renderer를 함께 둔
모노레포다. 일반 `kn` 명령은 LLM prose 생성을 하지 않고,
저장/검색/검증/context bundle만 담당한다. 외부 LLM agent는 MCP 또는 CLI
출력으로 template/context를 읽고 source 기반 artifact를 작성하거나 갱신한다.
유일한 LLM 호출 surface는 명시적 `kn llm` namespace이며, 현재
`kn llm rewrite`가 Codex CLI로 rewritten/artifact 노트를 작성해 import한다.

주요 데이터 흐름:

1. `source` Markdown 또는 raw capture가 vault에 들어온다.
2. `source`는 원본 보존과 metadata/extraction projection을 우선한다.
3. 외부 agent가 source evidence와 context를 읽고 artifact를 작성/갱신한다.
4. Target default retrieval은 `artifact.kind: llm-wiki`다.
5. 현재 CLI는 마이그레이션 전까지 legacy `rewritten`을 기본 indexed knowledge로
   사용하고, artifact는 `--include-artifacts`에서만 포함한다.

## Entry Points

CLI paths in this table are relative to `cli/`. Web paths are relative to
`web/`.

| Path | 역할 |
| --- | --- |
| `src/cli.ts` | Commander root. 명령 등록 순서를 확인하는 곳. |
| `src/commands/*.ts` | CLI surface. 사용자 입력 파싱, config 로딩, output envelope 처리. |
| `src/commands/mcp.ts` | MCP transport command surface. `stdio` is the baseline and HTTP/daemon options are experimental. |
| `src/mcp/server.ts` | MCP tool definitions and transport-agnostic server factory. |
| `src/core/*.ts` | command와 MCP가 공유하는 business logic. |
| `src/stores/*.ts` | SQLite metadata store와 zvec vector store. |
| `src/pipeline/*.ts` | Markdown parse/chunk/hash/embed/preprocess pipeline. |
| `src/search/*.ts` | keyword/semantic/hybrid retrieval와 score fusion. |
| `src/providers/*.ts` | OpenAI-compatible embedding provider와 health check. |
| `tests/*.test.ts` | behavior, storage, search, MCP, graph, fixtures, LLM rewrite, TEI integration harness. |
| `src/main.tsx` under `web/` | React renderer mount and runtime bootstrap. |
| `src/workbench/*` under `web/` | HTML workbench UI: tabs, overlay bars, palette, modals, HTML utilities. |
| `src/core/api/*`, `src/core/ipc/*`, `src/core/preload/*` under `web/` | typed web API, IPC contracts, and preload adapter boundaries. |
| `src/core/settings/*` under `web/` | global settings runtime (JSONC model, localStorage persistence). |
| `src/shared/icons/*`, `src/shared/theming/*` under `web/` | semantic icons and Base16 theme runtime. |
| `src/shared/styles/components/html-workbench.css` under `web/` | active workbench layout and interaction styles. |
| `electron/*` under `web/` | Electron development shell, CLI-backed IPC handlers, preload bridge. |
| `docs/*.md` under repo root | active design docs. 레거시 문서는 삭제됨(git 히스토리 참조). |

## Command Modules

| File | Command | Notes |
| --- | --- | --- |
| `src/commands/vault.ts` | `kn vault` | vault 생성/상태/embedding API endpoint 저장. |
| `src/commands/add.ts` | `kn add` | 파일 ingest. source는 metadata-only, legacy rewritten/artifact는 indexing. |
| `src/commands/sync.ts` | `kn sync` | vault 파일과 metadata/vector store 동기화, pending recovery. |
| `src/commands/search.ts` | `kn search` | keyword/semantic/hybrid search CLI wrapper. |
| `src/commands/get.ts` | `kn get`, `kn get batch` | path/suffix/substring/id 기반 note 조회와 batch 조회. |
| `src/commands/tag.ts` | `kn tag` | 수동 tag 관리. `tag auto`는 제거된 방향. |
| `src/commands/template.ts` | `kn template` | vault template/fallback 조회와 local validation. |
| `src/commands/report.ts` | `kn report context` | 외부 agent용 JSON context bundle 생성. |
| `src/commands/mcp.ts` | `kn mcp` | MCP server 실행. `stdio`가 기본이고 HTTP/daemon은 experimental. |
| `src/commands/service.ts` | `kn service status` | 외부 embedding service endpoint 점검. |
| `src/commands/llm.ts` | `kn llm rewrite` | Codex CLI로 source -> rewritten/artifact 작성 후 vault import. 유일한 LLM 호출 surface. |

Currently exposed MCP tools in `src/mcp/server.ts`:

| Tool | 역할 |
| --- | --- |
| `kn_search` | semantic/keyword/hybrid retrieval wrapper. |
| `kn_get` | 단일 note content/metadata 조회. |
| `kn_get_batch` | 여러 path 또는 note id 일괄 조회. |
| `kn_vault_status` | note/chunk/tag/pending count와 embedding model 조회. |
| `kn_add_note` | legacy rewritten/artifact Markdown 저장 및 인덱싱. |
| `kn_template_get` | effective template payload 조회. |
| `kn_report_context` | artifact/report agent용 context bundle 생성. |
| `kn_rewrite_context` | source-layer rewrite agent용 evidence bundle 생성. |

## Core Modules

| File | 역할 |
| --- | --- |
| `src/core/config.ts` | global/vault config load/save, active vault resolution. |
| `src/core/add-note.ts` | MCP/shared add-note path. legacy rewritten/artifact 저장+indexing rollback 포함. |
| `src/core/rewrite-context.ts` | legacy source -> rewritten 외부 agent용 context bundle. |
| `src/core/report-context.ts` | report/artifact workflow context bundle 조립. |
| `src/core/report-retrieval.ts` | date/tasks/workouts/areas retrieval group SQL. |
| `src/core/report-continuity.ts` | 이전 7일 continuity context. |
| `src/core/report-serialization.ts` | Note/signal row JSON serialization. |
| `src/core/document-graph.ts` | document graph projection builder/persister for lineage, template, note/chunk, and chunk adjacency edges. |
| `src/core/note-lineage.ts` | frontmatter lineage field normalization shared by add/sync/add-note paths. |
| `src/core/template.ts` | effective template resolution: vault `.kn/template.md` then `docs/template.md`. |
| `src/core/template-validation.ts` | template contract validation. LLM 호출 없음. |
| `src/core/llm-rewrite.ts` | `kn llm rewrite`용 Codex workspace 구성, prompt 조립, 출력 import/인덱싱. |
| `src/core/agent-fixtures.ts` | test vault용 deterministic agent-style rewritten/artifact scenario fixture 설치. |
| `src/core/lock.ts` | vault operation lock. |
| `src/core/output.ts` | JSON/text output envelope helpers. |
| `src/core/logger.ts` | CLI logging helpers. |
| `src/core/errors.ts` | typed CLI errors and exit codes. |

## Storage Model

`src/stores/meta-store.ts` owns SQLite tables:

- `notes`: file metadata, `layer`, raw `kind`, date, lineage, vector sync status.
- `chunks`: chunk text, heading path, offsets, token count, prev/next links.
- `tags`: manual/frontmatter tags.
- `note_signals`: explicit external-agent signals such as task/workout/metric.
- `document_graph_edges`: recoverable graph projection over note lineage,
  artifact template references, note/chunk containment, and chunk adjacency.
- FTS virtual table/triggers for keyword search.
- PageIndex metadata placeholders for future PoC.

`src/stores/vec-store.ts` owns zvec:

- schema creation based on `EMBEDDING_DIMENSIONS`
- `toZVecDoc` conversion
- `semanticQuery`
- low-level score/fusion helper exports used by tests and legacy paths

Important invariant:

- source notes currently have no chunks and no vectors
- legacy rewritten/artifact notes must have chunks and vectors when `vector_sync_status = synced`
- artifact rows exist in indexes but are currently excluded by default retrieval/search policy
- target default retrieval will move to `artifact.kind: llm-wiki`
- document graph rows are projections and can be rebuilt from notes/chunks

## Pipeline

| File | 역할 |
| --- | --- |
| `src/pipeline/parser.ts` | Markdown/frontmatter parsing, explicit `layer`/`kind`/lineage extraction. |
| `src/pipeline/chunker.ts` | heading-aware chunking, CJK sentence handling, overlap/sizing. |
| `src/pipeline/embedder.ts` | provider batching/retry strategy and embedding input formatting. |
| `src/pipeline/hasher.ts` | file/content hash helpers. |
| `src/pipeline/preprocessor.ts` | optional preprocessing command hook. |

Current index-time flow for legacy rewritten/artifact:

```text
Markdown -> parseNote -> chunkDocument -> formatForEmbedding
  -> OpenAI-compatible provider -> MetaDB.reindexNote
  -> zvec upsert -> MetaDB.markSynced
```

Rollback expectation:

- embedding failure should not leave new metadata
- vector upsert failure should restore existing note/file state when updating

## Search

`src/search/hybrid.ts` is the main high-level search path.

- `keyword`: SQLite FTS5 through `MetaDB.searchFts`
- `semantic`: query embedding through configured provider, then zvec query
- `hybrid`: keyword + semantic, linear fusion, adjacent chunk merge
- artifact exclusion is enforced unless `includeArtifacts` is true
- target search should default to `artifact.kind: llm-wiki` once kind-filtered
  artifact retrieval is implemented

`src/search/query-builder.ts` contains query option parsing helpers.
`src/search/fusion.ts` contains active fusion/strong-signal utilities.

## Template And Agent Boundary

`docs/template.md` is delivered to agents through code, not by implicit model
context:

1. `src/core/template.ts` resolves the effective template.
2. `kn template get` returns template content/metadata.
3. `kn report context` includes the same object under `template`.
4. MCP exposes this through `kn_template_get` and `kn_report_context`.
5. The external agent reads the template, then uses `kn`/MCP retrieval to decide
   whether to create new artifacts or update existing artifact documents.

The fallback template is now an artifact workflow contract. It supports one-to-many
outputs and continuation of existing user-visible documents.

## Tests

High-signal files:

| Test | Covers |
| --- | --- |
| `tests/meta-store.test.ts` | SQLite schema, FTS, layers, signals, PageIndex metadata. |
| `tests/add-note.test.ts` | shared add-note rollback and lineage behavior. |
| `tests/parser.test.ts` | Markdown/frontmatter parsing and layer/kind/lineage extraction. |
| `tests/document-graph.test.ts` | document graph projection build/refresh behavior. |
| `tests/template-command-behavior.test.ts` | template CLI, fallback/vault precedence, validation. |
| `tests/report-context.test.ts` | report context bundle, layer/date/artifact retrieval policy. |
| `tests/mcp-tools.test.ts` | MCP tool registration and payload shape. |
| `tests/command-help.test.ts` | CLI command surface and help output. |
| `tests/korean.test.ts` | CJK FTS fallback and deterministic Korean semantic fixtures. |
| `tests/search-quality.test.ts` | hybrid score normalization, fusion alpha, hybrid-min option resolution. |
| `tests/vec-store.test.ts` | zvec schema/query/fusion helper behavior. |
| `tests/agent-fixtures.test.ts` | agent scenario fixture installation into the test vault. |
| `tests/llm-rewrite.test.ts` | `kn llm rewrite` workspace/prompt/import behavior with an injected fake runner. |
| `tests/tei-integration.test.ts` | live TEI/Codex E2E when `.env` enables endpoint values. |

Baseline:

```bash
cd cli
# Current ad hoc typecheck; package metadata/check script is P1 work.
bunx tsc --noEmit
bun test
git diff --check
```

Live TEI/Codex E2E:

```bash
cd cli
scripts/tei-e2e-test.sh
```

Web:

```bash
cd ../web
npm run check
```

Default local ports:

- TEI embedding API: `127.0.0.1:39280`
- Vite dev/preview: `127.0.0.1:39281`

## Common Change Points

Add a new CLI behavior:

1. Add/adjust `src/commands/<command>.ts`.
2. Put shared logic in `src/core/` if MCP or tests should reuse it.
3. Add command surface tests in `tests/command-help.test.ts` when help/output changes.
4. Add focused behavior tests for storage/search/context changes.

Add a new document metadata field:

1. Update parser extraction if it comes from frontmatter.
2. Update `MetaDB` schema, row types, and compatibility helpers such as
   add-column-on-open paths. Add a real migration layer only when introduced
   deliberately.
3. Update serializers if exposed in report/MCP payloads.
4. Update tests for insert/reindex/retrieval behavior.

Change retrieval policy:

1. Update `src/search/hybrid.ts` for user search.
2. Update `src/core/report-retrieval.ts` and `report-continuity.ts` for agent context.
3. Update MCP/report-context tests.

Change template contract:

1. Update `docs/template.md`.
2. Update `src/core/template-validation.ts` only if validation semantics change.
3. Update `tests/template-command-behavior.test.ts`.
4. Document agent-facing implications in `docs/architecture.md` or `docs/testing.md`.

## Known Boundaries

- No general LLM call in normal `kn` commands except embedding provider calls.
- `kn llm` is the only namespace for prompt assembly or explicit LLM calls.
  `kn llm rewrite` (Codex CLI 또는 Claude Code CLI)가 현재 구현이다.
- `cli/package.json` still has package name `nlpr` and no `bin.kn`; packaging is
  intentionally listed as P1 work in `docs/plan/roadmap.md`.
- `cli/package.json` also has no package-local `check` script and keeps
  TypeScript as a peer dependency, so `bunx tsc --noEmit` is an ad hoc baseline.
- Container runtime and TEI process lifecycle are outside the CLI. The CLI only
  depends on the embedding server HTTP API. `scripts/test-env.sh tei-start` is
  a test/dev harness exception, not product service lifecycle.
- Cluster analysis is outside the CLI. A future app/frontend layer can access
  zvec directly for that surface.
- `KN_TESTDATA_ROOT` points live E2E and local bootstrap scripts at a gitignored
  fixture corpus, so private or large test data can stay outside tracked files.
- `scripts/test-env.sh setup` and the live TEI corpus E2E both include every
  `testdata/**/*.md` file when `KN_TESTDATA_ROOT` exists. Non-Markdown files are
  intentionally outside that corpus.
