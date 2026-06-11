# knoter docs

이 디렉토리의 active 문서는 다음 항목을 우선 읽는다.

| 문서 | 역할 |
| --- | --- |
| `docs/architecture.md` | 현재 유효한 구조/정책의 source of truth |
| `docs/codebase.md` | 전체 코드베이스 읽기용 진입점 |
| `docs/testing.md` | 검증 명령(typecheck/build/수동 스모크)과 config 파일 정리 |

에이전트 워크플로우 계약은 `res/templates/workflow.md`에 있고 `kn vault
init`이 각 vault `templates/workflow.md`로 시딩한다 (vault별 수정 가능).

진행상황과 전체 plan은 `docs/plan/` 서브디렉토리에 있다.

| 문서 | 역할 |
| --- | --- |
| `docs/plan/progress.md` | 구현 완료된 현재 상태(진행상황)와 검증 기준 |
| `docs/plan/roadmap.md` | 활성 결정사항과 P0–P2 전체 plan |
| `docs/plan/web-fix-plan.md` | 워크벤치 디자인 결함 수정 계획과 진행 체크 |

기능 설계 문서는 `docs/design/` 서브디렉토리에 있다.

| 문서 | 역할 |
| --- | --- |
| `docs/design/widget-bar.md` | 위젯 바 / 알림 이동 설계 |
| `docs/design/web-commands.md` | 커맨드 레지스트리 / CLI 실연동 / 단축키 설계 |

에이전트 작업 지침은 패키지별 가이드를 따른다.

| 문서 | 역할 |
| --- | --- |
| `agents.md` (repo root) | 라우팅, 공유 규칙, git/branch 정책 |
| `cli/agents.md` | CLI(vault/sync/search/service)·인덱싱·작업 큐 작업 지침 |
| `web/agents.md` | 웹 workbench/Electron 작업 지침 |

사람용 패키지 개요는 `cli/README.md`, `web/README.md`에 있다.

## Legacy

과거 설계/분석/이슈 문서(`docs/archive/`)는 삭제됐다. 필요하면 git 히스토리에서
찾는다. 옛 문서나 커밋에서 다음 항목을 보더라도 현재 제품 방향이 아니므로
재도입하지 않는다:

- `kn ask`, 내장 LLM 생성, `kn llm rewrite` (LLM 호출은 `kn sync`가 spawn하는
  외부 codex/claude 에이전트로 일원화)
- MCP 서버 (`kn mcp`, `kn_*` tools) — skill/MCP 노출은 future plan
- `kn add`, `kn get`, `kn report context`, `kn template` 명령 — 파일 직접
  배치 + sync 인덱싱 + vault `templates/` 직접 읽기로 대체
- legacy `rewritten` 레이어, 태그 시스템 전체, `tag auto`
- `KN_*` 환경변수 설정 (`~/.config/knoter/config.json` + vault config로 대체)
- `docs/template.md` (계약은 `res/templates/workflow.md`로 이동)
- active `cluster`, active `schedule` timer management
- CLI-owned podman/docker TEI lifecycle
- `cli/templates/`, `cli/scripts/`, `cli/tests/` (테스트 환경 재구성으로 제거)
- Vite 기본 포트 `5173`/이전 임시 포트 `5175`, 구형 `km` 명령 표기
- 구 web workspace(pane/tab/floating window, sidebar surface host, Graph 3D
  preview)와 web Playwright harness — workbench 재작성으로 제거됨
