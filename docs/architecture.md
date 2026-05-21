# knoter architecture

## Goal

`knoter`는 유저의 기존 기록/비즈니스 로직 프로그램을 vault 기반 기록 시스템으로 대체하는 CLI와 React/Vite 웹 프론트엔드를 함께 관리하는 모노레포다. CLI는 `cli/`, 프론트엔드는 `web/`, 공유 문서는 루트 `docs/`에 둔다.

현재 백엔드는 LLM으로 prose를 직접 생성하지 않는다. CLI/MCP는 JSON context와 저장/검색 기능을 제공하고, 외부 LLM agent가 template을 사용해 rewritten 문서와 artifact를 작성하거나 기존 artifact를 보강한다.

## Runtime Ports

로컬 개발 기본 포트는 충돌 가능성이 높은 `5000`, `7000`, `8080`, `5173`
대신 다음 값을 사용한다.

| Surface | Default |
| --- | --- |
| Local TEI/OpenAI-compatible embedding API | `http://127.0.0.1:39280` |
| Web Vite dev/preview | `http://127.0.0.1:39281` |

CLI는 embedding server HTTP API만 호출한다. TEI 실행/중지, 컨테이너 기반 실행,
macOS local service UX는 향후 packaged app layer 책임이다. `web/`에는
Electron shell과 IPC skeleton이 생겼지만, TEI lifecycle과 daemon-backed
runtime은 아직 mock boundary 이후 단계다.

## Document Layers

| Layer | 소유자 | 저장 | 청킹/FTS/vector | 기본 검색 |
| --- | --- | --- | --- | --- |
| `source` | 유저 | `sources/YYYY-MM-DD/...`로 이동/복사 후 경로 참조 | 제외 | 제외 |
| `rewritten` | 외부 LLM agent | `rewritten/YYYY-MM-DD/...` | 포함 | 포함 |
| `artifact` | 외부 LLM agent | `artifacts/YYYY-MM-DD/...` | 포함 | 제외 |

정책:

- `source`는 metadata/lineage만 저장한다.
- `rewritten` 생성은 항상 외부 LLM agent가 수행한다. `knoter`는 저장과 검증만 한다.
- `artifact`는 인덱싱하지만 기본 검색에서 제외한다. `--include-artifacts`가 있을 때만 검색/continuity에 포함한다.
- 최종 산출물은 단일 daily report로 고정하지 않는다. 하나의 context에서 daily report, task list, workout log, morning brief, personal wiki, area note 등 여러 artifact가 생성될 수 있고, 기존 artifact의 연장선으로 업데이트될 수 있다.
- `kind`는 자동 추론하지 않는다. frontmatter 또는 외부 agent가 명시한 raw string만 저장한다.
- task/workout/area/metric 추출은 rewritten 단계의 외부 agent가 판단하고 `note_signals`에 저장한다.

## Active CLI Boundary

일반 `kn` 명령:

- `kn vault create|list|switch|delete|status`
- `kn add`
- `kn sync`
- `kn search`
- `kn get`, `kn get batch`
- `kn tag list|add|remove`
- `kn template get|list|validate`
- `kn report context`
- `kn mcp`
- `kn service status`

일반 `kn` 명령은 임베딩 외 LLM 호출을 하지 않는다. CLI는 embedding server
HTTP API만 의존한다. TEI 실행/중지 같은 service lifecycle은 향후 packaged
app layer 책임이며 현재 React/Vite renderer에는 구현되어 있지 않다. LLM 호출
또는 prompt 조립 기능은 향후 `kn llm` namespace로 격리한다.

`kn service status --check`는 현재 vault에 설정된 embedding endpoint를
점검하는 별도 service surface다. `kn vault status --check-providers`도
vault metadata와 provider health를 함께 확인하는 기존 호환 surface로 남아
있다.

`kn mcp`의 기본 transport는 `stdio`다. 코드에는 `--transport http`,
`--daemon`, `kn mcp stop`이 존재하지만 현재는 experimental surface로 취급하고,
호환성/테스트 기준은 stdio tool contract를 우선한다. HTTP mode는 `/health`와
`/mcp` endpoint를 연다.

MCP tool surface:

- `kn_search`
- `kn_get`
- `kn_get_batch`
- `kn_vault_status`
- `kn_add_note`
- `kn_template_get`
- `kn_report_context`
- `kn_rewrite_context`

## Web Boundary

`web/`는 React/Vite renderer에서 Electron-backed development shell로 이동
중이다. `npm run dev`는 Vite dev server를 `127.0.0.1:39281`에 띄우고
Electron BrowserWindow를 preload IPC와 함께 실행한다. 핵심 기능은 pane/tab/
floating window workspace, command palette, Markdown host object, Settings/
Todo/Tasks/Calendar object state, Graph 3D template preview, Base16/icon/theme
runtime, JSONC global settings bridge다.

Renderer는 SQLite를 직접 소유하지 않는다. Web은 typed API contract를 통해
vault/explorer/graph/search payload를 요청하고, Electron main/preload/daemon
layer가 CLI/vault metadata와 web cache projection을 담당하는 방향이다. 현재
IPC handler는 mock payload를 반환하는 skeleton이며, daemon-backed 실제 vault
연결은 다음 단계다.

사이드바는 IDE-style surface host다. Rail에서 Explorer/Search/Graph/Tasks/
Settings surface를 전환하고, Explorer surface는 source/rewritten/template
space 선택을 갖는다. 기본 선택은 template-only다.

검증은 `npm test`의 TypeScript/build/unit suite와 `npm run test:e2e`의
Playwright smoke suite로 나뉜다. E2E는 Vite dev server를 `39281`에 띄우고
Chromium으로 application menu, sidebar, command palette, Settings floating
window, split pane, floating window 추가를 확인한다.

Deferred/legacy:

- `cluster`: 향후 app/frontend 계층에서 zvec 직접 접근으로 처리
- `schedule`: CLI 타이머 관리에서 제외
- `tag auto`: 제거
- PageIndex: 후속 PoC
- real 2D/3D graph renderer/state model: web 후속 작업. API/daemon bridge가
  실제 graph payload를 제공하기 전까지 Graph 3D는 template preview로 유지한다.

## Web API And Cache Direction

Current typed web API surfaces:

- `vault.getActive`, `vault.switch`
- `explorer.list`, `explorer.refresh`
- `graph.get`, `graph.refresh`
- `search.query`

Cache direction:

- web cache is a recoverable projection, not source of truth
- CLI vault metadata remains authoritative for notes/chunks/search state
- web cache may use a separate SQLite DB and JSON snapshots later
- OS-standard config/cache/state/log path migration is deferred to a later
  milestone; do not mix it into the current daemon bridge work

## Retrieval

기본 검색은 SQLite FTS5 + zvec hybrid다.

- CJK 청킹은 `Intl.Segmenter` 기반 문장 경계를 사용한다.
- 짧은 CJK keyword는 FTS5 trigram 한계를 보완하기 위해 안전한 LIKE fallback을 사용한다.
- zvec score는 distance가 아니라 similarity로 normalize한다.
- artifact는 기본 검색에서 제외한다.

## Report Context

`kn report context --date YYYY-MM-DD`는 외부 agent용 JSON bundle만 만든다. Agent는 이 bundle을 시작점으로 삼고, 최종 artifact 계획을 세우기 전에 `kn search`, `kn get`, MCP retrieval 등으로 관련 DB 지식을 추가 탐색해야 한다.

포함 항목:

- vault-local 또는 fallback template
- target date source inventory
- target date rewritten notes
- target date daily notes
- target date signals
- previous 7 days continuity
- date/tasks/workouts/areas retrieval groups

continuity 정책:

- `doc_date` 기준 이전 7일
- 기본 `rewritten` notes/signals만 포함
- `source`는 제외
- `artifact`는 `--include-artifacts`에서만 포함

## Template Contract

`kn template validate` is local-only and never calls an LLM.

If template frontmatter exists, validation enforces:

- `id`: non-empty string
- `name`: non-empty string
- `version`: non-empty string or number
- `kind`: optional non-empty string
- `locale`: optional non-empty string
- `requiredSections`: optional array of section headings that must exist in the body
- `requiredVariables`: optional array of `{{variable}}` placeholders that must exist in the body
- `variables`: optional array or object map; unused declarations are warnings

Validation returns machine-readable `errors`, `warnings`, and `checks`.

## Code Map

| Path | 역할 |
| --- | --- |
| `src/cli.ts` | commander entrypoint |
| `src/commands/*` | CLI command surface |
| `src/core/*` | command-independent business logic |
| `src/core/report-*.ts` | report context bundle, retrieval, continuity, serialization |
| `src/mcp/server.ts` | stdio MCP tools |
| `src/pipeline/*` | parse/chunk/hash/embed/preprocess |
| `src/search/*` | hybrid search and score fusion |
| `src/stores/meta-store.ts` | SQLite metadata, chunks, signals, FTS |
| `src/stores/vec-store.ts` | zvec vector store |

## Harness

코드 변경은 `agents.md` 기준으로 진행한다.

- 작은 작업 단위로 나눈다.
- 테스트 또는 검증 명령을 남긴다.
- code-affecting commit 전 analyzer PASS를 받는다.
