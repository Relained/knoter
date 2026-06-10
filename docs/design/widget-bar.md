# 위젯 바 / 알림 이동 설계

최종 수정: 2026-06-10
적용 패키지: `web/`
상태: 구현 완료 — `npm run check`/CLI 테스트 통과, 수동 스모크는 미실시 (`docs/plan/roadmap.md` P0 참조)

이 문서는 HTML-first 워크벤치의 다음 두 기능에 대한 디자인/구현 설계다.

1. 오른쪽 **위젯 바** — 여러 artifact 뷰를 고정(pin)해 수직으로 상시 표시.
2. **toast history 이동** — 우하단 toast hub를 제거하고, 좌하단 메뉴바의 설정 위에
   알림(벨) 아이콘 + 확장 팝업으로 이전.

## 1. 위젯 바

### 1.1 목적

- 중간발표 데모에서 calendar / todo / tasks / LLM Wiki 등 어떤 타입의 artifact든
  메인 페이지 탭과 독립적으로 항상 보이게 고정한다.
- 탭은 "지금 보는 문서", 위젯 바는 "항상 곁에 두는 대시보드"라는 역할 분리.

### 1.2 레이아웃

```
+------------------------------------------------------------------+
|                    (overlay tab bar, top/bottom dock)            |
|                                                                  |
|  +--------------------------------------------+ || +----------+  |
|  |                                            | || | Calendar |  |
|  |                .html-page                  | || |  (iframe)|  |
|  |             (active HtmlTab)               | || +----------+  |
|  |                                            | || |   Todo   |  |
|  |                                            | || |  (iframe)|  |
|  +--------------------------------------------+ || +----------+  |
|  [menu bar]                          [transient toast]           |
+------------------------------------------------------------------+
   `||` = 바 폭 리사이저(왼쪽 엣지), 위젯 사이에는 수평 divider
```

- `<main class="html-workbench">`는 flex row: `.workbench-main`(flex: 1,
  relative — 메인 HTML 뷰 + 메뉴/탭 오버레이 + transient 토스트의 위치 기준) +
  `aside.widget-bar`(고정 폭). 위젯이 0개면 바 자체를 렌더하지 않는다.
- 메뉴 바·탭 바·토스트는 `.workbench-main` 내부 absolute라서 위젯 바와 겹치지
  않는다. 탭 바는 메인 뷰 가로 중앙에 정렬되고, 위젯 스택에는 별도 회피
  패딩이 필요 없다. 메뉴 팝업만 바의 `overflow: hidden` 클리핑을 피하기 위해
  슬롯 rect 기준 `position: fixed`로 띄운다.
- 위젯은 수직 스택. **기본 동일 비율**로 높이를 나누고, 위젯 사이 divider를
  드래그해 인접한 두 위젯의 비율을 조절한다.
- 바 폭은 왼쪽 엣지 드래그로 조절: 240–560px, 기본 320px.

### 1.3 상태 모델

```ts
// web/src/workbench/types.ts
export type WorkbenchWidget = {
  id: string;      // 고정된 뷰 id (HtmlTab.id와 동일 공간)
  view: HtmlTab;   // 렌더용 뷰 스냅샷 (탭 닫힘과 무관하게 유지)
  ratio: number;   // 0..1, 전체 합 = 1
};
```

- **pin**: 이미 같은 id가 있으면 무시(상태 메시지). 새 위젯은 `1/(n+1)` 비율을
  받고 기존 위젯 비율은 `n/(n+1)`로 스케일 — 수동 조절 비율을 보존한 채 공간 양보.
- **unpin**: 제거 후 남은 비율을 비례 재분배(합 1 정규화).
- **resize**: divider i 드래그 → `ratio[i]`/`ratio[i+1]` 쌍만 조절. 최소 높이
  (px 기준, 컨테이너 높이 대비 비율로 환산)로 클램프.
- 렌더는 `flex-grow: ratio` 인라인 스타일로 처리한다.

### 1.4 핀 진입점

- Artifacts ToolMenu: "Pin Artifact: LLM Wiki" 를 실제 핀 동작으로 연결,
  Calendar / Todo 핀 항목 추가.
- 커맨드 팔레트: 빌트인 뷰와 열린 탭 각각에 "Pin to widget bar: <title>" 커맨드.
- 위젯 헤더: unpin 버튼(`widget.unpin`)과 open-as-tab 버튼 제공.

### 1.5 렌더링과 안전 규칙

- 위젯 본문은 `HtmlPageView`를 그대로 재사용한다. 즉 artifact/source HTML은
  **기존 sandbox iframe 경로만** 통과하고(`sandbox=""`, 스크립트 금지),
  `daily-note`/`note-editor` kind는 메인 뷰와 같은 에디터 상태를 공유한다.
- `createSandboxDocument`에 compact 옵션을 추가해 위젯 폭에 맞는 패딩/폰트
  축소판 문서를 생성한다. sanitize 로직은 공유하며 변경하지 않는다.
- `web/agents.md`의 HTML 안전 규칙(sandboxed iframe / `html:openWindow` 외부 창)은
  위젯 바에도 동일하게 적용된다.

### 1.6 영속화

- 위젯 레이아웃: `localStorage["knoter.workbench.widgets"]`에 `{ id, ratio }[]`만 저장.
  HTML 스냅샷은 저장하지 않는다.
- 복원: `fixtures.ts`의 빌트인 뷰 레지스트리(`builtinViews`: llm-wiki, calendar, todo)
  + `initialTabs`에서 id로 재수화한다. 알 수 없는 id(런타임 생성 source 탭 등)는
  조용히 드랍하고 비율을 재정규화한다.
- 바 폭: 글로벌 설정 `widgetBarWidth`(`core/settings/preferences.ts`의
  `numberSetting`, 240–560, 기본 320)로 저장 — 기존 설정 영속화 경로 재사용.
- 향후 워크벤치가 `window.knoterApi`에 연결되면 explorer/search 결과 뷰도 같은
  모델로 핀 가능(id가 vault 경로가 됨). 이 문서의 모델은 그 단계에서도 유지된다.

## 2. toast history → 알림 벨 이동

### 2.1 변경 내용

- 우하단 `.toast-hub`(고정 상태줄 + Messages 토글 + 히스토리 패널)를 제거한다.
  위젯 바가 오른쪽을 차지하므로 공간 충돌을 피한다.
- 메뉴바(좌하단 수직 바) `systemToolItems`를 `[notifications, settings]` 순서로
  구성해 **설정 위에 벨 아이콘**(`notification.bell`)을 둔다.
- 벨 클릭 시 기존 `ToolMenu`와 같은 `.overlay-tool-menu` 패턴(오른쪽으로 펼침)의
  확장 팝업으로 메시지 히스토리를 표시: 타임스탬프, 개별 삭제, 전체 지우기.

### 2.2 새 메시지 동작 (자동소멸 토스트 + 뱃지)

- `pushStatus`는 (1) 히스토리 적재(최근 20개), (2) 안읽음 카운트 증가,
  (3) transient 토스트 표시를 수행한다.
- transient 토스트는 메뉴바 옆 좌하단(`left: 76px; bottom: 18px`)에 4초간
  표시 후 자동 소멸. 새 메시지가 오면 타이머를 리셋하고 내용을 교체한다.
- 벨 아이콘에는 안읽음 뱃지(개수)를 표시하고, 팝업을 여는 순간 0으로 리셋한다.

### 2.3 상태 변화

| 기존 | 변경 |
| --- | --- |
| `toastHistoryOpen` 상태 + 우하단 패널 | 벨 팝업 (OverlayBar 내 알림 슬롯) |
| `.workbench-status` 고정 표시 | 4초 자동소멸 `.workbench-toast` |
| Messages 토글 버튼 | 벨 아이콘 + 안읽음 뱃지 |

## 3. 구현 파일 맵

| 파일 | 변경 |
| --- | --- |
| `web/src/workbench/types.ts` | `WorkbenchWidget`, `ToolKey`에 `notifications` |
| `web/src/workbench/fixtures.ts` | `builtinViews` 레지스트리, `systemToolItems` 확장 |
| `web/src/workbench/components/WidgetBar.tsx` | 신규: 위젯 스택/divider/리사이저 |
| `web/src/workbench/App.tsx` | widgets 상태·핀 액션·영속화, toast 로직 교체 |
| `web/src/workbench/components/OverlayMenuBar.tsx` | 벨 버튼·뱃지·알림 팝업 |
| `web/src/workbench/components/ToolMenu.tsx` | 핀 항목 연결 |
| `web/src/workbench/utils/commands.ts` | Pin to widget bar 커맨드 |
| `web/src/workbench/utils/html.ts` | `createSandboxDocument` compact 옵션 |
| `web/src/core/settings/preferences.ts` | `widgetBarWidth` 설정 |
| `web/src/shared/icons/registry.tsx` | `notification.bell`, `widget.pin`, `widget.unpin` |
| `web/src/shared/styles/components/html-workbench.css` | flex row 레이아웃, 위젯/알림/토스트 스타일 |

## 4. 검증

- 자동: `cd web && npm run check` (워크벤치에는 동작 테스트 하니스가 없음 —
  `docs/plan/roadmap.md` P1의 web 하니스 재도입 항목 참조).
- 수동 스모크(`npm run dev`): 핀 3개 동일 비율 → divider/바 폭 드래그 → 리로드 복원
  → 상태 메시지 발생 시 토스트 4초 소멸·뱃지 증가 → 벨 팝업 히스토리/삭제 →
  탭 dock top/bottom 양쪽 레이아웃 확인.
