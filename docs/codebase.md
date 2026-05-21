# knoter codebase guide

이 문서는 코드를 처음 읽을 때의 진입점이다. 정책과 제품 방향은
`docs/architecture.md`, 실행 환경과 테스트는 `docs/testing.md`를 우선한다.

## Runtime Shape

`knoter`는 Bun 기반 TypeScript CLI다. 일반 `kn` 명령은 LLM prose 생성을
하지 않고, 저장/검색/검증/context bundle만 담당한다. 외부 LLM agent는
MCP 또는 CLI 출력으로 template/context를 읽고 rewritten/artifact Markdown을
작성한다.

주요 데이터 흐름:

1. `source` Markdown 또는 raw capture가 vault에 들어온다.
2. `source`는 SQLite metadata/lineage만 저장하고 chunk/vector index에는 넣지 않는다.
3. 외부 agent가 `kn_rewrite_context` 또는 `kn report context`를 읽고
   `rewritten` Markdown을 작성한다.
4. `rewritten`과 `artifact`는 parser -> chunker -> embedder -> SQLite FTS +
   zvec vector store로 인덱싱된다.
5. 검색은 SQLite FTS5 keyword와 zvec semantic 결과를 hybrid fusion한다.
6. artifact는 기본 검색에서 제외하고 `--include-artifacts`일 때만 포함한다.

## Entry Points

| Path | 역할 |
| --- | --- |
| `src/cli.ts` | Commander root. 명령 등록 순서를 확인하는 곳. |
| `src/commands/*.ts` | CLI surface. 사용자 입력 파싱, config 로딩, output envelope 처리. |
| `src/mcp/server.ts` | MCP stdio tool surface. 외부 agent가 호출하는 API boundary. |
| `src/core/*.ts` | command와 MCP가 공유하는 business logic. |
| `src/stores/*.ts` | SQLite metadata store와 zvec vector store. |
| `src/pipeline/*.ts` | Markdown parse/chunk/hash/embed/preprocess pipeline. |
| `src/search/*.ts` | keyword/semantic/hybrid retrieval와 score fusion. |
| `src/providers/*.ts` | OpenAI-compatible embedding provider와 health check. |
| `tests/*.test.ts` | behavior, storage, search, MCP, TEI integration harness. |
| `docs/*.md` | active design docs. Archive는 `docs/archive/` 아래. |

## Command Modules

| File | Command | Notes |
| --- | --- | --- |
| `src/commands/vault.ts` | `kn vault` | vault 생성/상태/TEI container wiring. |
| `src/commands/add.ts` | `kn add` | 파일 ingest. source는 metadata-only, rewritten/artifact는 indexing. |
| `src/commands/sync.ts` | `kn sync` | vault 파일과 metadata/vector store 동기화, pending recovery. |
| `src/commands/search.ts` | `kn search` | keyword/semantic/hybrid search CLI wrapper. |
| `src/commands/get.ts` | `kn get` | path/title/id 기반 note 조회와 batch 조회. |
| `src/commands/tag.ts` | `kn tag` | 수동 tag 관리. `tag auto`는 제거된 방향. |
| `src/commands/template.ts` | `kn template` | vault template/fallback 조회와 local validation. |
| `src/commands/report.ts` | `kn report context` | 외부 agent용 JSON context bundle 생성. |
| `src/commands/mcp.ts` | `kn mcp` | MCP stdio server 실행. |
| `src/commands/schedule.ts` | legacy | active direction은 install-time service template. |
| `src/commands/cluster.ts` | legacy/deferred | active CLI/typecheck 범위에서 제외된 방향. |

## Core Modules

| File | 역할 |
| --- | --- |
| `src/core/config.ts` | global/vault config load/save, active vault resolution. |
| `src/core/add-note.ts` | MCP/shared add-note path. rewritten/artifact 저장+indexing rollback 포함. |
| `src/core/rewrite-context.ts` | source -> rewritten 외부 agent용 context bundle. |
| `src/core/report-context.ts` | report/artifact workflow context bundle 조립. |
| `src/core/report-retrieval.ts` | date/tasks/workouts/areas retrieval group SQL. |
| `src/core/report-continuity.ts` | 이전 7일 continuity context. |
| `src/core/report-serialization.ts` | Note/signal row JSON serialization. |
| `src/core/template.ts` | effective template resolution: vault `.kn/template.md` then `docs/template.md`. |
| `src/core/template-validation.ts` | template contract validation. LLM 호출 없음. |
| `src/core/container.ts` | local TEI container lazy-start/retry support. |
| `src/core/lock.ts` | vault operation lock. |
| `src/core/output.ts` | JSON/text output envelope helpers. |
| `src/core/errors.ts` | typed CLI errors and exit codes. |

## Storage Model

`src/stores/meta-store.ts` owns SQLite tables:

- `notes`: file metadata, `layer`, raw `kind`, date, lineage, vector sync status.
- `chunks`: chunk text, heading path, offsets, token count, prev/next links.
- `tags`: manual/frontmatter tags.
- `note_signals`: explicit external-agent signals such as task/workout/metric.
- FTS virtual table/triggers for keyword search.
- PageIndex metadata placeholders for future PoC.

`src/stores/vec-store.ts` owns zvec:

- schema creation based on `EMBEDDING_DIMENSIONS`
- `toZVecDoc` conversion
- `semanticQuery`
- low-level score/fusion helper exports used by tests and legacy paths

Important invariant:

- source notes have no chunks and no vectors
- rewritten/artifact notes must have chunks and vectors when `vector_sync_status = synced`
- artifact rows exist in indexes but are excluded by default retrieval/search policy

## Pipeline

| File | 역할 |
| --- | --- |
| `src/pipeline/parser.ts` | Markdown/frontmatter parsing, explicit `layer`/`kind`/lineage extraction. |
| `src/pipeline/chunker.ts` | heading-aware chunking, CJK sentence handling, overlap/sizing. |
| `src/pipeline/embedder.ts` | provider batching/retry strategy and embedding input formatting. |
| `src/pipeline/hasher.ts` | file/content hash helpers. |
| `src/pipeline/preprocessor.ts` | optional preprocessing command hook. |

Index-time flow for rewritten/artifact:

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
| `tests/template-command-behavior.test.ts` | template CLI, fallback/vault precedence, validation. |
| `tests/report-context.test.ts` | report context bundle, layer/date/artifact retrieval policy. |
| `tests/mcp-tools.test.ts` | MCP tool registration and payload shape. |
| `tests/korean.test.ts` | CJK FTS fallback and deterministic Korean semantic fixtures. |
| `tests/vec-store.test.ts` | zvec schema/query/fusion helper behavior. |
| `tests/tei-integration.test.ts` | live TEI/Codex E2E when `.env` enables endpoint values. |

Baseline:

```bash
bun test
git diff --check
```

Live TEI/Codex E2E:

```bash
scripts/tei-e2e-test.sh
```

## Common Change Points

Add a new CLI behavior:

1. Add/adjust `src/commands/<command>.ts`.
2. Put shared logic in `src/core/` if MCP or tests should reuse it.
3. Add command surface tests in `tests/command-help.test.ts` when help/output changes.
4. Add focused behavior tests for storage/search/context changes.

Add a new document metadata field:

1. Update parser extraction if it comes from frontmatter.
2. Update `MetaDB` schema/migrations and row types.
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
- `kn llm` is the future namespace for prompt assembly or explicit LLM calls.
- `schedule` and `cluster` code exists but is legacy/deferred relative to active direction.
- `testdata/` is gitignored local data, but tests can use it when present for live E2E.
