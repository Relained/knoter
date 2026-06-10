# knoter docs

이 디렉토리의 active 문서는 다음 항목을 우선 읽는다.

| 문서 | 역할 |
| --- | --- |
| `docs/architecture.md` | 현재 유효한 구조/정책의 source of truth |
| `docs/codebase.md` | 전체 코드베이스 읽기용 진입점 |
| `docs/plan.md` | 현재 상태, 다음 작업 순서와 완료 기준 |
| `docs/template.md` | vault fallback artifact workflow 템플릿 (런타임 계약, `kn template get`으로 전달됨) |
| `docs/testing.md` | 테스트 실행과 `.env` 환경 변수 정리 |

에이전트 작업 지침은 패키지별 가이드를 따른다.

| 문서 | 역할 |
| --- | --- |
| `agents.md` (repo root) | 라우팅, 공유 규칙, git/branch 정책 |
| `cli/agents.md` | CLI/MCP/인덱싱/검색/`kn llm` 작업 지침 |
| `web/agents.md` | 웹 workbench/Electron 작업 지침 |

사람용 패키지 개요는 `cli/README.md`, `web/README.md`에 있다.

## Legacy

과거 설계/분석/이슈 문서(`docs/archive/`)는 삭제됐다. 필요하면 git 히스토리에서
찾는다. 옛 문서나 커밋에서 다음 항목을 보더라도 현재 제품 방향이 아니므로
재도입하지 않는다:

- `kn ask`, 내장 LLM 생성
- `tag auto`
- active `cluster`
- active `schedule` timer management
- CLI-owned podman/docker TEI lifecycle
- Vite 기본 포트 `5173`/이전 임시 포트 `5175`
- 구형 `km` 명령 표기
- 구 web workspace(pane/tab/floating window, sidebar surface host, Graph 3D
  preview)와 web Playwright harness — workbench 재작성으로 제거됨
