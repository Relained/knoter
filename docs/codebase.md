# knoter codebase guide

이 문서는 코드를 처음 읽을 때의 진입점이다. 정책과 제품 방향은
`docs/architecture.md`, 실행 환경과 검증은 `docs/testing.md`를 우선한다.

새 재작성 프론트는 독립된 `v2/` npm workspace에 있다. 실행 및 코드 진입점은
[`v2/README.md`](../v2/README.md), 다음 구현 방향은
[`desktop-rewrite.md`](plan/desktop-rewrite.md)를 읽는다. 현재는
`KnoterClient`를 주입받는 React UI와 로컬 mock adapter까지 구현되어 있다.
아래 Runtime Shape와 Entry Points는 기존 `cli/`·`web/` 설명이다.

## Runtime Shape

`knoter`는 Bun 기반 TypeScript CLI와 React/Vite web renderer를 함께 둔
모노레포다. CLI는 저장/인덱싱/검색/작업 큐를 담당하고, LLM 작업은 `kn sync`가
spawn하는 외부 에이전트(codex/claude CLI)가 vault 파일을 직접 다루며 수행한다.

주요 데이터 흐름:

1. source 파일이 vault `sources/`에 놓인다 (CLI ingest 명령 없음).
2. `kn sync`(launchd 주기 실행 또는 수동)가 인덱싱하고 source 변경을
   `agent_queue`에 적재한 뒤, config의 에이전트 백엔드를 spawn한다.
3. 에이전트가 `templates/workflow.md` 계약대로 `artifacts/`의 `.md`+`.html`을
   생성/수정/삭제하면 sync가 재인덱싱하고 큐를 마감한다.
4. llm-wiki만 임베딩된다 — 시맨틱/하이브리드 검색은 llm-wiki 한정,
   나머지는 FTS 키워드 검색.

## Entry Points

CLI paths in this table are relative to `cli/`. Web paths are relative to
`web/`.

| Path | 역할 |
| --- | --- |
| `src/cli.ts` | Commander root: vault, sync, search, service. |
| `src/commands/*.ts` | CLI surface. 입력 파싱, config 로딩, output envelope. |
| `src/core/*.ts` | command가 공유하는 business logic. |
| `src/stores/*.ts` | SQLite 통합 CRUD(meta-store), 통합 note CRUD 파사드(vault-store), zvec(vec-store). |
| `src/pipeline/*.ts` | Markdown parse/chunk/hash/embed/preprocess. |
| `src/search/*.ts` | scope 기반 keyword/semantic/hybrid retrieval. |
| `src/providers/*.ts` | OpenAI-compatible embedding provider와 health check. |
| `src/main.tsx` under `web/` | React renderer mount. |
| `src/workbench/*` under `web/` | HTML workbench UI. |
| `src/core/api|ipc|preload/*` under `web/` | typed web API, IPC contracts, preload adapter. |
| `electron/*` under `web/` | Electron shell, CLI/fs-backed IPC handlers, preload bridge. |
| `res/templates/*` under repo root | vault 시딩용 워크플로우 계약 + per-artifact 템플릿(md+html). |

## Command Modules

| File | Command | Notes |
| --- | --- | --- |
| `src/commands/vault.ts` | `kn vault init|list|switch|delete|status` | 레이아웃 생성+템플릿 시딩, 레지스트리, status는 implicit sync 트리거, delete는 `.db`만 제거. |
| `src/commands/sync.ts` | `kn sync` | 인덱스→큐→에이전트 spawn→재인덱스→큐 마감. `--no-agent`, `--full`, `--reconcile`. |
| `src/commands/search.ts` | `kn search` | `--scope llm-wiki(기본)|artifacts|sources|all`. llm-wiki 외 scope는 키워드 강제. |
| `src/commands/service.ts` | `kn service install|uninstall|status` | macOS launchd 주기 sync 등록/해제, endpoint probe. |

제거된 surface: `kn add|get|tag|template|report|llm|mcp`. MCP/skill 노출은
future plan (`docs/plan/roadmap.md`).

## Core Modules

| File | 역할 |
| --- | --- |
| `src/core/config.ts` | `~/.config/knoter/config.json` 전역 + `<vault>/config.json` 오버라이드 병합. 환경변수 없음. |
| `src/core/sync.ts` | vault 스캔(sources/+artifacts/의 `**/*.md`), 인덱싱 orchestration, 큐 적재, `ensureVaultSynced`(10초 debounce, index-only). |
| `src/core/agent-runner.ts` | work prompt 조립(큐 항목+계약 참조) + 백엔드 spawn(timeout, exit 추적). |
| `src/core/document-graph.ts` | document graph projection builder/persister. |
| `src/core/note-lineage.ts` | frontmatter lineage 정규화. |
| `src/core/lock.ts` | `<vault>/.db/vault.lock`. |
| `src/core/output.ts`, `logger.ts`, `errors.ts` | envelope/logging/typed error. |

## Storage Model

`src/stores/meta-store.ts` — SQLite 통합 CRUD (`<vault>/.db/meta.db`):

- `notes`: metadata, `layer`(source|artifact), `kind`, lineage, sync status.
- `chunks` + `chunks_fts`(+triggers): 모든 노트의 키워드 검색.
- `agent_queue`: source 변경 작업 큐 (pending당 source_path 1건 병합,
  미처리 added의 삭제는 항목 취소).
- `sync_state`: implicit sync debounce.
- `document_graph_edges`: recoverable graph projection.
- 마이그레이션: tags/note_signals/pageindex/preprocessors 테이블 DROP,
  legacy `rewritten` 행 DELETE.

`src/stores/vault-store.ts` — 통합 note CRUD 파사드:

- `upsertNoteFromContent`: 전 레이어 청킹+FTS, `kind: llm-wiki`만
  임베딩+zvec upsert. 벡터 실패 시 이전 note/chunk 스냅샷 복원.
- `deleteNoteCascade`, `buildNotePayload`, `recoverPending`(llm-wiki만 재임베딩),
  `reconcile`(llm-wiki 청크 검증).

`src/stores/vec-store.ts` — zvec (`<vault>/.db/vectors`), llm-wiki 청크 전용.

Invariants:

- zvec 벡터 ID == `chunks.id`.
- SQLite 먼저, zvec 다음, markSynced 마지막.
- HTML 파일은 인덱싱하지 않는다 (sync는 sources/·artifacts/의 `.md`만 스캔).
- 모든 note CRUD는 VaultStore를 경유한다.

## Search

`src/search/hybrid.ts`:

- scope `llm-wiki`(기본): FTS+zvec hybrid / semantic / keyword.
- scope `artifacts|sources|all`: `MetaDB.searchFts(scope)` 키워드 전용
  (semantic/hybrid 요청 시 keyword로 강등).
- BM25 강신호 시 시맨틱 생략, linear fusion, adjacent chunk merge.

## Template And Agent Boundary

- `kn vault init`이 `res/templates/`를 `<vault>/templates/`로 복사한다
  (workflow.md 계약 + llm-wiki/calendar/todo/kanban md+html).
- 에이전트와 web은 템플릿 파일을 직접 읽는다. 별도 템플릿 명령/검증 없음.
- 계약 본문(`res/templates/workflow.md`)에 Agent Procedure, Wiki Update
  Rules, HTML Display Contract, frontmatter 계약이 정의된다. vault별로 그
  파일을 수정해 커스터마이즈한다.

## Verification

```bash
cd cli && bunx tsc --noEmit
cd web && npm run check
```

수동 스모크는 `docs/testing.md`를 따른다.

## Known Boundaries

- CLI는 임베딩 외 LLM API를 직접 호출하지 않는다. LLM은 sync가 spawn하는
  외부 에이전트 프로세스다.
- `kn service`는 현재 macOS launchd만 지원한다.
- `cli/package.json` 패키지명/`bin.kn`/`check` 스크립트 정리는 P1.
- TEI 등 embedding 서버 lifecycle은 CLI 밖이다 (HTTP API만 사용).
- 테스트 스위트는 재구성 중 제거됐고 재구축이 roadmap에 있다.
