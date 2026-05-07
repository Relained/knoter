# knoter docs

이 디렉토리의 active 문서는 다음 3개만 우선 읽는다.

| 문서 | 역할 |
| --- | --- |
| `docs/architecture.md` | 현재 유효한 구조/정책의 source of truth |
| `docs/plan.md` | 다음 작업 순서와 완료 기준 |
| `docs/template.md` | vault fallback 일일 보고서 템플릿 |

## Archive

`docs/archive/`는 과거 설계, 비교 분석, 이슈 로그, 발표 자료를 보관한다. 현재 구현 기준과 충돌하는 항목이 있을 수 있으므로 새 기능을 구현할 때는 active 문서를 우선한다.

대표적인 레거시 항목:

- `kn ask`, 내장 LLM 생성
- `tag auto`
- active `cluster`
- active `schedule` timer management
- 구형 `km` 명령 표기
