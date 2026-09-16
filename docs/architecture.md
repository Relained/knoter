# knoter architecture

2026-09-16: 별도 재작성 프론트가 `v2/`에 추가됐다. 현재 React UI →
`KnoterClient` → localStorage mock adapter로 연결되는 더미 프로토타입이며,
기존 vault나 CLI를 호출하지 않는다. 새 아키텍처의 구현 계획은
[`desktop-rewrite.md`](plan/desktop-rewrite.md), 현재 구현 경계는
[`v2/README.md`](../v2/README.md)를 따른다. 아래 내용은 기존 구현의 정책이다.

## Goal

`knoter`는 유저의 기존 기록/비즈니스 로직 프로그램을 vault 기반 기록 시스템으로 대체하는 CLI와 React/Vite 웹 프론트엔드를 함께 관리하는 모노레포다. CLI는 `cli/`, 프론트엔드는 `web/`, 공유 문서는 루트 `docs/`, 번들 리소스(vault 시딩용 템플릿)는 루트 `res/`에 둔다.

CLI는 LLM으로 prose를 직접 생성하지 않는다. 저장/인덱싱/검색/작업 큐를 소유하고, `kn sync`가 설정된 외부 에이전트 백엔드(codex/claude CLI)를 vault 작업 디렉토리에서 호출해 artifact와 HTML 디스플레이를 유지보수하게 한다.

핵심 데이터 흐름:

1. 유저가 source 파일을 vault `sources/`에 둔다 (web도 파일 복사만 한다).
2. `kn sync`(주기 실행: `kn service install`로 등록된 launchd, 또는 수동)가
   변경을 인덱싱하고 source 추가/수정/삭제를 작업 큐(`agent_queue`)에 적재한다.
3. 큐가 비어있지 않으면 sync가 config의 에이전트 백엔드를 spawn한다. 에이전트는
   vault에서 직접 파일을 읽고(`templates/workflow.md` 계약, `kn search` 검색)
   `artifacts/`의 `.md` + `.html`을 생성/수정/삭제한다.
4. 에이전트 종료(exit 0) 후 sync가 재인덱싱하고 큐 항목을 done 처리한다.
   llm-wiki만 임베딩되어 시맨틱 검색 대상이 된다.

## Configuration

환경변수 방식은 폐기됐다. 설정은 파일 2계층이다:

- 전역: `~/.config/knoter/config.json` — vault 이름→경로 레지스트리,
  `defaultVaultDir`(기본 `~/Documents`), 에이전트 백엔드 목록
  (`agent.backends`: codex→`codex exec`, claude→`claude -p`)과 선택
  (`agent.backend`), embedding 기본값(`baseUrl`/`model`), `sync.intervalMinutes`.
- vault별: `<vault>/config.json` — 전역값을 부분 오버라이드
  (`embedding`, `agent.backend`/`timeoutMs`, `search.fusionAlpha`).

`loadVaultConfig()`가 병합된 유효 설정을 반환한다 (`cli/src/core/config.ts`).

## Vault Layout

다중 vault를 지원하며, 기본 위치는 `~/Documents/<name>`이고 `kn vault init
--path`로 임의 경로를 지정한다.

```
<vault>/
  config.json     # 전역 오버라이드 (선택)
  templates/      # workflow.md 계약 + per-artifact 템플릿(md+기본 html), init 시 res/templates에서 시딩
  sources/        # 유저 원본 (evidence only)
  artifacts/      # 에이전트 산출물 .md + 동일 경로 .html
  .db/            # meta.db(SQLite), vectors/(zvec), vault.lock
```

## Document Layers

| Layer | 소유자 | 저장 | 인덱싱 | 검색 |
| --- | --- | --- | --- | --- |
| `source` | 유저 | `sources/` | 청킹+FTS (임베딩 없음) | `--scope sources|all` 키워드 |
| `artifact` (일반) | 에이전트 | `artifacts/` | 청킹+FTS (임베딩 없음) | `--scope artifacts|all` 키워드 |
| `artifact` (`kind: llm-wiki`) | 에이전트 | `artifacts/llm-wiki.md` | 청킹+FTS+임베딩(zvec) | 기본 검색 (semantic/hybrid/keyword) |

- legacy `rewritten` 레이어는 완전히 제거됐다 (스키마 마이그레이션이 잔여
  행을 삭제한다).
- 태그 시스템도 제거 상태를 유지한다.
- HTML 파일은 인덱싱하지 않는다. 에이전트가 직접 쓰고 web이 sandbox로
  렌더링한다.

## CLI Surface

- `kn vault init <name> [--path <dir>] [--model ...]` — 레이아웃 생성 +
  `res/templates/` 시딩 + 레지스트리 등록. `list|switch|delete|status`
  (`status`는 implicit index-only sync를 트리거; `delete`는 `.db`만 지우고
  유저 파일은 보존).
- `kn sync [--full] [--no-agent] [--reconcile]` — 인덱스 패스 → 큐 적재 →
  에이전트 spawn(백엔드 미설정이면 skip 사유 보고) → 재인덱스 → 큐 마감.
- `kn search <q> [--mode hybrid|semantic|keyword] [--scope llm-wiki|artifacts|sources|all]`
  — 기본 scope `llm-wiki`(semantic+keyword). 그 외 scope는 키워드 전용이며
  mode를 keyword로 강제한다.
- `kn service install [--interval <min>] | uninstall | status [--check]` —
  macOS launchd에 주기 `kn sync` 등록/해제, embedding endpoint 점검.

MCP/skill 문서 반환 기능은 future plan이다. 이전 MCP 구현은 폐기·삭제됐다.

## Agent Invocation Contract

- `kn sync`가 pending 큐 존재 시 `agent.backend`를 vault cwd에서 spawn한다:
  `<bin> <args...> "<work prompt>"`.
- work prompt(`cli/src/core/agent-runner.ts`)는 vault 레이아웃, 큐 항목
  목록(`[added|updated|deleted] path`), `templates/workflow.md` 계약 참조,
  llm-wiki/HTML 유지보수 규칙, `artifacts/` 외 쓰기 금지를 담는다.
- 에이전트는 `kn search`로 인덱스를 조회할 수 있다 (search 앞단의 implicit
  sync는 debounce되어 동시 실행 간섭이 적다).
- exit 0 → 재인덱스 후 큐 done. 비정상 종료/타임아웃 → 큐 유지, 다음 주기
  재시도.

## Agent Work Queue

- `agent_queue`(meta.db): source 변경당 source_path 기준 pending 1건으로
  병합. 미처리 `added`가 삭제되면 항목 자체를 제거하고, `added` 상태의 수정은
  `added`를 유지한다.
- `sync_state`(meta.db): implicit sync의 10초 debounce (프로세스 간 공유).

## Web Boundary

`web/`는 HTML-first workbench renderer와 Electron development shell로
구성된다.

- Source 추가/노트 저장: Electron main이 파일을 active vault `sources/`로
  복사·저장 후 `kn vault status`로 인덱싱을 트리거한다.
- 템플릿: `<vault>/templates/`를 직접 읽는다 (workflow 계약 + 템플릿 파일
  목록/내용/기본 HTML). 템플릿 CLI surface는 없다.
- Explorer 레이어: `source | artifact | template`.
- vault 생성: `kn vault init` (위치 미지정 시 CLI 기본값).
- Artifact HTML은 sandbox iframe 또는 sanitizer+deny-all CSP Electron 창으로
  렌더링한다.
- 검증은 `npm run check` (web 테스트 하니스는 제거 상태).

## Retrieval

- 기본 검색(`--scope llm-wiki`): SQLite FTS5 + zvec hybrid. zvec에는
  llm-wiki 청크만 존재하므로 시맨틱 검색은 구조적으로 llm-wiki 한정이다.
- 그 외 scope: FTS5 키워드 전용.
- CJK 청킹은 `Intl.Segmenter` 기반, 짧은 CJK keyword는 LIKE fallback,
  zvec score는 similarity로 normalize.

## Code Map

| Path | 역할 |
| --- | --- |
| `src/cli.ts` | commander entrypoint (vault, sync, search, service) |
| `src/commands/sync.ts` | 인덱스→큐→에이전트→재인덱스 orchestration |
| `src/commands/service.ts` | launchd install/uninstall/status + endpoint probe |
| `src/core/config.ts` | 전역/볼트 config 파일 로딩·병합 (env 없음) |
| `src/core/sync.ts` | 파일 스캔/인덱싱, 큐 적재, `ensureVaultSynced` debounce |
| `src/core/agent-runner.ts` | work prompt 조립 + 에이전트 spawn |
| `src/stores/meta-store.ts` | SQLite 통합 CRUD: notes, chunks, FTS, agent_queue, sync_state, graph |
| `src/stores/vault-store.ts` | meta.db+zvec+embedder 통합 note CRUD 파사드 (llm-wiki만 임베딩) |
| `src/stores/vec-store.ts` | zvec vector store (llm-wiki 청크 전용) |
| `src/pipeline/*` | parse/chunk/hash/embed/preprocess |
| `src/search/*` | scope 기반 keyword/semantic/hybrid 검색 |
| `res/templates/` | vault 시딩용: workflow.md 계약 + llm-wiki/calendar/todo/kanban (md+html) |

## Harness

코드 변경은 `agents.md` 기준으로 진행한다.

- 작은 작업 단위로 나눈다.
- 테스트 또는 검증 명령을 남긴다.
- code-affecting commit 전 analyzer PASS를 받는다.
