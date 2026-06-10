# 워크벤치 디자인 결함 수정 계획

최종 수정: 2026-06-10
적용 패키지: `web/`
근거: 대형 데스크톱 앱(VS Code, Obsidian, Slack, Linear, Raycast) GUI 관습과의
대조 분석 결과 16개 결함. 상태 추적은 `docs/plan/roadmap.md` P0.

표기: ✅ 완료 / ⬜ 미착수. 규모: S(≤1h), M(반나절), L(설계 필요).

## Phase 1 — 버그 수준 결함 (발표 전 필수, 전부 S)

| # | 결함 | 수정 방법 | 파일 |
| --- | --- | --- | --- |
| ⬜ 1-1 | SourceModal 레이아웃 CSS 부재 — flex row에 끼어들어 화면 깨짐 | `.source-modal-backdrop`에 `position: fixed; inset: 0` + 백드롭, `.source-modal` 박스/헤더/파일드롭/세그먼트 스타일을 `.settings-page` 패턴으로 작성 | `html-workbench.css` |
| ⬜ 1-2 | 탭 0개일 때 빈 pill 잔존 | 주석 처리된 `if (tabs.length === 0) return null;` 활성화 | `OverlayTapBar.tsx:22` |
| ✅ 1-3 | 토스트(z-80)가 열린 툴 메뉴(z-75)를 덮음 + 팝업이 바의 `overflow: hidden`에 클리핑되어 아예 안 보임 | 팝업을 슬롯 rect 기준 `position: fixed`(z-84)로 재작성 — 클리핑 면역, 토스트 위·팔레트 아래 레이어 | `OverlayMenuBar.tsx`, `html-workbench.css` |
| ✅ 1-4 | 죽은 설정 노출 (Keybinding profile) | 실제 단축키 시스템 + 설정 UI로 교체 (이번 구현) | `SettingsPageView.tsx`, `preferences.ts` |
| ⬜ 1-5 | 죽은 설정 노출 (Sidebar width/collapsed) | 설정 행 제거 + `preferences.ts`에서 `sidebarWidth`/`sidebarCollapsed` 정의 삭제. 대신 `widgetBarWidth` 노출 | `SettingsPageView.tsx`, `preferences.ts` |

## Phase 2 — 인터랙션 관습 (발표 전 권장)

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ✅ 2-1 | Escape가 팔레트를 여는 키 / 단축키 시스템 부재 | 단축키-명령 연결 시스템 구현: chord 캡처/정규화, commandId→chord 저장소(기본값+충돌 해소), App 디스패처, 설정 UI 레코더, 팔레트 힌트. Escape는 닫기 전용으로 환원, 팔레트는 `Mod+K` (이번 구현) | M |
| ⬜ 2-2 | 팔레트 키보드 내비게이션 부재 | `selectedIndex` 상태 + ↑↓ 이동 + 선택 하이라이트 + Enter는 선택 항목 실행, 마우스 hover 시 선택 동기화. "Sort by" 푸터 제거하고 사용 빈도(MRU) 정렬 내장 | M |
| ✅ 2-3 | 메뉴/팝업 열림·닫힘 모델 충돌 — hover가 먼저 열고 클릭 토글이 닫아서 "버튼을 눌러도 확장창이 안 뜨는" 증상, 알림 팝업 hover-out 닫힘 | 클릭으로 열기 + 이미 열려 있을 때만 hover로 메뉴 전환(메뉴바 관습), 닫기는 바깥 pointerdown/Esc/window blur(iframe 클릭 대응)로 통일. 바 전체 `onMouseLeave` 닫기 제거 | 완료 |
| ⬜ 2-4 | 모달 dismissal 불일치 (설정/소스 모달에 Esc 없음) | 공용 `useDialogDismiss` 훅(Esc + 백드롭)으로 세 다이얼로그 통일 | S |

## Phase 3 — 테마/시각 일관성

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ⬜ 3-1 | sandbox 문서가 테마/폰트 하드코딩 (`createSandboxDocument`, 외부 창) | base16 런타임에서 현재 팔레트(배경/전경/액센트)와 fontStacks를 읽어 sandbox 문서 `<style>`에 CSS 변수로 주입. 외부 창은 IPC 입력에 테마 스냅샷 동봉 | M |
| ⬜ 3-2 | 토큰 우회 하드코딩 색 (`rgb(255 255 255 / 0.08)`, 주황 radial-gradient) | 하드코딩 값을 시맨틱 토큰으로 치환, 장식 그라디언트 제거(agents.md 자체 규칙 위반) | S |
| ⬜ 3-3 | radius 스케일 비일관 (6/7/8/9/10/13/999px 혼재) | `--radius-sm/md/lg/pill` 토큰 4단계로 통일 | S |

## Phase 4 — 피드백/상태 표시

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ⬜ 4-1 | 장기 작업(llm rewrite 300s, sync 120s) 진행 표시 부재 | 진행 중 작업 상태(`runningOps`)를 App이 보유, 벨 아이콘에 스피너 오버레이 + 알림 팝업 상단에 진행 중 항목 고정 표시. 토스트는 시작/완료만 | M |
| ⬜ 4-2 | 상시 상태 표시 부재 (vault 이름·연결 상태가 토스트로만 스침) | 메뉴바 하단 또는 탭 바 끝에 소형 상태 칩(vault 이름, 문서 수, 미연결 경고). `activeVault` 상태는 이미 로드됨 | M |
| ⬜ 4-3 | 안읽음 뱃지가 본 메시지도 카운트, 토글만 해도 리셋 | 토스트가 화면에 떠 있는 동안 표시된 메시지는 카운트 제외, 리셋은 팝업이 "열릴" 때만 | S |
| ⬜ 4-4 | 탭 전환 시 iframe 재생성으로 스크롤 유실 | 탭별 iframe을 유지하고 `display`로 전환(keep-alive), 탭 수 상한과 메모리 트레이드오프 명시 | M |

## Phase 5 — 접근성

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ⬜ 5-1 | `button:focus-visible { outline: none }` — 포커스 식별 불가 | `--focus-ring` 토큰 추가, focus-visible에 2px 아웃라인 복원 | S |
| ⬜ 5-2 | 다이얼로그 포커스 트랩/복원 부재 | 2-4의 공용 훅에 포커스 트랩 + 닫힐 때 트리거 복원 포함 | M |
| ⬜ 5-3 | ARIA menu/tablist 패턴 미완성 (화살표 키 없음, tablist 시맨틱 없음) | 메뉴 화살표 내비게이션, 탭 바 `role="tablist"` + `aria-selected`, 잘린 탭 제목 `title` 속성 | M |

## 진행 중 추가된 사용자 지시 변경 (계획 외, 완료)

| # | 내용 | 구현 |
| --- | --- | --- |
| ✅ A-1 | 탭 바 호버 정책 변경: 탭 이름/표면에는 호버 색상 표시 없음, 닫기(X) 버튼만 원형(`border-radius: 999px`) 호버 하이라이트 | `.overlay-tab-select:hover` 무력화, `.overlay-tab-close` 22px 정원 + `--accent-selected` 토큰 |
| ✅ A-2 | X 아이콘이 원형 하이라이트에서 오른쪽으로 치우침 — UA 버튼 패딩(1px 6px)으로 콘텐츠 영역이 아이콘보다 작아지면 grid 중앙 정렬이 start로 폴백 | 고정폭 아이콘 버튼(`.overlay-tab-close`, 위젯 헤더/알림/토스트 버튼)에 `padding: 0` 명시 |
| ✅ A-3 | 오버레이 스코핑: 위젯 바가 핀된 상태에서 탭 바가 viewport 중앙이라 위젯 바와 겹침 | `.workbench-main`(relative) 래퍼 신설 — 메뉴 바·탭 바·transient 토스트를 메인 HTML 뷰 기준 absolute로 이동, 탭 바는 메인 뷰 중앙 정렬. 위젯 스택의 상/하단 회피 패딩(safe-area) 제거 |

## 권장 순서

1. **Phase 1 전부** (반나절 내, 발표 데모 안정화)
2. **2-2, 2-3** (팔레트/팝업 — 단축키 시스템(2-1 완료)과 묶이는 인터랙션 마감)
3. **4-1, 4-2** (장기 작업·상시 상태 — llm rewrite 데모 신뢰성)
4. **3-1** (테마 관통 — 라이트 테마 데모가 필요할 때)
5. Phase 5와 나머지는 발표 후.
