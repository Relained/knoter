# knoter architecture

## Goal

`knoter`는 유저의 기존 기록/비즈니스 로직 프로그램을 vault 기반 기록 시스템으로 대체하는 백엔드 CLI다. 프론트엔드는 별도 컨텍스트에서 `../knoter-web`에 React + Electron 형태로 진행한다.

현재 백엔드는 LLM으로 prose를 직접 생성하지 않는다. CLI/MCP는 JSON context와 저장/검색 기능을 제공하고, 외부 LLM agent가 template을 사용해 rewritten 문서와 artifact를 작성한다.

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
- `kind`는 자동 추론하지 않는다. frontmatter 또는 외부 agent가 명시한 raw string만 저장한다.
- task/workout/area/metric 추출은 rewritten 단계의 외부 agent가 판단하고 `note_signals`에 저장한다.

## Active CLI Boundary

일반 `kn` 명령:

- `kn vault`
- `kn add`
- `kn sync`
- `kn search`
- `kn get`
- `kn template`
- `kn report context`
- `kn mcp`

일반 `kn` 명령은 임베딩 외 LLM 호출을 하지 않는다. LLM 호출 또는 prompt 조립 기능은 향후 `kn llm` namespace로 격리한다.

Deferred/legacy:

- `cluster`: 자동 분류/군집화는 현재 목표에서 제외
- `schedule`: CLI 타이머 관리 대신 설치 시 launchctl/systemd service template 제공
- `tag auto`: 제거
- PageIndex: 후속 PoC
- frontend: backend 안정화 뒤 별도 컨텍스트

## Retrieval

기본 검색은 SQLite FTS5 + zvec hybrid다.

- CJK 청킹은 `Intl.Segmenter` 기반 문장 경계를 사용한다.
- 짧은 CJK keyword는 FTS5 trigram 한계를 보완하기 위해 안전한 LIKE fallback을 사용한다.
- zvec score는 distance가 아니라 similarity로 normalize한다.
- artifact는 기본 검색에서 제외한다.

## Report Context

`kn report context --date YYYY-MM-DD`는 외부 agent용 JSON bundle만 만든다.

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
