# 웹 커맨드 레지스트리 / CLI 실연동 설계

최종 수정: 2026-06-10
적용 패키지: `web/`
상태: 구현 완료 — `npm run check` 통과, dev 셸 부팅·vault 연결 확인, GUI 상호작용 스모크는 수동 확인 필요

이 문서는 워크벤치와 CLI 백엔드의 실연동, 그리고 커맨드 팔레트 중심의 명령
아키텍처 설계를 기술한다.

## 1. 원칙

1. **명령 단일 소스**: 모든 기능(백엔드 호출 + UI 동작)은
   `web/src/workbench/commands/registry.ts`의 `WorkbenchCommand` 리스트로 선언한다.
2. **버튼 = 팔레트**: UI의 모든 버튼(툴 메뉴, 퀵 액세스, 시스템 버튼, 에디터 저장
   버튼)은 `executeCommand(commandId)` 하나를 호출한다. 팔레트에서 같은 명령을
   찾아 실행한 것과 항상 동일하게 동작한다.
3. **옵션은 명령의 부가 옵션**: 옵션이 선언된 명령은 실행 전 팔레트 2단계 옵션
   폼을 거친다. 버튼에서 직접 호출돼도 같은 폼이 뜬다.
4. **렌더러는 `window.knoterApi` 뒤에만**: Electron/Node API를 직접 만지지 않고,
   백엔드 부재 시(브라우저 단독) 명시적 상태 메시지로 실패한다.

## 2. 명령 모델

```ts
type CommandOption = {
  key: string; label: string;
  type: "string" | "number" | "boolean" | "enum";
  required?: boolean; enumValues?: string[];
  defaultValue?: string | number | boolean; placeholder?: string;
};

type WorkbenchCommand = {
  id: string; title: string; detail: string; icon: IconName;
  options?: CommandOption[];
  run: (values: CommandValues) => void | Promise<void>;
};
```

- 레지스트리는 `buildWorkbenchCommands(ctx)`로 매 렌더 구성되며 `CommandContext`
  (api 클라이언트, 탭/위젯/에디터 상태, 상태 메시지, vault 재로드 등)를 닫아 가진다.
- 실행 흐름: `executeCommand(id, preset?)` → 옵션 없으면 즉시 `run(values)`,
  옵션 있으면 `PendingCommand`로 팔레트 옵션 폼 → Run/Enter 시 실행.
  실행 오류는 `"<title> failed: <message>"` 상태 메시지로 수렴한다.
- 동적 명령: 열린 탭(`open.tab.<id>`), 고정 가능 뷰(`pin.<id>`), 그리고 vault
  문서(`open.doc.<path>`, explorer 목록 기반 "Open: <title>")가 자동 생성된다.

## 3. 명령 목록 (백엔드)

| 명령 id | 옵션 | CLI 매핑 |
| --- | --- | --- |
| `search.run` | query*, mode(hybrid/keyword/semantic), includeArtifacts | `kn search` |
| `sync.run` | full, changed, prune | `kn sync` |
| `explorer.refresh` | — | explorer 재로드 |
| `vault.list` / `vault.status` | — | `kn vault list/status` |
| `vault.switch` | name* | `kn vault switch` |
| `source.add` | tags | 네이티브 파일 피커 → `kn add --tag...` |
| `note.save` | editor(daily/simple), fileName, tags | 임시 md → `kn add --force` |
| `template.get` / `template.list` | — | `kn template get/list` |
| `tag.list` | — | `kn tag list` |
| `tag.add` / `tag.remove` | target*, tags* | `kn tag add/remove` |
| `report.context` | date*(기본 오늘), includeArtifacts | `kn report context` |
| `llm.rewrite` | source*, agent(codex/claude) | `kn llm rewrite` (300s 타임아웃, 동시 실행 가드) |

UI 명령: `open.calendar/todo/daily-note/simple-note`, `source.modal`,
`settings.open`, `palette.open`, `palette.artifacts`, `template.create`,
`tab.close`, `tab.next`, `tab.prev`.

## 3.1 단축키 시스템

`web/src/workbench/commands/keybindings.ts` — chord 문자열("Mod+K",
"Ctrl+Shift+Tab")을 **명령 id에 1:1로 연결**한다. 명령 레지스트리가 단일
소스이므로 단축키도 자동으로 버튼·팔레트와 같은 동작을 실행한다.

- `Mod`는 macOS에서 ⌘(Meta), 그 외 Ctrl로 확장. 충돌 시 기존 명령에서 chord를
  회수(1 chord = 1 명령)하고 설정 UI에 안내.
- 기본값: `Mod+K` 팔레트, `Mod+Shift+F` 검색, `Mod+S` 노트 저장(활성 에디터
  기준 기본값 프리필), `Mod+,` 설정, `Mod+D` 데일리 노트, `Mod+Shift+S` 동기화,
  `Mod+Shift+E` 익스플로러 새로고침, `Mod+Shift+W` 탭 닫기, `Ctrl+Tab`/
  `Ctrl+Shift+Tab` 탭 순환. (Electron 기본 메뉴가 점유한 `Mod+W`, `Mod+R` 등은
  기본값에서 회피.)
- 디스패처는 App 전역 keydown: 입력 필드에서는 Ctrl/Meta 조합만 동작, Escape는
  닫기 전용으로 환원(기존 "Esc로 팔레트 열기" 제거).
- 영속화: `localStorage["knoter.workbench.keybindings"]` (commandId→chord 맵).
- **인터페이스**: 설정 모달 "Keyboard Shortcuts" 섹션 — 명령별 chord 레코더
  (클릭→키 입력 캡처, Backspace 해제, Esc 취소), 충돌 안내, Reset to Defaults.
  동적 명령(`open.doc.*`, `open.tab.*`, `pin.*`)은 바인딩 대상에서 제외.
- 팔레트 리스트에 바인딩된 chord를 `kbd` 힌트로 표시.

## 4. IPC 채널

`web/src/core/ipc/contracts.ts`가 타입 소스이고, `electron/main.mjs` 핸들러가
`bun cli/src/cli.ts --format json ...`을 호출한다. 기존 채널에 더해:

`vault:list`, `vault:status`, `sync:run`, `source:addFromPicker`(다이얼로그),
`note:save`(임시 파일 작성 후 add, 파일명 검증), `template:get`, `template:list`,
`tag:list`, `tag:update`, `report:context`, `llm:rewrite`.

- `runCli(args, { timeoutMs })`: 기본 30s, 인덱싱 계열(add/sync/report) 120s,
  `llm:rewrite` 300s.
- SQLite 락(`database is locked`) 발생 시 600ms 간격으로 최대 2회 재시도 —
  dev 부트스트랩과의 경합 흡수.
- 입력 검증은 `electron/cli-contract.mjs`: agent/tag action enum, `YYYY-MM-DD`
  날짜, 태그 배열, 노트 파일명(경로 구분자·`..`·선행 점 금지, `.md` 강제).

## 5. 표시 규칙

- vault 문서(markdown)는 `marked`(GFM, breaks)로 HTML 변환 후 **기존 sandbox
  경로**(`createSandboxDocument` sanitize → `sandbox=""` iframe)로만 렌더한다.
  frontmatter는 표시 전에 제거한다. HTML 안전 규칙은 `web/agents.md` 그대로.
- 검색 결과/단순 목록(vault/tag/template/report)은 escapeHtml 기반 자체 생성
  HTML 탭으로 표시한다(신뢰 경로).
- Daily/Simple Note 에디터에는 "Save to Vault" 버튼이 있고 `note.save` 명령을
  preset(editor)과 함께 실행한다.

## 6. 알려진 한계 / 후속

- SourceModal의 privacy/time_scope/wiki_policy 메타데이터는 CLI 미지원 —
  드래프트 UI만 유지하고 실제 저장은 `source.add`(파일+태그) 경로 사용.
  Source/Artifact 모델 마이그레이션(plan P0-2) 이후 연결.
- `vault.switch`의 vault 이름은 문자열 입력 — 동적 enum(목록 프리로드)은 후속.
- 검색 결과 탭은 정적 HTML — 결과 문서는 팔레트의 `Open:` 명령으로 연다.
  sandbox iframe 내 클릭 내비게이션은 의도적으로 막혀 있다.
- 자동 테스트 하니스 없음(사용자 결정): 검증은 `npm run check` + 수동 스모크.

## 7. 수동 스모크 체크리스트

`cd web && npm run dev` (테스트 vault 자동 부트스트랩) 후:

1. 시작 토스트 "Vault connected: testvault (N documents)." 확인.
2. Esc → 팔레트 → "Search Vault" → query/mode 입력 → 결과 탭.
3. 팔레트 "Open: ..." 문서 열기 → markdown 렌더 확인.
4. Sync Vault Index(옵션 폼) → 완료 카운트 토스트.
5. Vault Status / List Vaults / List Tags / Open Effective Template 탭.
6. Add Source Files to Vault → 파일 피커 → explorer 반영.
7. Daily Note 작성 → Save to Vault → 팔레트에서 "Open: daily-note-..." 확인.
8. Build Report Context(date) → JSON 탭.
9. Run Agent Rewrite(source, agent) — codex/claude CLI 설치 시.
10. 툴 메뉴 버튼과 팔레트 동일 명령 대조(예: Search 버튼 = search.run 폼).
