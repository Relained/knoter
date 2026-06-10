# knoter architecture

## Goal

`knoter`는 유저의 기존 기록/비즈니스 로직 프로그램을 vault 기반 기록 시스템으로 대체하는 CLI와 React/Vite 웹 프론트엔드를 함께 관리하는 모노레포다. CLI는 `cli/`, 프론트엔드는 `web/`, 공유 문서는 루트 `docs/`에 둔다.

현재 백엔드는 LLM으로 prose를 직접 생성하지 않는다. CLI/MCP는 JSON context와 저장/검색 기능을 제공하고, 외부 LLM agent가 source를 바탕으로 artifact를 작성하거나 기존 artifact를 보강한다.

## Runtime Ports

로컬 개발 기본 포트는 충돌 가능성이 높은 `5000`, `7000`, `8080`, `5173`
대신 다음 값을 사용한다.

| Surface | Default |
| --- | --- |
| Local TEI/OpenAI-compatible embedding API | `http://127.0.0.1:39280` |
| Web Vite dev/preview | `http://127.0.0.1:39281` |

CLI는 embedding server HTTP API만 호출한다. TEI 실행/중지, 컨테이너 기반 실행,
macOS local service UX는 향후 packaged app layer 책임이다. `web/`에는
Electron shell과 CLI-backed IPC bridge가 있지만, TEI lifecycle과
daemon-backed runtime은 아직 구현 대상이 아니다.

## Document Layers

Target model:

| Layer | 소유자 | 저장 | 표시 | 검색 정책 |
| --- | --- | --- | --- | --- |
| `source` | 유저 | `sources/YYYY-MM-DD/...`에 원본 보존 | 원본/추출 projection | 기본 검색 제외, 명시적 evidence 탐색 |
| `artifact` | 외부 LLM agent | `artifacts/...` | HTML 우선 | `kind: llm-wiki`만 기본 검색, 다른 artifact는 명시 포함 |

`rewritten`은 새 product model에서 제거 대상이다. 현재 CLI/테스트에는
`rewritten` 저장소와 layer 값이 남아 있으므로, 마이그레이션 전까지
agent-authored indexed knowledge의 legacy alias로만 취급한다. 사용자-facing
UI와 신규 계약은 Source / Artifact 이분화를 우선한다.

Source 정책:

- Source는 유저가 직접 추가하는 모든 원본 데이터다. Markdown, txt, PDF,
  이미지, 스크린샷 등 다양한 `media_type`을 허용한다.
- 원본 보존이 핵심이며 직접 검색/인덱싱은 정책에 따라 제한한다.
- Source metadata는 `privacy`, `time_scope`, `wiki_policy`,
  `extraction_status`, `doc_date`를 포함하는 방향이다.
- `privacy: public` source는 agent가 기본적으로 읽을 수 있고,
  `time_scope: permanent`이면 `llm-wiki` 반영 후보가 된다.
- `privacy: private` source는 기본적으로 `llm-wiki` 반영 금지이며 유저
  opt-in이 필요하다.
- `time_scope: temporary` source는 task/daily/tracker artifact로 처리하고,
  반복 패턴이나 장기 제약으로 승격할 때만 정책에 따라 `llm-wiki`에 반영한다.

Artifact 정책:

- Artifact는 source를 바탕으로 agent가 생성/갱신하는 파생 결과다.
- `kind: llm-wiki` artifact는 장기 지식 베이스이며 기본 검색/추론 레이어다.
- 사용자용 artifact 예: `daily-report`, `task-board`, `diet-tracker`,
  `project-status`. 이들은 기본 검색에서 제외하거나 `retrieval: explicit`
  정책을 둔다.
- Artifact display format은 HTML을 1급 형식으로 지원한다. 검색에는 HTML
  원문이 아니라 plain-text projection, heading/section outline, source
  reference projection을 사용한다.
- Agent HTML은 iframe sandbox, script 기본 금지, inline event handler 금지,
  외부 네트워크 로드 제한, sanitizer 적용을 전제로 렌더링한다.

새 파이프라인 방향:

1. 유저가 source를 추가한다.
2. 원본을 `sources/`에 저장한다.
3. `media_type`을 판별한다.
4. PDF/OCR/text extractor를 실행한다.
5. source metadata와 extraction projection을 저장한다.
6. Agent가 public 또는 opt-in source를 읽는다.
7. Permanent 정보는 `llm-wiki` artifact에 반영한다.
8. Temporary 정보는 task/daily/tracker artifact에 반영한다.
9. 프론트는 HTML artifact를 안전하게 렌더링한다.
10. 기본 검색은 `artifact.kind: llm-wiki`를 대상으로 한다.

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
- `kn llm rewrite` (명시적 LLM namespace)

일반 `kn` 명령은 임베딩 외 LLM 호출을 하지 않는다. CLI는 embedding server
HTTP API만 의존한다. TEI 실행/중지 같은 service lifecycle은 향후 packaged
app layer 책임이며 현재 React/Vite renderer에는 구현되어 있지 않다.

LLM 호출과 prompt 조립은 `kn llm` namespace에만 둔다. 현재 구현된
`kn llm rewrite --source <path>`는 Codex CLI를 격리된 agent workspace에서
호출해 `rewritten.md`와 template 기반 `artifacts/**/*.md`를 작성하게 한 뒤,
그 결과 Markdown을 active vault로 import하고 인덱싱한다. 시나리오/출력 계약은
`docs/template.md`를 따른다.

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

`web/`는 HTML-first workbench renderer와 Electron development shell로
구성된다. `npm run dev`는 test vault bootstrap 후 Vite dev server를
`127.0.0.1:39281`에 띄우고 Electron BrowserWindow를 preload IPC와 함께
실행한다.

Workbench 핵심 모델:

- 문서는 HTML page tab(`HtmlTab`)으로 열린다. Command palette와 overlay
  menu/tab bar가 주 진입점이다.
- Artifact HTML은 in-app에서는 sandbox iframe으로, 분리 창에서는
  sanitizer + deny-all CSP를 거친 Electron window(`html.openWindow`)로
  렌더링한다. Script/iframe/inline handler/외부 로드는 차단한다.
- Source 추가 modal은 target metadata(`media_type`, `privacy`,
  `time_scope`, `wiki_policy`)를 미리 반영한 draft 형태다.
- Base16 theme/semantic icon/global settings runtime은
  `src/shared/*`, `src/core/settings/*`에 있다. Settings는 renderer
  `localStorage`로 저장하며, JSONC config file bridge는 contract만 있고
  현재 preload는 노출하지 않는다.
- 이전 pane/tab/floating window workspace, sidebar surface host,
  Graph 3D template preview, keybinding 시스템은 제거됐다.

Renderer는 SQLite를 직접 소유하지 않는다. Web은 typed API contract
(`window.knoterApi`)를 통해 vault/explorer/graph/search payload를 요청하고,
Electron main handler가 CLI JSON surface를 호출해 active vault의
`sources/`, legacy `rewritten/`, `artifacts/` Markdown과 effective template로
Explorer projection을 만든다. 이는 packaged daemon이 아니라 web cache 구축
전의 임시 CLI-backed bridge다. workbench renderer는 `knoterApi`에 연결되어
vault 문서를 커맨드 팔레트로 열람한다. 진행 상황은 `docs/plan/progress.md`,
남은 작업은 `docs/plan/roadmap.md`를 본다.

현재 web 검증은 `npm run check`의 TypeScript/build 확인이 기준이다. Web
unit test와 Playwright smoke harness는 제거된 상태이며, 재도입 전까지 해당
커버리지를 주장하지 않는다.

Deferred/legacy:

- `cluster`: 향후 app/frontend 계층에서 zvec 직접 접근으로 처리
- `schedule`: CLI 타이머 관리에서 제외
- `tag auto`: 제거
- PageIndex: 후속 PoC
- real 2D/3D graph renderer/state model: web 후속 작업. API/daemon bridge가
  실제 graph payload(`document_graph_edges`)를 제공하기 전까지 `graph.get`은
  edge 없는 Explorer projection을 반환한다.

## Web API And Cache Direction

Current typed web API surfaces:

- `vault.getActive`, `vault.switch`
- `explorer.list`, `explorer.read`, `explorer.refresh`
- `graph.get`, `graph.refresh`
- `search.query`
- `html.openWindow`

Current Electron handler backing:

- `vault` and template/search requests call `bun cli/src/cli.ts --format json ...`
- `explorer.list` includes the effective template plus active vault
  `sources/**/*.md`, legacy `rewritten/**/*.md`, and `artifacts/**/*.md`
- `explorer.read` returns file content for a listed item after vault-root path
  containment checks
- `graph.get` remains a lightweight projection over Explorer items (currently
  without edges) until the CLI `document_graph_edges` table is wired through
  the web bridge
- `html.openWindow` opens sanitized artifact HTML in a sandboxed Electron
  window with a deny-all CSP

Cache direction:

- web cache is a recoverable projection, not source of truth
- CLI vault metadata remains authoritative for notes/chunks/search state
- web cache may use a separate SQLite DB and JSON snapshots later
- OS-standard config/cache/state/log path migration is deferred to a later
  milestone; do not mix it into the current daemon bridge work

## Retrieval

현재 구현의 기본 검색은 SQLite FTS5 + zvec hybrid다. 기본 검색 대상은
non-artifact 레이어(legacy rewritten 포함)와 `artifact.kind: llm-wiki`다.

- CJK 청킹은 `Intl.Segmenter` 기반 문장 경계를 사용한다.
- 짧은 CJK keyword는 FTS5 trigram 한계를 보완하기 위해 안전한 LIKE fallback을 사용한다.
- zvec score는 distance가 아니라 similarity로 normalize한다.
- `llm-wiki` artifact만 기본 검색에 포함하고 다른 artifact는
  `--include-artifacts`로 명시적으로 포함한다. report retrieval에서
  `llm-wiki`는 날짜 스코프 면제 대상이다(durable 지식 베이스).

## Document Graph Projection

CLI metadata now includes a recoverable `document_graph_edges` projection table.
It stores:

- source -> rewritten lineage, with stale `source_note_id` ignored when the
  referenced note no longer exists
- template -> artifact lineage from explicit `artifact_template_id`
- note -> chunk containment edges
- chunk prev/next adjacency edges

The projection refreshes after successful `kn add`, `kn sync`, and MCP/shared
`kn_add_note` flows. It is still CLI-owned storage; the current web `graph.get`
handler has not yet been switched from Explorer projection to this table.

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
| `src/commands/llm.ts` | `kn llm rewrite` 명시적 LLM workflow surface |
| `src/core/*` | command-independent business logic |
| `src/core/report-*.ts` | report context bundle, retrieval, continuity, serialization |
| `src/core/llm-rewrite.ts` | Codex workspace/prompt/import for `kn llm rewrite` |
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
