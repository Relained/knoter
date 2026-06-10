# 워크벤치 디자인 결함 수정 계획

최종 수정: 2026-06-10
적용 패키지: `web/`
근거: 대형 데스크톱 앱(VS Code, Obsidian, Slack, Linear, Raycast) GUI 관습과의
대조 분석 결과 16개 결함. 상태 추적은 `docs/plan/roadmap.md` P0.

표기: ✅ 완료 / ⬜ 미착수. 규모: S(≤1h), M(반나절), L(설계 필요).

## Phase 1 — 버그 수준 결함 (발표 전 필수, 전부 S)

| # | 결함 | 수정 방법 | 파일 |
| --- | --- | --- | --- |
| ✅ 1-1 | SourceModal 레이아웃 CSS 부재 — flex row에 끼어들어 화면 깨짐 | `.source-modal-backdrop`에 `position: fixed; inset: 0` + 백드롭, `.source-modal` 박스/헤더/파일드롭/세그먼트 스타일을 `.settings-page` 패턴으로 작성 | `html-workbench.css` |
| ✅ 1-2 | 탭 0개일 때 빈 pill 잔존 | 주석 처리된 `if (tabs.length === 0) return null;` 활성화 | `OverlayTapBar.tsx:22` |
| ✅ 1-3 | 토스트(z-80)가 열린 툴 메뉴(z-75)를 덮음 + 팝업이 바의 `overflow: hidden`에 클리핑되어 아예 안 보임 | 팝업을 슬롯 rect 기준 `position: fixed`(z-84)로 재작성 — 클리핑 면역, 토스트 위·팔레트 아래 레이어 | `OverlayMenuBar.tsx`, `html-workbench.css` |
| ✅ 1-4 | 죽은 설정 노출 (Keybinding profile) | 실제 단축키 시스템 + 설정 UI로 교체 (이번 구현) | `SettingsPageView.tsx`, `preferences.ts` |
| ✅ 1-5 | 죽은 설정 노출 (Sidebar width/collapsed) | 설정 행 제거 + `preferences.ts`에서 `sidebarWidth`/`sidebarCollapsed` 정의 삭제. 대신 `widgetBarWidth` 노출 | `SettingsPageView.tsx`, `preferences.ts` |

## Phase 2 — 인터랙션 관습 (발표 전 권장)

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ✅ 2-1 | Escape가 팔레트를 여는 키 / 단축키 시스템 부재 | 단축키-명령 연결 시스템 구현: chord 캡처/정규화, commandId→chord 저장소(기본값+충돌 해소), App 디스패처, 설정 UI 레코더, 팔레트 힌트. Escape는 닫기 전용으로 환원, 팔레트는 `Mod+K` (이번 구현) | M |
| ✅ 2-2 | 팔레트 키보드 내비게이션 부재 | `selectedIndex` 상태 + ↑↓ 이동(순환) + 선택 하이라이트 + Enter는 선택 항목 실행, 마우스 hover 시 선택 동기화. "Sort by" 푸터 제거하고 MRU 정렬 내장(`commands/mru.ts`, localStorage 영속) | M |
| ✅ 2-3 | 메뉴/팝업 열림·닫힘 모델 충돌 — hover가 먼저 열고 클릭 토글이 닫아서 "버튼을 눌러도 확장창이 안 뜨는" 증상, 알림 팝업 hover-out 닫힘 | 클릭으로 열기 + 이미 열려 있을 때만 hover로 메뉴 전환(메뉴바 관습), 닫기는 바깥 pointerdown/Esc/window blur(iframe 클릭 대응)로 통일. 바 전체 `onMouseLeave` 닫기 제거 | 완료 |
| ✅ 2-4 | 모달 dismissal 불일치 (설정/소스 모달에 Esc 없음) | 공용 `useDialogDismiss` 훅(Esc + 백드롭)으로 세 다이얼로그 통일. 팔레트는 옵션 폼에서 한 단계 뒤로 후 닫힘 | S |

## Phase 3 — 테마/시각 일관성

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ✅ 3-1 | sandbox 문서가 테마/폰트 하드코딩 (`createSandboxDocument`, 외부 창) | `getSandboxTheme()`이 base16 런타임 + fontStacks에서 `HtmlWindowTheme` 스냅샷을 만들어 sandbox 문서 `<style>`에 주입, `knoter:themechange` 시 srcDoc 재생성. `html:openWindow` IPC에 옵션 테마 스냅샷 추가(메인 프로세스에서 hex/폰트 검증) | M |
| ✅ 3-2 | 토큰 우회 하드코딩 색 (`rgb(255 255 255 / 0.08)`, 주황 radial-gradient) | 장식 그라디언트 제거, 백드롭 3곳을 `--surface-overlay` 토큰으로 치환 (white 0.08은 이전 정리에서 이미 제거됨) | S |
| ✅ 3-3 | radius 스케일 비일관 (6/7/8/9/10/13/999px 혼재) | `--radius-sm/md/lg/pill`(6/8/12/999px) density 토큰 4단계로 통일. 1px 라인 라운딩/0 리셋은 리터럴 유지 | S |

## Phase 4 — 피드백/상태 표시

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ✅ 4-1 | 장기 작업(llm rewrite 300s, sync 120s) 진행 표시 부재 | `runningOps`를 App이 보유(`beginOperation`/`endOperation` 컨텍스트), sync/source.add/report.context/llm.rewrite에 적용. 벨 아이콘 스피너 링 + 알림 팝업 상단 진행 중 항목 고정. 토스트는 시작/완료만 | M |
| ✅ 4-2 | 상시 상태 표시 부재 (vault 이름·연결 상태가 토스트로만 스침) | 메인 뷰 우측 하단 상태 칩(`StatusChip`): vault 이름·문서 수, 미연결/vault 없음 경고. 클릭 시 `vault.status` 명령 실행 | M |
| ✅ 4-3 | 안읽음 뱃지가 본 메시지도 카운트, 토글만 해도 리셋 | 4초 완주·수동 닫기·팝업 열림 중 메시지는 "본 것", 다음 메시지에 잘린 토스트만 카운트. 리셋은 팝업이 "열릴" 때만 | S |
| ✅ 4-4 | 탭 전환 시 iframe 재생성으로 스크롤 유실 | 최근 활성 8개 iframe 탭(artifact/source)을 `hidden`으로 유지(keep-alive), 탭별 `.html-page-scroll` 스크롤 컨테이너 분리. 상한 8 = 스크립트 없는 srcdoc iframe 메모리 트레이드오프 | M |

## Phase 5 — 접근성

| # | 결함 | 수정 방법 | 규모 |
| --- | --- | --- | --- |
| ✅ 5-1 | `button:focus-visible { outline: none }` — 포커스 식별 불가 | 기존 `--accent-focus-ring` 토큰으로 focus-visible 2px 아웃라인 복원(중복 토큰 추가 대신 재사용) | S |
| ✅ 5-2 | 다이얼로그 포커스 트랩/복원 부재 | `useDialogDismiss`에 Tab/Shift+Tab 트랩 + 열릴 때 포커스 진입(autoFocus 우선) + 닫힐 때 트리거 복원. 세 다이얼로그에 `containerRef` 연결 | M |
| ✅ 5-3 | ARIA menu/tablist 패턴 미완성 (화살표 키 없음, tablist 시맨틱 없음) | ToolMenu ↑↓ 순환/Home/End + 열릴 때 첫 항목 포커스·닫힐 때 트리거 복원, 탭 바 `role="tablist"`+`aria-selected`+`title`, 알림 팝업은 잘못된 menu role을 dialog로 교정 | M |

## 진행 중 추가된 사용자 지시 변경 (계획 외, 완료)

| # | 내용 | 구현 |
| --- | --- | --- |
| ✅ A-1 | 탭 바 호버 정책 변경: 탭 이름/표면에는 호버 색상 표시 없음, 닫기(X) 버튼만 원형(`border-radius: 999px`) 호버 하이라이트 | `.overlay-tab-select:hover` 무력화, `.overlay-tab-close` 22px 정원 + `--accent-selected` 토큰 |
| ✅ A-2 | X 아이콘이 원형 하이라이트에서 오른쪽으로 치우침 — UA 버튼 패딩(1px 6px)으로 콘텐츠 영역이 아이콘보다 작아지면 grid 중앙 정렬이 start로 폴백 | 고정폭 아이콘 버튼(`.overlay-tab-close`, 위젯 헤더/알림/토스트 버튼)에 `padding: 0` 명시 |
| ✅ A-3 | 오버레이 스코핑: 위젯 바가 핀된 상태에서 탭 바가 viewport 중앙이라 위젯 바와 겹침 | `.workbench-main`(relative) 래퍼 신설 — 메뉴 바·탭 바·transient 토스트를 메인 HTML 뷰 기준 absolute로 이동, 탭 바는 메인 뷰 중앙 정렬. 위젯 스택의 상/하단 회피 패딩(safe-area) 제거 |

## 권장 순서

1. ✅ **Phase 1 전부** (반나절 내, 발표 데모 안정화)
2. ✅ **2-2, 2-3** (팔레트/팝업 — 단축키 시스템(2-1 완료)과 묶이는 인터랙션 마감) + 2-4
3. ✅ **4-1, 4-2** (장기 작업·상시 상태 — llm rewrite 데모 신뢰성)
4. ✅ **3-1** (테마 관통 — 라이트 테마 데모가 필요할 때)
5. ✅ Phase 5와 나머지(3-2, 3-3, 4-3, 4-4)는 발표 후.

16개 결함 전부 구현됨(2026-06-10, `webs/design-defect-fixes` +
`webs/design-defect-post-demo`). 수동 GUI 스모크 패스(`npm run dev`)는
아직 수행되지 않음 — 검증은 `npm run check` +
`node --check electron/main.mjs`까지.
