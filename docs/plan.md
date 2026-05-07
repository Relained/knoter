# KN CLI 구현 계획서 (Implementation Plan)

> specification.md 기반 단계별 구현-검증 로드맵.
> 각 Phase는 **구현 → 검증 → 완료 체크** 구조로 진행한다.
> 진행 상태: `[ ]` 미착수 / `[~]` 진행중 / `[x]` 완료 / `[!]` 블로커

---

## Phase 1: CLI 프로젝트 구조 구성 및 백본 작성

### 1.0 의존성 설치 및 라이브러리 선정
- [x] 추가 의존성 설치:
  ```bash
  bun add ansis ora @clack/prompts consola gray-matter
  ```
- [x] Phase 10에서 MCP SDK 설치:
  ```bash
  bun add @modelcontextprotocol/sdk
  ```

**채택 라이브러리 및 역할:**

| 패키지 | 용도 | 사용처 |
|--------|------|--------|
| `commander` (기존) | 인자 파싱, 서브커맨드 라우팅 | `src/cli.ts`, 모든 커맨드 |
| `ansis` | 컬러/스타일 터미널 출력 | `src/core/output.ts`, 전체 text 포맷 |
| `ora` | 스피너 (비동기 작업 진행 표시) | `kn add` 임베딩, `kn sync` |
| `@clack/prompts` | 인터랙티브 프롬프트 | `kn vault delete` 확인, `kn preprocessor` 바인딩 |
| `consola` | 구조적 로깅 | `src/core/logger.ts`, `--verbose` 모드 |
| `gray-matter` | YAML 프론트매터 추출 | `src/pipeline/parser.ts` |

**Bun 내장 API 활용 (외부 의존성 불필요):**

| API | 대체 대상 | 사용처 |
|-----|----------|--------|
| `Bun.glob()` | fast-glob, tinyglobby | `kn add` 파일 탐색 |
| `Bun.CryptoHasher("sha256")` | node:crypto, hash.js | `src/pipeline/hasher.ts` |
| `Bun.file()` | node:fs readFile | 파일 I/O 전반 |
| `bun:sqlite` | better-sqlite3 | `src/stores/meta-store.ts` |
| `bun:test` | jest, vitest | 테스트 전체 |

### 1.1 디렉토리 구조 정립
- [x] `src/` 디렉토리 생성 및 소스코드 재배치
  ```
  src/
    cli.ts            # kn 엔트리포인트 (commander 기반)
    commands/
      vault.ts        # kn vault 서브커맨드
      add.ts          # kn add
      search.ts       # kn search
      sync.ts         # kn sync
      tag.ts          # kn tag
      cluster.ts      # legacy/deferred: cluster
      get.ts          # kn get
      mcp.ts          # kn mcp
      schedule.ts     # legacy/deferred: schedule CLI
    core/
      config.ts       # 글로벌/볼트 설정 관리
      output.ts       # 표준 출력 envelope (success/error)
      errors.ts       # 타입드 에러 + exit code
      lock.ts         # 볼트 레벨 파일 락
      logger.ts       # 로깅 유틸
    stores/
      meta-store.ts   # SQLite 메타데이터 (기존 코드 이전)
      vec-store.ts    # zvec 벡터 저장소 (기존 코드 이전)
    pipeline/
      parser.ts       # 프론트매터/제목/태그 추출
      chunker.ts      # 스마트 청킹 (break-point scoring)
      embedder.ts     # 임베딩 런타임 (provider 추상화)
      hasher.ts       # SHA-256 콘텐츠 해시
      preprocessor.ts # FTS5 전처리기 프로토콜
    search/
      query-builder.ts  # FTS5 injection-safe 쿼리 빌더
      hybrid.ts         # 하이브리드 검색 파이프라인
      fusion.ts         # 스코어 정규화 + 선형 퓨전
      reranker.ts       # LLM 리랭킹 (optional)
      expander.ts       # 쿼리 확장 (optional)
  ```

### 1.2 package.json 및 빌드 설정
- [ ] package.json `name` → `knoter`, `bin` 필드에 `kn` 등록
- [ ] tsconfig.json `rootDir`/`outDir` 조정
- [ ] bun 런타임 shebang (`#!/usr/bin/env bun`) 설정

### 1.3 CLI 엔트리포인트 (`src/cli.ts`)
- [x] commander 기반 프로그램 등록
  - 글로벌 옵션: `--format text|json|jsonl`, `--vault <name>`, `--verbose`
- [x] 12개 서브커맨드 스텁 등록 (각 commands/*.ts에서 export)
- [x] `kn --help`, `kn --version` 동작 확인

### 1.4 공통 모듈 구현
- [x] `src/core/output.ts`: 표준 envelope
  - `success(command, vault, data)` → `{ ok: true, command, vault, timestamp, data }`
  - `error(command, vault, code, message)` → `{ ok: false, error: { code, message }, command, vault }`
  - 포맷별 직렬화: `text` (사람 가독), `json` (pretty), `jsonl` (스트림)
- [x] `src/core/errors.ts`: KnError 클래스 + 에러 코드 enum
  - `VAULT_NOT_FOUND`, `VAULT_LOCKED`, `FILE_NOT_FOUND`, `EMBEDDING_FAILED`, `CONFIG_INVALID` 등
  - exit code 매핑 (1=일반, 2=사용법, 3=잠금충돌)
- [x] `src/core/config.ts`: 설정 관리
  - 글로벌 설정: `~/.kn/config.json`
  - 볼트 설정: `<vault_root>/.kn/vault.json`
  - provider 필드: embedding `{ baseUrl, apiKey, model }`, llm `{ baseUrl, apiKey, model }`
  - 모델 프로필: `{ [model]: { maxContext: number } }`
  - active vault 레지스트리
- [x] `src/core/lock.ts`: 볼트 파일 락
  - `acquireLock(vaultRoot)` / `releaseLock(vaultRoot)`
  - PID + timestamp 기록, stale 감지 (TTL 초과 시 경고)
  - `--force-lock` 옵션 지원

### 1.5 기존 코드 이전
- [x] `meta-store.ts` → `src/stores/meta-store.ts` (복사 완료, barrel index.ts 포함)
- [x] `vec-store.ts` → `src/stores/vec-store.ts` (복사 완료)
- [x] 기존 테스트 파일 → `tests/` 디렉토리로 복사 (56 tests pass)

**검증 체크리스트:**
- [x] `bun run src/cli.ts --help` → 모든 서브커맨드 목록 표시 (12개 확인)
- [x] `bun run src/cli.ts --version` → `0.1.0` 출력
- [x] `bun run src/cli.ts vault --help` → vault 서브커맨드 도움말 (create/list/switch/delete/status)
- [x] `bun test` → 기존 28개 테스트 전체 통과
- [ ] output.ts의 success/error envelope가 3개 포맷으로 정상 직렬화
- [ ] lock.ts 유닛테스트: 획득/해제/중복획득 실패/stale 감지

---

## Phase 2: Vault 커맨드 (`kn vault`)

### 2.1 `kn vault create <name>`
- [x] 볼트 루트 + `.kn/` 디렉토리 생성
- [x] MetaDB 초기화 (`<vault_root>/.kn/meta.db`)
- [x] zvec 컬렉션 생성 (`createVaultCollection`)
- [x] 임베딩 모델 설정 (`MetaDB.setEmbeddingModel`)
- [x] 글로벌 config에 볼트 등록
- [x] `--path`, `--model` 옵션 처리

### 2.2 `kn vault list`
- [x] 등록된 볼트 목록 + active 마커 표시

### 2.3 `kn vault switch <name>`
- [x] active vault 전환, config 업데이트

### 2.4 `kn vault delete <name>`
- [x] `--confirm` 없으면 인터랙티브 확인
- [x] 메타DB + 벡터 저장소 + `.kn/` 제거
- [x] config에서 등록 해제

### 2.5 `kn vault status`
- [x] `MetaDB.getVaultStatus(vaultId)` 호출
- [x] noteCount, chunkCount, tagCount, lastIndexedAt, embeddingModel 출력

**검증 체크리스트:**
- [x] `kn vault create test-vault` → `.kn/` 생성, meta.db 존재, zvec 컬렉션 존재
- [x] `kn vault list` → test-vault 표시 (active 마커)
- [x] `kn vault status` → 빈 볼트 상태 (counts=0)
- [x] `kn vault delete test-vault --confirm` → 모든 아티팩트 제거 확인
- [x] 존재하지 않는 볼트 조작 시 적절한 에러 envelope 반환 (VAULT_NOT_FOUND, exit 1)
- [x] JSON 출력 (`--format json`) envelope 형태 검증

---

## Phase 3: 인제스천 파이프라인 (`kn add`)

### 3.1 파서 (`src/pipeline/parser.ts`)
- [x] YAML 프론트매터 추출 (`---` 구분자 사이)
- [x] 제목 추출 우선순위: frontmatter title → `# Heading` → 첫 비어있지 않은 줄 → 파일명 stem
- [x] 프론트매터 필드를 모든 청크에 전파할 구조체 반환

### 3.2 스마트 청커 (`src/pipeline/chunker.ts`)
- [x] 타겟 청크 크기: 512토큰, 오버랩 15%, 최소 100토큰
- [x] Break-point scoring + 이차 거리 감쇠 + 코드펜스 보호
- [x] 구조적 메타데이터: heading_path, seq_index
- [ ] AST-aware 청킹 (선택, `--chunk-strategy auto`): 향후 구현
- [x] CJK 문장 경계 보존: `Intl.Segmenter(locale, { granularity: 'sentence' })` 활용 (Phase 14)
- [x] CJK 텍스트 청크 크기 자동 축소 (~60%): `detectCJKRatio` > 0.3 시 적용 (Phase 14)

### 3.3 콘텐츠 해셔 (`src/pipeline/hasher.ts`)
- [x] SHA-256 해시 (Bun.CryptoHasher), 증분 인덱싱, `--force` 강제 재인덱싱

### 3.4 임베더 (`src/pipeline/embedder.ts`)
- [x] Provider 추상화 + 구조적 컨텍스트 포매팅
- [x] 로컬 순차 / 비로컬 bounded concurrency + 재시도/백오프 + 폴백
- [x] PlaceholderEmbeddingProvider (Phase 13에서 실제 프로바이더 교체)

### 3.5 상태 기반 쓰기 일관성
- [x] pending → vector upsert → synced 흐름
- [x] 벡터 실패 시 metadata 롤백
- [x] 청크 ID 양 레이어 동일 보장

### 3.6 `kn add` 커맨드 조립
- [x] file/dir/glob 입력, `--recursive`, `--tag`, `--dry-run`, `--force`
- [x] 볼트 락 + 파이프라인 전체 동작

**검증 체크리스트:**
- [x] parser: 프론트매터/제목/태그 추출 동작 확인
- [x] chunker: break-point scoring, heading_path, 코드펜스 보호 동작 확인
- [x] hasher: 동일 내용 → 동일 해시
- [x] `kn add notes/` → note/chunk 생성, vault status에 반영
- [x] 재실행 → 해시 일치로 스킵
- [x] `--force` → 재인덱싱 수행
- [ ] `--dry-run` → DB 변경 없음 (미검증)
- [ ] 벡터 쓰기 실패 시뮬레이션 (미검증)

---

## Phase 4: 검색 파이프라인 (`kn search`)

### 4.1 FTS5 쿼리 빌더 (`src/search/query-builder.ts`)
- [x] meta-store의 buildFtsQuery/normalizeBM25 재사용 (중복 없음)
- [x] tagFilter, dateFilter, combineFilters SQL 빌더

### 4.2 스코어 정규화 및 퓨전 (`src/search/fusion.ts`)
- [x] linearFusion (alpha 가중치), isStrongSignal, isBm25StrongSignal
- [x] mergeAdjacentChunks (noteId 그룹 → seq_index 연속 병합)

### 4.3 하이브리드 검색 (`src/search/hybrid.ts`)
- [x] semantic / keyword / hybrid 3모드 구현
- [x] Strong-signal shortcut (퓨전 후 + BM25-only tier-0)
- [x] zvec 필터 빌더 (CONTAIN_ANY, 날짜 epoch ms)

### 4.4 필터 및 점수 처리
- [x] --semantic-min, --keyword-min, --hybrid-min 적용
- [ ] --threshold deprecated alias (미구현)

### 4.5 후처리
- [x] 인접 청크 병합 구현

### 4.6 선택적 LLM 향상
- [ ] 리랭킹: Ollama 구현 있었으나 프로바이더 단일화로 철거 (향후 TEI/외부 API로 재구성)
- [ ] 쿼리 확장: 미구현

**검증 체크리스트:**
- [x] `kn search "rust" --mode keyword` → FTS5 결과 정상 (rust.md 반환)
- [x] `kn search "python" --mode semantic` → zvec 결과 정상 (2건)
- [x] `kn search "python" --mode hybrid` → 양 채널 퓨전 (score 0.80, semantic+keyword detail)
- [ ] 필터 (--tag, --after) E2E 미검증
- [ ] 인접 청크 병합 E2E 미검증

---

## Phase 5: 동기화 및 복구 (`kn sync`)

### 5.1~5.4 동기화 + 복구 + 정합성
- [x] 파일스캔 + 해시 비교 + 변경분 처리 + 삭제 파일 prune
- [x] `--full`, `--prune`, `--changed` 옵션
- [x] pending 엔트리 recovery (멱등 upsert)
- [x] metadata↔zvec reconciliation

**검증 체크리스트:**
- [x] 파일 추가 → `kn sync` → 새 노트 인덱싱 (added=1)
- [x] 파일 삭제 → `kn sync` → prune (pruned=1)
- [ ] `--full`, `--changed` 모드 미검증
- [ ] recovery, reconciliation 시나리오 미검증

---

## Phase 6: 태그 관리 (`kn tag`)

### 6.1 구현
- [x] `kn tag list/add/remove` 3개 서브커맨드
- [x] 양 레이어 동기화 (syncVectorTags)
- [x] 자동 태그 분류 제거:
  - 태그 후보와 의미 분류는 유저/외부 agent가 판단
  - `knoter`는 명시 태그 저장/삭제만 수행

**검증 체크리스트:**
- [x] `kn tag list` → 올바른 분포 (docs:2, guide:1, api:1)
- [x] `kn tag add docs/guide.md new-tag` → 추가 확인
- [ ] `kn tag remove` 미검증

---

## Phase 7: 문서 조회 (`kn get`)

### 7.1 `kn get`
- [x] 4단계 경로 해석: exact → suffix → substring → ID
- [x] `--section`, `--offset`, `--max-chars` 옵션
- [x] miss 시 유사 경로 제안
- [x] 단일 조회: `kn get <target>`

### 7.2 `kn get batch`
- [x] 명시적 배치 조회: `kn get batch <targets...>`
- [x] 응답 구조: `{ found, notFound }`
- [x] 기존 암묵적 "다중 target이면 batch" 설계는 명령 표면에서 제거

**검증 체크리스트:**
- [x] `kn get docs/guide.md` → 파일 내용 + 메타데이터 반환
- [x] `kn get docs/guide.md --section Installation` → 해당 섹션만 추출
- [ ] `kn get batch docs/a.md docs/b.md` → found/notFound batch envelope 반환
- [x] `kn get nonexist.md` → notFound + suggestions 구조

> `kn context`는 커맨드/테이블 모두 철거 (2026-04-24 결정).

---

## Phase 8: RAG ~~응답 (`kn ask`)~~ — 철거

> 외부 RAG 클라이언트가 MCP 경유로 `kn_search` + `kn_get`을 사용해 자체 조립하는 방식으로 전환.
> `kn ask` 커맨드, `LLMProvider`, `llm_cache` 테이블, `modelProfiles`, `kn_ask` MCP 도구 전부 제거 (2026-04-24).

---

## Phase 9: 전처리기 (내부 모듈)

> 커맨드로 노출하지 않고 `src/pipeline/preprocessor.ts`의 런타임 함수로만 유지. vault config 편집으로 바인딩.

### 9.1 프로토콜 런타임
- [x] stdin/stdout JSON 라인 프로토콜 (`PreprocessorRunner`)
- [x] 프로세스 풀 관리 (Subprocess alive 유지)

### 9.2 FTS5 통합
- [x] 토크나이저 전환 (`rebuildFtsWithTokenizer`)
- [ ] 인덱스측 적용: 청크 insert 시 전처리
- [ ] 체이닝: 다수 전처리기 직렬 파이프

> `kn preprocessor` 서브커맨드는 철거 (2026-04-24). 기존 `add/bind/list/remove/install` 로직은 vault.json 수동 편집으로 이관.

---

## Phase 10: MCP 서버 (`kn mcp`)

### 10.1 트랜스포트
- [x] `stdio` (기본): MCP 클라이언트 서브프로세스
- [x] `stdio` 안정화 우선:
  - 외부 LLM agent 연동의 기본 경로
  - stdout 오염 금지, stderr 로깅만 허용
- [ ] `http`: legacy/선택 경로. stdio 안정화 이후 필요성 재평가
- [ ] `sse`: 미구현, 우선순위 낮음

### 10.2 데몬 모드
- [x] `--daemon` + PID 파일 관리 (재귀 fork)
- [x] `kn mcp stop` → PID로 정지
- [ ] 임베딩/리랭커 모델 warm 유지, 5분 idle 시 dispose (미구현)

### 10.3 도구 매핑
- [x] 구현: `kn_search`, `kn_get`, `kn_vault_status`
- [x] `kn_get_batch` (`kn get batch` 대응)
- [ ] P0: `kn_add_note` (rewritten/artifact 저장)
- [ ] P0: `kn_template_get`
- [ ] P0: `kn_report_context`
- [ ] P0: `kn_rewrite_context`
- [ ] legacy/deferred 도구는 active MCP 표면에서 제외:
  - `kn_tag_auto`, `kn_cluster`, `kn_update`

**검증 체크리스트:**
- [x] `kn mcp --transport stdio` → MCP 프로토콜 핸드셰이크 (stdout 오염 수정)
- [x] `kn mcp --transport http` → `/health` 응답
- [x] MCP `kn_search` 도구 호출 → JSON 결과
- [x] 데몬 시작/정지 → PID 파일 생성/제거

---

## Phase 11: 클러스터링 (Legacy / Deferred)

> 현재 목표에서는 제외한다.
> 자동 분류/군집화는 유저별 template/kind 공간이 너무 넓어 일반 기능으로 두기 어렵다.
> 기존 코드는 legacy로 유지하되 active CLI/MCP/typecheck 표면에서 분리한다.

### 11.1 Legacy 상태
- [x] DBSCAN 인라인 구현은 과거 코드로 존재
- [x] active CLI 등록에서 제거
- [x] TypeScript active check 대상에서 제외
- [ ] 필요 시 별도 experimental namespace로 이동

**검증 체크리스트:**
- [ ] 현 단계에서는 신규 검증 없음

---

## Phase 12: 자동 실행 설치 마일스톤

> 방향 결정: active `kn schedule` 명령으로 타이머를 관리하지 않는다.
> 프로그램 설치/초기화 시 OS별 launchctl/systemd timer service를 함께 제공하는 방식으로 둔다.
> 현재 구현된 `kn schedule` 계열은 legacy/deferred로 분류하고, 신규 작업은 설치 산출물 설계로 제한한다.

### 12.1 설치 산출물
- [ ] macOS: `launchctl`용 plist template 제공
- [ ] Linux: `systemd --user` service/timer unit template 제공
- [ ] 설치/업데이트 시 unit 파일 생성 위치와 권한 정책 정의
- [ ] 자동 실행 작업 체인 정의:
  - 기본은 `kn sync`
  - report/template 생성은 외부 agent가 MCP stdio를 통해 수행
  - tag auto/cluster는 포함하지 않음

**검증 체크리스트:**
- [ ] macOS unit install/uninstall dry-run
- [ ] Linux user timer install/uninstall dry-run
- [ ] 재부팅 이후 자동 실행 동작 확인

---

## Phase 13: AI 백엔드 통합 (Provider Integration)

> 현재 Phase 3에서 PlaceholderEmbeddingProvider로 파이프라인 동작을 검증 중.
> 이 Phase에서 실제 임베딩 백엔드를 연결하여 인덱싱/검색을 실운영 가능하게 한다.

### 13.1 임베딩 프로바이더
- [x] **OpenAI 호환 단일 프로바이더**: OpenAI API + OpenAI-호환 로컬 서버(TEI, vLLM, LM Studio, llama-server, ollama `/v1`) 공통
  - `baseUrl`이 localhost면 `isLocal=true`, apiKey 선택

### 13.2 LLM 프로바이더
- [x] `kn ask` 철거와 함께 백엔드 내장 LLM 호출 경로 제거
- [x] 일반 `kn` 명령에서 임베딩 외 LLM 호출 제거
- [ ] LLM 호출이 필요한 기능은 Phase 15.9 `kn llm` namespace에서만 검토

### 13.3 리랭커
- [ ] 현재 미구현 (단일 프로바이더 전환으로 철거)

### 13.4 통합 프로바이더 팩토리
- [x] `src/providers/factory.ts`: vault config 기반 OpenAI 호환 embedding 프로바이더 생성
- [x] `src/providers/openai.ts`: OpenAI 호환 embedding, `fetchWithContainerRetry` 훅
- [x] `src/providers/types.ts`: ContainerSpec 타입
- [x] `src/providers/health.ts`: `kn vault status --check-providers`

### 13.5 로컬 컨테이너 lazy-start
- [x] `src/core/container.ts`: `tryStartContainer` + `waitForReady` + `fetchWithContainerRetry`
- [x] embedding 호출 시 ECONNREFUSED → `podman start <name>` (또는 docker) → 준비 대기 → 1회 재시도
- [x] `VaultConfig.embedding.container` 설정 필드 (`{ name, runtime? }`)

**검증 체크리스트:**
- [ ] OpenAI API 임베딩: `kn add` / `kn search --mode semantic` (API 키 설정 시)
- [ ] TEI 로컬 컨테이너: 정지 상태에서 `kn add` 호출 → 컨테이너 자동 시작 후 임베딩 성공
- [x] `kn vault status --check-providers` → 연결 상태 표시

---

## Phase 14: CJK Optimization

> Derived from analysis of CJK (Korean/Chinese/Japanese) data handling challenges.
> Depends on Phase 9 (preprocessor) and Phase 13 (AI backend).

### 14.1 Chunker CJK awareness
- [x] `Intl.Segmenter` sentence boundary boost
- [x] `detectCJKRatio` > 0.3 → 청크 크기 ~60% 축소 (`codePointAt` 사용, supplementary plane 대응)
- [x] Break-point scoring hierarchy with CJK sentence markers

### 14.2 Embedding model selection for CJK
- [x] `detectCJKLocale` helper 존재
- [ ] `kn vault create`에서 자동 모델 제안 (미구현, 수동 `--model` 필요)

### 14.3 Language detection & metadata
- [x] `notes.language` 컬럼 (ALTER 마이그레이션), `kn add`에서 언어 기록
- [x] `kn search --lang` 필터
- [ ] Language stats in `kn vault status` (미구현)

### 14.4 FTS5 tokenizer enhancement
- [x] Preprocessor 경로로 `Intl.Segmenter` 기반 토크나이저 연동 가능 (Phase 9)
- [ ] `trigram` 자동 fallback (현재 수동 전환)

**Verification checklist:**
- [x] CJK-dominant 청크가 문장경계 보존하며 축소됨
- [x] `kn search "한국어 질의"` + `--lang ko` 필터 동작 (tests/korean.test.ts)
- [ ] `kn vault status`에 language 분포 표시 (미구현)

---

## Phase 15: Template-driven Daily Report

> 목적: `knoter`를 단순 검색 CLI가 아니라 "기존 기록 프로그램을 대체하는 개인 기록/보고 자동화 백엔드"로 확장한다.
> 보고서 본문 작성은 백엔드 내장 LLM이 아니라 외부 LLM agent가 담당하고, `knoter`는 template와 검색/조회 context bundle을 안정적으로 제공한다.

### 15.1 Template 명세
- [x] `docs/template.md` 초안 작성: 일일 보고서 입력/출력 계약, 파싱 규칙, agent prompt skeleton, 백엔드 요구사항
- [x] 3계층 문서 모델 반영:
  - source: 유저가 직접 작성/스크랩한 원본 문서, 이미지, 음성, PDF
  - rewritten source: 외부 LLM agent가 청킹/검색에 유리하게 재작성한 문서
  - final artifact: template와 retrieval 결과로 생성된 일일 보고서/todo/wiki 등 유저 표시 결과물
- [x] vault-local template 경로 확정: `<vault_root>/.kn/template.md`
- [x] bundled fallback template 경로 확정: `docs/template.md`
- [~] template frontmatter 스키마 정의:
  - `id`, `name`, `version`, `kind`, `locale`, `requiredSections`, `variables`
- [x] template validation 1차 구현:
  - readable, non-empty, markdown heading, frontmatter parse/object 검증
  - missing closing frontmatter delimiter 검출
- [ ] template validation 확장:
  - 필수 변수 누락, 중복 section, 미지원 kind 검출

### 15.2 Metadata 확장
- [x] `notes.doc_date` 컬럼 추가: frontmatter `date` / 파일명 날짜 기준으로 결정
- [x] `notes.layer` 컬럼 추가: `source`, `rewritten`, `artifact`
- [x] `notes.kind` 컬럼 추가:
  - 자동 추론/통합 enum 금지
  - 명시 frontmatter 또는 외부 LLM agent가 제공한 raw string만 저장
- [x] source lineage 필드 추가:
  - `source_note_id`, `source_path`, `rewrite_agent`, `rewrite_prompt_hash`, `artifact_template_id`
- [x] 별도 `note_signals` 테이블 추가:
  - task marker, workout metric, daily-note marker, area marker를 구조화 저장
- [x] PageIndex metadata 테이블 추가:
  - `pageindex_documents`, `pageindex_nodes`
- [ ] 기존 `created_at` 기반 날짜 필터를 `doc_date` 우선으로 전환
- [ ] `kn vault status`에 language 분포와 kind 분포 표시

### 15.3 Parser/Extractor
- [ ] source ingest 파이프라인 정의:
  - Markdown/text는 직접 저장
  - 이미지/음성/PDF는 우선 source asset으로 저장하고 OCR/STT/텍스트 추출은 별도 rewrite 단계에서 처리
- [ ] rewritten source 생성 계약 정의:
  - 외부 LLM agent가 원본 evidence id를 보존하며 Markdown으로 재작성
  - heading, timestamp, task marker, workout metric, source reference를 정규화
- [x] `parseNote`에서 `docDate`, `layer` 기본 추론
- [x] `parseNote`에서 `kind` 자동 추론 제거:
  - `kind`/`type` frontmatter가 명시된 경우만 저장
- [ ] Markdown task marker 추출: `- [ ]`, `- [x]`, `TODO:`, `할 일:`
- [ ] 운동 기록 추출:
  - 운동 종류, 세트, 횟수, 시간, 거리, 무게, 강도
- [ ] task/workout/metric 추출 프롬프트 제공:
  - 외부 LLM agent가 rewritten source 생성 시 자율 판단
  - 유저가 명시한 kind 후보가 있으면 후보 중 선택하거나 새 kind 생성 가능
- [ ] 관심 단위(area) 추출:
  - `llm-wiki`, `tasks`, `todo`, `daily-workout-graph`, `knoter`, 기타
- [ ] 추출 결과는 임베딩 텍스트에 직접 섞지 말고 metadata/signal로 저장
  - 이유: 임베딩 품질 오염 없이 필터링/집계/그래프화 가능

### 15.4 Report Context Command
- [x] `src/commands/template.ts` 추가:
  - `kn template list`
  - `kn template get`
  - `kn template validate <path|id>`
- [x] `src/commands/rewrite.ts` 또는 `kn source rewrite-context` 검토:
  - 외부 LLM agent가 source를 rewritten source로 바꾸기 위한 context bundle 제공
- [x] `src/commands/report.ts` 추가:
  - `kn report context --date <YYYY-MM-DD> --layer rewritten --template daily-report`
  - 결과는 JSON envelope로만 충분히 상세하게 반환
- [ ] context bundle 구성:
  - source inventory for target date
  - target date daily notes
  - rewritten source candidates
  - open/done/deferred tasks
  - area-grouped retrieval results
  - workout metrics
  - previous 7 days continuity candidates
  - source paths/chunk ids/scores
- [x] LLM 호출은 하지 않는다.
  - 외부 LLM agent가 `template.md`와 context bundle을 받아 최종 Markdown 보고서를 작성

### 15.5 MCP 확장
- [x] `kn_template_get`: template text + metadata 반환
- [x] `kn_report_context`: date/template 기반 context bundle 반환
- [x] `kn_rewrite_context`: source → rewritten source 변환용 evidence bundle 반환
- [x] `kn_get_batch`: `kn get batch <targets...>` 대응 batch retrieval
- [x] `kn_add_note`: rewritten source 또는 final artifact 저장을 위해 구현
- [x] MCP 도구 응답은 JSON-only를 유지하고 stdout 오염 금지

### 15.6 Search 품질 보완
- [ ] semantic score 방향 수정: zvec distance를 `score = 1 - distance`로 변환
- [ ] `--threshold` deprecated alias 구현 또는 문서에서 완전 제거
- [ ] `search.alpha` 설정값이 실제 hybrid search에 반영되도록 연결
- [x] `--expand` 옵션 제거:
  - LLM 호출/확장 계열은 향후 `kn llm` namespace로 분리
- [ ] CJK keyword 검색은 단기적으로 `trigram`, 중기적으로 index-time preprocessor 적용
- [x] artifact 검색 정책:
  - artifact는 청킹/임베딩/FTS 인덱싱 대상
  - 검색 기본값에서는 제외
  - `--include-artifacts` 옵션으로만 포함
- [x] source 인덱싱 정책:
  - source는 metadata/lineage만 저장
  - 청킹/임베딩/FTS/vector 인덱싱 제외

### 15.6.1 CJK Indexing Direction
- [x] 단기 기본값: SQLite FTS5 `trigram`
  - 장점: Bun/SQLite 내부 기능만으로 한글 substring 검색 가능
  - 단점: 3자 미만 CJK 쿼리 recall 한계
- [ ] 중기 구현: vault-local CJK preprocessor
  - 후보: Lindera/MeCab 계열 형태소 분석기
  - 방식: external process stdin/stdout protocol 유지
  - index-time: rewritten/artifact content → preprocessor → FTS5
  - query-time: query → 같은 preprocessor → FTS5
- [ ] fallback: `Intl.Segmenter('ko'|'ja'|'zh', { granularity: 'word' })`
  - 외부 바이너리 없이 동작하는 보조안
  - 형태소 분석 대체가 아니라 fallback tokenizer로만 사용

### 15.7 Vectorless Retrieval / PageIndex 검토
- [ ] PageIndex adapter 조사 및 PoC:
  - 공식 저장소: https://github.com/VectifyAI/PageIndex
  - 성격: vector DB와 인공 chunking 없이 계층형 tree index + LLM reasoning으로 retrieval
- [ ] `retrieval.backend` 설정 추가 검토:
  - `hybrid`: SQLite FTS5 + zvec dense vector, 기본값
  - `pageindex`: long document/tree reasoning용 optional backend
- [ ] 적용 범위:
  - source: 긴 PDF, 스크랩 문서, OCR/STT 산출물
  - rewritten: heading hierarchy가 명확한 장문 재작성 문서
  - artifact: 기본적으로 검색 대상이지만 PageIndex 우선 대상은 아님
- [ ] trade-off 평가:
  - 장점: 섹션 traceability, 긴 문서 reasoning, embedding 불필요
  - 단점: LLM 호출 비용/지연, Python stack, 일일 짧은 노트에는 과한 구조일 수 있음
- [ ] PoC 완료 전까지 zvec/FTS hybrid를 기본 retrieval backend로 유지

### 15.9 `kn llm` Namespace Plan

> 원칙: 일반 `kn` 명령은 임베딩을 제외하고 LLM을 호출하지 않는다.
> LLM이 필요한 동작은 `kn llm` 아래로 격리해, 비용/네트워크/프라이버시 경계를 명확하게 만든다.
> 다만 rewritten 생성은 항상 외부 LLM agent가 수행하므로, 현재 P0에서는 `kn llm`이 실제 rewriting을 대신 수행하지 않는다.

#### 15.9.1 명령 경계
- [ ] `kn llm`은 기본 설치에서 비활성 또는 experimental로 둔다
- [ ] OpenAI-compatible chat/completions API만 가정한다
- [ ] 일반 `kn add/search/sync/get/template/report/mcp`는 LLM 호출 금지
- [ ] LLM 호출이 필요한 경우에도 입력/출력은 JSON envelope로 고정한다

#### 15.9.2 우선 명령 후보
- [ ] `kn llm prompt rewrite --date <YYYY-MM-DD>`:
  - source inventory, 명시 kind 후보, template 규칙을 바탕으로 외부 agent용 rewrite prompt/context를 생성
  - 직접 LLM 호출은 하지 않고 JSON만 반환하는 형태를 우선 구현
- [ ] `kn llm prompt artifact --template <id> --date <YYYY-MM-DD>`:
  - artifact 작성용 prompt/context bundle 생성
  - `kn report context`와 중복되지 않도록 report context는 데이터, llm prompt는 지시문 조립에 집중
- [ ] `kn llm validate rewritten <path|note-id>`:
  - rewritten 문서가 source reference, heading, task/workout signal contract를 지키는지 검증
  - 가능하면 LLM 없이 rule-based validation 우선
- [ ] `kn llm validate artifact <path|note-id>`:
  - template required sections, source citation, artifact metadata 검증

#### 15.9.3 후순위 명령 후보
- [ ] `kn llm run rewrite`:
  - 사용자가 명시적으로 허용한 경우에만 OpenAI-compatible API로 rewrite 실행
  - 기본 정책과 충돌하므로 P0 제외
- [ ] `kn llm run artifact`:
  - report/todo/wiki artifact 생성 자동 실행
  - 외부 agent 품질과 책임 경계가 안정화된 뒤 검토

#### 15.9.4 구현 시 주의점
- [ ] `kind` 자동 추론 금지:
  - 유저가 명시한 kind 후보를 prompt에 제공할 수는 있음
  - agent는 후보 중 선택하거나 새 raw string을 만들 수 있음
  - `knoter`는 raw string 저장/검증만 수행
- [ ] source는 path reference만 사용:
  - source file을 vault `sources/YYYY-MM-DD/`로 이동/복사 후 경로만 저장
  - chunking/indexing 대상 아님
- [ ] rewritten/artifact만 chunking/indexing 대상
- [ ] artifact는 기본 검색에서 제외하고 `--include-artifacts`로만 포함

### 15.10 Verification
- [ ] fixture daily note 작성:
  - tasks/todo, 분야별 일일노트, 오늘 한 것, 운동 횟수 및 종류 포함
- [ ] source fixture + rewritten fixture + artifact fixture를 분리 작성
- [ ] `kn add fixture` 후 `kn report context --date ... --layer rewritten`가 expected JSON을 반환
- [ ] MCP `kn_report_context`가 같은 payload를 반환
- [ ] 외부 LLM agent prompt dry-run으로 hallucination 방지 확인
- [ ] PageIndex PoC가 hybrid 대비 유리한 문서 유형과 불리한 문서 유형을 명확히 기록

---

## Phase 16: Frontend Preparation (`../knoter-web`) — Out of Current Backend Context

> 백엔드가 대략 완성된 뒤 다른 컨텍스트에서 새로 계획한다.
> 현재 세션/마일스톤에서는 구현하지 않는다.
> 프론트는 React + Electron 기반 CLI wrapper 및 부가기능으로 작성한다는 방향만 기록한다.

### 16.1 User Interview Before Implementation
- [ ] 노트 저장 위치와 파일명 규칙:
  - daily note 파일명, vault 분리 방식, Obsidian/VSCode/Neovim 사용 여부
- [ ] 보고서 UX:
  - 자동 생성 시간, 수동 생성 버튼, 저장 경로, 수정 가능 여부
- [ ] task/todo 모델:
  - Markdown checkbox만 쓸지, 별도 상태/마감일/우선순위 UI가 필요한지
- [ ] 운동 그래프:
  - 추적할 운동 종류, 단위, 그래프 기간, 목표/스트릭 표시 여부
- [ ] LLM agent 연동:
  - Claude Desktop/Codex/커스텀 agent/MCP HTTP 중 우선순위
- [ ] 로컬 모델/컨테이너:
  - Podman/Docker 설치 전제 가능 여부, OpenAI 호환 API fallback 필요 여부
- [ ] 개인정보:
  - 외부 API 전송 금지 데이터, 로컬-only vault, 민감 태그 규칙

### 16.2 Frontend Scope
- [ ] `../knoter-web`에 Electron + React + Vite scaffold
- [ ] CLI wrapper: `kn` 실행, JSON envelope 파싱, 에러 힌트 표시
- [ ] Vault selector/status panel
- [ ] Daily report screen:
  - date picker
  - template selector
  - context preview
  - external agent invocation hook
  - generated Markdown viewer/editor
- [ ] Tasks/Todo panel:
  - open/done/deferred 목록
  - source note jump
- [ ] Workout graph panel:
  - report context의 workout metric JSON 기반 시각화
- [ ] Settings:
  - embedding endpoint, container, template path, privacy policy

---

## Phase 간 의존성 맵

```
Phase 1 (백본)
  └─▶ Phase 2 (vault) ─────────────────────────┐
        └─▶ Phase 3 (add) ──────────────────────┤
              ├─▶ Phase 4 (search)               │
              ├─▶ Phase 5 (sync)                 │
              │     └─▶ Phase 12 (install timer milestone)
              └─▶ Phase 6 (tag)                  │
                    └─▶ Phase 11 (cluster legacy/deferred)
        └─▶ Phase 7 (get) ──────────────────────┤
        └─▶ Phase 8 (ask) 철거                  │
        └─▶ Phase 9 (preprocessor) ◀── Phase 4  │
        └─▶ Phase 10 (mcp stdio) ◀── All JSON commands
        └─▶ Phase 13 (AI 백엔드) ◀── Phase 3,4 ┘
              embedder placeholder → 실제 프로바이더 교체
        └─▶ Phase 14 (CJK 최적화) ◀── Phase 3,9,13
              chunker CJK awareness + language detection + FTS5 tokenizer
        └─▶ Phase 15 (Template Daily Report) ◀── Phase 3,4,7,10,14
              template + report context bundle + MCP tools + kn llm boundary
              └─▶ Phase 16 (Frontend, separate future context)
```

---

## 진행 기록

| 날짜 | Phase | 작업 내용 | 상태 |
|------|-------|----------|------|
| — | — | 계획 수립 | 완료 |
| 2026-04-16 | 1 | 의존성 설치 (ansis, ora, @clack/prompts, consola, gray-matter) | 완료 |
| 2026-04-16 | 1 | src/ 디렉토리 구조, cli.ts 엔트리, 12개 커맨드 스텁 | 완료 |
| 2026-04-16 | 1 | core 모듈: errors.ts, output.ts, logger.ts, config.ts, lock.ts | 완료 |
| 2026-04-16 | 1 | 리뷰 수정: lock.ts releaseLock unlink으로 교체, 서브커맨드 `<action>` 패턴 제거 | 완료 |
| 2026-04-16 | 2 | store 파일 src/stores/ 이전 + barrel index.ts + tests/ 복사 (56 tests pass) | 완료 |
| 2026-04-16 | 2 | vault 5개 서브커맨드 실구현 (create/list/switch/delete/status) | 완료 |
| 2026-04-16 | 2 | 리뷰: import 경로 root→src/stores 수정, E2E 스모크테스트 전체 통과 | 완료 |
| 2026-04-16 | 3 | pipeline 모듈: parser.ts, chunker.ts, hasher.ts, embedder.ts | 완료 |
| 2026-04-16 | 3 | chunker 리뷰 수정: code-fence 순환참조 버그, 윈도우 필터 버그 | 완료 |
| 2026-04-16 | 3 | kn add 커맨드 구현 + global opts 수정 + E2E 스모크테스트 통과 | 완료 |
| 2026-04-16 | 13 | Phase 13 (AI 백엔드 통합) plan 추가 | 완료 |
| 2026-04-16 | 4 | search 모듈: query-builder.ts, fusion.ts, hybrid.ts, search 커맨드 | 완료 |
| 2026-04-16 | 4 | 리뷰 수정: searchFts 이중 빌드, isBm25StrongSignal 타입, zvec open 옵션, async/await finally 버그 | 완료 |
| 2026-04-16 | 5 | kn sync 구현: recovery, file scan, prune, reconciliation | 완료 |
| 2026-04-16 | 6 | kn tag 구현: list/add/remove/auto + vector tag sync | 완료 |
| 2026-04-16 | 7 | kn get 구현: 4단계 경로해석, section 추출, batch 모드 | 완료 |
| 2026-04-16 | 7.2 | kn context 구현: add/list/remove/set-global CRUD | 완료 |
| 2026-04-16 | 14 | Phase 14 (CJK 최적화) plan 추가: Intl.Segmenter, 청크 크기 조정, 언어 감지 | 완료 |
| 2026-04-16 | 8 | kn ask RAG 파이프라인: search→expand→assemble→LLM→cache | 완료 |
| 2026-04-16 | 13 | AI 백엔드: Ollama/OpenAI 프로바이더 + factory + placeholder 교체 | 완료 |
| 2026-04-16 | 13 | 리뷰: apiKey 빈 문자열 검증, 토큰 예산 continue, 캐시키 mutation 수정 | 완료 |
| 2026-04-23 | 13 | providers/types.ts 분리 + Anthropic 프로바이더 + factory explicit provider field + health.ts + vault status --check-providers + ask routing local/cloud/auto | 완료 |
| 2026-04-23 | 14 | chunker CJK 감지 (`detectCJKRatio`/`detectLanguage`) + CJK 비율>0.3 시 청크 크기 ~60%로 축소 + codePointAt 사용 (supplementary plane) | 완료 |
| 2026-04-23 | 9 | preprocessor 구현: `PreprocessorRunner` stdin/stdout JSON 라인 프로토콜, FTS5 tokenizer 전환(`rebuildFtsWithTokenizer`), add/list/bind/remove/install 커맨드 | 완료 |
| 2026-04-23 | 9 | 리뷰 수정: writeQueue rejection poison, stderr 미드레인 데드락, bind rollback, Subprocess 타입 | 완료 |
| 2026-04-23 | 12 | schedule 구현: `src/core/scheduler.ts` systemd user timer + launchd plist, enable/disable/status/run-now, `~/.kn/schedule.json` 상태 | 완료 |
| 2026-04-23 | 12 | 리뷰 수정: POSIX single-quote shell 이스케이핑 (JSON.stringify 인젝션), NaN 날짜 크래시 가드 | 완료 |
| 2026-04-23 | 11 | DBSCAN 인라인 구현 (`src/cluster/dbscan.ts`) + `kn cluster` 커맨드 (--epsilon, --min-cluster, --suggest-merge, --apply) | 완료 |
| 2026-04-23 | 13 | Ollama 리랭커 프로바이더 + factory `createRerankerProvider` + `kn search --rerank` + 15s 타임아웃 + rerank pool ≫ top (recovery 가능) | 완료 |
| 2026-04-23 | 14 | Intl.Segmenter 문장경계 boost, `detectCJKLocale`, `notes.language` 컬럼 (ALTER 마이그레이션), `kn add`에서 언어 기록, `kn search --lang` 필터 | 완료 |
| 2026-04-23 | 10 | MCP serve: stdio/http 트랜스포트, `createMcpServer` factory, kn_search/kn_get/kn_ask/kn_vault_status/kn_context 도구, --daemon, `serve stop` | 완료 |
| 2026-04-23 | 10 | 리뷰 수정: stdio stdout 오염 (logger→stderr), --daemon 재귀 fork, tool 인자 옵셔널 필드 | 완료 |
| 2026-04-23 | — | 프로젝트 구조 정리: 레거시 루트 파일(index.ts, meta-store.ts, vec-store.ts, 중복 테스트) 제거, docs/·dist/ 분리, CLAUDE.md `.km`→`.kn` 교정, tests/ import 경로 갱신 (38 pass) | 완료 |
| 2026-04-23 | — | plan.md 체크박스 실제 구현 상태에 맞춰 동기화 | 완료 |
| 2026-04-23 | 13 | 프로바이더 단일화: Ollama/Anthropic/리랭커 철거, OpenAI 호환만 유지, `src/core/container.ts` 추가 (podman/docker lazy-start, ECONNREFUSED 시 1회 재시도), `--rerank`/`--routing` 제거 | 완료 |
| 2026-04-23 | 10 | `kn serve` → `kn mcp` rename (파일/함수/커맨드명/PID 파일) | 완료 |
| 2026-04-24 | 7/8/9 | 커맨드 축소: `kn ask`/`kn context`/`kn preprocessor` 철거, `kn_ask`/`kn_context` MCP 도구 제거, LLMProvider/llm_cache/contexts/modelProfiles 전부 삭제, preprocessor는 `src/pipeline/preprocessor.ts` 내부 모듈로만 유지 | 완료 |
| 2026-05-08 | 15 | template 중심 재설계: source/rewritten/artifact 3계층, source metadata-only, artifact 기본 검색 제외, raw kind만 저장, PageIndex future milestone | 진행중 |
| 2026-05-08 | 7/10/12/15 | `kn get batch` 명령 표면 확정 및 MCP `kn_get_batch` 구현, schedule은 설치 시 launchctl/systemd timer service 제공 마일스톤으로 정리, `kn llm` namespace 계획 작성 | 진행중 |
| 2026-05-08 | 15 | 하네스 구조로 `kn template get/list/validate` 구현, vault `.kn/template.md` 우선 + `docs/template.md` fallback, malformed frontmatter 검증, Worker/Fast Analyzer/Final Analyzer PASS | 완료 |

---

## 다음 세션 시작 가이드

### 현재 상태 (2026-05-08 기준)

**완료된 Phase**: 1~14의 핵심 검색/인덱싱 파이프라인. Phase 15 template/report는 설계와 일부 DB 기반 작업 진행 중.
**브랜치**: `dev/cli`
**테스트**: 마지막 실행 기준 57 pass / 0 fail
**프로젝트 구조**: `src/` 소스, `tests/` 테스트, `docs/` 설계문서, `dist/` 바이너리 산출물

### 이번 컨텍스트에서 반영된 핵심 결정

- 문서는 3계층으로 관리:
  - `source`: 유저 원본/스크랩/이미지/음성/PDF. vault 내부 `sources/YYYY-MM-DD/`로 복사/이동 후 path만 참조. 청킹/FTS/vector indexing 제외.
  - `rewritten`: 외부 LLM agent가 source를 청킹/검색에 유리하게 재작성한 문서. `knoter`는 저장/검증만 수행. 청킹/FTS/vector indexing 대상.
  - `artifact`: 일일 보고서/todo/wiki 등 최종 결과물. 청킹/FTS/vector indexing 대상이지만 기본 검색에서는 제외하고 `--include-artifacts`일 때만 포함.
- `kind`는 자동 추론하지 않음:
  - frontmatter 또는 외부 agent가 명시한 raw string만 저장.
  - 통합 enum/일반 분류기는 만들지 않음.
- embedding은 OpenAI-compatible API 전제.
- 일반 `kn` 명령은 임베딩 외 LLM 호출 금지.
- LLM 호출 또는 LLM prompt 조립 기능은 향후 `kn llm` namespace로 격리.
- MCP는 `stdio` 안정화를 우선한다.
- `batch get`이 아니라 `kn get batch <targets...>`로 명령 표면을 정리한다.
- `tag auto`는 제거. 자동 태그/타입 분류 없음.
- cluster는 legacy/deferred. active CLI/typecheck/MCP 표면에서 분리.
- schedule은 active CLI 방향이 아니라 설치 시 launchctl/systemd timer service를 제공하는 마일스톤으로 둔다.
- PageIndex는 후속 PoC 마일스톤. 기본 retrieval backend는 zvec + SQLite FTS5 hybrid.
- frontend는 현재 컨텍스트에서 다루지 않음. backend가 대략 완성된 뒤 `../knoter-web`에서 별도 계획.

### Legacy / Deferred Code

- `src/commands/cluster.ts`, `src/cluster/*`: cluster 기능은 현재 목표에서 제외. active CLI 등록에서 제거하고 TypeScript active check 대상에서도 제외.
- `src/commands/schedule.ts`, `src/core/scheduler.ts`: 기존 schedule CLI/OS 연동 구현은 남아 있으나 신규 방향은 설치 산출물 기반 timer service 제공.
- `src/cluster/dbscan.ts`: 현재 worktree에 기존 dirty 변경이 있으며 이번 작업에서는 수정하지 않았음.
- `docs/specification.md`, `docs/캡디llm.md`, `docs/issue.md`: 일부 구형 명세가 `tag auto`, `kn_multi_get`, `kn cluster`, `kn serve` 등을 참조한다. 다음 정리 작업에서 최신 Phase 15 설계와 맞춰 legacy 문서로 분리하거나 갱신해야 한다.

### 잔여 작업 (우선순위 재정렬)

- **P0 `kn report context`**: date/template 기반 JSON context bundle 생성. LLM 호출 없음.
- **P0 `kn template` 확장**: required variables/sections 등 template contract validation 강화.
- **P0 MCP 도구 확장**: `kn_add_note`, `kn_report_context`, `kn_template_get`, `kn_rewrite_context`.
- **P0 source/rewrite/artifact 저장 검증**: source는 metadata-only, rewritten/artifact만 chunk/index/embed.
- **P0 signals 저장**: task/workout/daily/area/metric을 rewritten 단계의 agent 출력으로 받아 `note_signals`에 저장.
- **P0 `kn llm` 계획 구체화**: prompt/validate 중심으로 시작하고, 실제 LLM run은 후순위.
- **P1 검색 점수 정규화**: zvec distance → similarity score 변환, hybrid fusion 재튜닝.
- **P1 CJK FTS5 보완**: 단기 `trigram`, 중기 CJK 형태소 preprocessor, fallback `Intl.Segmenter` 정책 구현.
- **P1 PageIndex PoC**: embedding 없는 vectorless/tree retrieval backend가 긴 문서와 rewritten source에 유효한지 검증.
- **P1 패키지 메타**: `package.json` `name` → `knoter`, `bin.kn` 등록, tsconfig rootDir/outDir 조정.
- **P1 검증 보강**: `--dry-run`, 벡터 실패 rollback, `--tag`/`--after`, 인접 청크 병합 E2E.
- **P2 schedule install milestone**: launchctl/systemd timer service template와 install/uninstall dry-run.
- **P2 컨테이너 `run` 지원**: 현재 `podman start` 전제. `container.image` 설정 시 자동 생성까지 확장.
- **P3 SSE 트랜스포트 + idle dispose**: HTTP/stdio가 우선이므로 후순위.

### 주요 변경 파일

- `docs/template.md`: 일일 보고서 template 초안, 3계층 문서 모델, agent contract 기록.
- `docs/plan.md`: Phase 15/`kn llm`/schedule milestone/current handoff 갱신.
- `src/commands/template.ts`: vault-local single template 조회/list/validation, fallback template 지원.
- `src/stores/meta-store.ts`: `doc_date`, `layer`, raw `kind`, lineage, `note_signals`, PageIndex metadata, artifact 검색 제외 정책.
- `src/pipeline/parser.ts`: `docDate`, `layer`, 명시 `kind`만 파싱.
- `src/commands/add.ts`: source metadata-only 저장, rewritten/artifact만 chunk/index/embed.
- `src/commands/sync.ts`: source metadata-only sync, rewritten/artifact만 chunk/index/embed.
- `src/commands/search.ts`: `--include-artifacts` 추가, LLM expand 제거.
- `src/commands/tag.ts`: `auto` 제거.
- `src/commands/get.ts`: `kn get <target>` + `kn get batch <targets...>` 구조.
- `src/search/hybrid.ts`: artifact 기본 제외.
- `src/stores/vec-store.ts`: vector metadata에 `layer` 저장.
- `tsconfig.json`: cluster legacy 코드 active check 제외.
- `tests/meta-store.test.ts`, `tests/parser.test.ts`: 3계층/kind/artifact/source 정책 검증.
- `tests/command-help.test.ts`: CLI command surface harness (`kn get batch`, legacy schedule, removed cluster/tag auto) 검증.
- `tests/template-command-behavior.test.ts`: `kn template` fallback/vault precedence/metadata/validation behavior harness 검증.

### 알아야 할 핵심 패턴

- **global opts 접근**: `cmd.optsWithGlobals?.()` — `--format`, `--vault`, `--verbose`
- **vault 해석**: `resolveVaultRoot(globalOpts.vault)` → 볼트 루트 경로
- **vault 이름**: config에서 `activeVault` fallback
- **async/finally 주의**: `try { return await fn(); } finally { db.close(); }` — `await` 필수
- **zvec open**: `openVaultCollection(path, {})` — 빈 객체 `{}` 필수 (undefined 불가)
- **searchFts**: 내부에서 `buildFtsQuery` 호출함 — 외부에서 중복 호출 금지
- **프로바이더 팩토리**: `createEmbeddingProvider(vaultConfig)` — OpenAI 호환 embedding endpoint 사용
- **LLM 내장 호출 지양**: `kn ask`는 철거됨. 보고서 생성은 MCP를 쓰는 외부 LLM agent가 담당하고, CLI는 template/context만 제공
- **template/report 방향**: template는 Markdown, context는 JSON, 결과 보고서는 외부 agent가 Markdown으로 생성
- **source 정책**: 원본 파일 content는 검색 인덱스에 넣지 않고 path/lineage만 저장
- **artifact 검색 정책**: 기본 제외, 명시 옵션으로만 포함
- **kind 정책**: 자동 추론 없음, raw string 저장
