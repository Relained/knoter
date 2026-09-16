# knoter progress (current state)

Last updated: 2026-09-17

Implemented state of the monorepo (`cli/`, `web/`, `v2/`, shared `docs/`).
Legacy work lives in `docs/plan/roadmap.md`; the new rewrite follows
`docs/plan/desktop-rewrite.md`.

## 2026-09-16 Frontend Prototype (F0)

2026-09-17 follow-up: document/view hash routes and browser history now support
Back/Forward with an unsaved-edit guard. The wiki supports inline document links,
a link picker, backlinks, unresolved references, and a global/local graph derived
from Markdown links and related-note records. Expanded sidebars can be resized by
pointer/keyboard, with preferences saved by the existing mock client. The latest
layout refinement replaces full left-sidebar collapse with persistent icon-only
compact navigation; the assistant still supports collapse. Temporary Zen mode
hides both panels, fills the app with the main workspace, and restores the prior
layout on exit without remounting the editor or assistant. Graph wheel handling
covers the entire canvas and its controls so zoom does not scroll the page.
Existing saved documents are not migrated or overwritten. Manual verification
details are recorded in `v2/README.md`; test automation remains deferred.

Added the independent `v2/` npm workspace: React/TypeScript/Vite, Tailwind,
Radix primitives, Milkdown, and a replaceable `KnoterClient` contract.
Wiki reading/editing/history, simulated source processing/chat, tasks, calendar,
search, themes, and local browser persistence are implemented for the preview.
Backend, extraction, LLM calls, Electron packaging, and native services remain
unimplemented. Legacy CLI/web code was not changed.

The user explicitly deferred test automation. No automated tests or CI were
added. Type checking/builds and direct browser walkthroughs are used instead;
see `v2/README.md` for exact verified flows and the file-chooser tool limitation.


## 2026-06-11 Final-Structure Rewrite

하루 동안 두 단계 재구성을 거쳐 최종 구조가 구현됐다. 이전 마일스톤 서술은
git 히스토리를 본다.

핵심 구조:

- **Vault**: `<dir>/{templates, sources, artifacts, .db}` (+선택
  `config.json`). 기본 위치 `~/Documents/<name>`, `--path`로 지정 가능,
  다중 vault. `kn vault init`이 `res/templates/`(workflow.md 계약 +
  llm-wiki/calendar/todo/kanban md·html)를 시딩.
- **Config**: 환경변수 폐기. `~/.config/knoter/config.json` 전역(vault
  레지스트리, defaultVaultDir, agent.backends/backend, embedding 기본값,
  sync.intervalMinutes) + `<vault>/config.json` 부분 오버라이드.
- **레이어/인덱싱**: `source | artifact`만 존재 (rewritten 완전 제거). 모든
  `.md`는 청킹+FTS; `kind: llm-wiki`만 임베딩(zvec) — 시맨틱 검색은 구조적으로
  llm-wiki 한정. HTML은 인덱싱하지 않음. 태그 시스템 없음.
- **sync**: `kn sync` = 인덱스 패스 → source 변경 큐 적재(`agent_queue`,
  경로당 pending 1건 병합) → config의 에이전트 백엔드(codex `exec`/claude
  `-p`)를 vault cwd에서 spawn → exit 0 시 재인덱스 + 큐 done. 읽기
  surface(search/vault status)는 index-only implicit sync(10초 debounce,
  `sync_state`).
- **service**: `kn service install`이 launchd
  (`~/Library/LaunchAgents/com.knoter.sync.plist`)에 주기 `kn sync` 등록.
- **검색**: `kn search --scope llm-wiki(기본·hybrid)|artifacts|sources|all
  (키워드 전용)`.
- **MCP**: 폐기·삭제. MCP/skill 노출은 future plan.
- **DB CRUD 통합**: `meta-store.ts`(SQLite 단일 소스) +
  `vault-store.ts`(meta+zvec+embedder 파사드).

CLI surface: `kn vault | sync | search | service`.

Web: source 추가/노트 저장은 vault로 직접 파일 복사 후 `vault status`로
인덱싱 트리거. 템플릿은 `<vault>/templates/` 직접 읽기. Explorer 레이어
`source|artifact|template`. vault 생성은 `kn vault init`.

검증 완료 (2026-06-11):

- `bunx tsc --noEmit`(cli), `npm run check`(web) 통과.
- 스모크: vault init(시딩 9파일) → source 투입 → `kn sync --no-agent`
  (added 1, queued 1) → `--scope sources` 키워드 검색 1건 → TEI 기동 후
  llm-wiki 인덱싱 + 기본 hybrid 검색(semantic 0.565) → noop 백엔드로
  에이전트 패스(spawn→exit 0→큐 completed 1, remaining 0) → vault delete.
- 임베딩 endpoint 다운 시: source/일반 artifact 인덱싱·키워드 검색·큐는
  정상, llm-wiki 인덱싱 실패는 sync errors에 기록되고 재시도 대상.

## Removed / Replaced

- 2026-06-11: `kn add|get|tag|template|report|llm|mcp` 명령, MCP 서버,
  rewritten 레이어, 태그 시스템, `KN_*` 환경변수, `docs/template.md`
  (→`res/templates/workflow.md`), report-*/template-*/add-note/rewrite-context
  core 모듈, agent fixtures, `cli/tests/`, `cli/scripts/`, `cli/templates/`.
- 구 web workspace/Playwright harness는 workbench 재작성 때 제거됨.

## Verification Baseline

```bash
cd cli && bunx tsc --noEmit
cd web && npm run check
```

수동 스모크는 `docs/testing.md`를 따른다.
