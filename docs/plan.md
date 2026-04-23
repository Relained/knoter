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
- [ ] Phase 10에서 MCP SDK 설치 (지연 설치):
  ```bash
  bun add @modelcontextprotocol/sdk
  ```

**채택 라이브러리 및 역할:**

| 패키지 | 용도 | 사용처 |
|--------|------|--------|
| `commander` (기존) | 인자 파싱, 서브커맨드 라우팅 | `src/cli.ts`, 모든 커맨드 |
| `ansis` | 컬러/스타일 터미널 출력 | `src/core/output.ts`, 전체 text 포맷 |
| `ora` | 스피너 (비동기 작업 진행 표시) | `kn add` 임베딩, `kn sync`, `kn cluster` |
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
      cluster.ts      # kn cluster
      get.ts          # kn get
      context.ts      # kn context
      ask.ts          # kn ask
      serve.ts        # kn serve
      schedule.ts     # kn schedule
      preprocessor.ts # kn preprocessor
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
- [ ] CJK 문장 경계 보존: `Intl.Segmenter(locale, { granularity: 'sentence' })` 활용
- [ ] CJK 텍스트 청크 크기 자동 축소 (~40%): 정보 밀도 차이 반영

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
- [ ] 리랭킹/쿼리 확장 (Phase 13 AI 백엔드 통합 시 구현)

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
- [x] `kn tag list/add/remove/auto` 4개 서브커맨드
- [x] 양 레이어 동기화 (syncVectorTags)
- [x] auto: 헤딩 기반 휴리스틱 (Phase 13에서 LLM으로 교체)

**검증 체크리스트:**
- [x] `kn tag list` → 올바른 분포 (docs:2, guide:1, api:1)
- [x] `kn tag add docs/guide.md new-tag` → 추가 확인
- [ ] `kn tag remove`, `kn tag auto` 미검증

---

## Phase 7: 문서 조회 (`kn get`) 및 컨텍스트 (`kn context`)

### 7.1 `kn get`
- [x] 4단계 경로 해석: exact → suffix → substring → ID
- [x] `--section`, `--offset`, `--max-chars` 옵션
- [x] miss 시 유사 경로 제안
- [x] 배치/단일 모드 자동 전환

### 7.2 `kn context`
- [x] context add/list/remove/set-global

**검증 체크리스트:**
- [x] `kn get docs/guide.md` → 파일 내용 + 메타데이터 반환
- [x] `kn get docs/guide.md --section Installation` → 해당 섹션만 추출
- [x] `kn get nonexist.md` → notFound + suggestions 구조
- [x] `kn context add/list/remove/set-global` 구현 완료

---

## Phase 8: RAG 응답 (`kn ask`)

### 8.1 기본 파이프라인
- [ ] `kn search` (hybrid) 결과 기반 컨텍스트 조립
- [ ] 청크 연결 리스트로 context window 확장 (`--context-window`)
- [ ] `kn context` 설명 포함한 컨텍스트 포매팅
  ```
  [Source: {filePath} | Section: {headingPath}]
  {context_description}
  {expanded_content}
  ```

### 8.2 모델 프로필 안전장치
- [ ] config 모델 프로필에서 max context 로드
- [ ] 시스템 프롬프트/템플릿 오버헤드 예산 예약
- [ ] 남은 예산 내에서만 컨텍스트 패킹
- [ ] 오버플로우 시: 최저 점수부터 제거 → 마지막 결과 잘라내기

### 8.3 LLM 캐시
- [ ] 캐시 키: `sha256(model + query + sorted_chunk_ids)`
- [ ] 캐시 히트 시 즉시 반환 (`cached: true`)

### 8.4 옵션
- [ ] `--context-limit`, `--context-window`, `--model`, `--routing`, `--show-sources`, `--raw`

**검증 체크리스트:**
- [ ] `kn ask "What is X?"` → 검색 + LLM 응답 생성
- [ ] `--show-sources` → 소스 경로/청크 ID 포함
- [ ] context window 확장: 인접 청크 포함 확인
- [ ] context budget 초과 시 graceful truncation 확인
- [ ] 동일 쿼리 재실행 → 캐시 히트 확인
- [ ] `--format json` → 구조화된 응답 envelope

---

## Phase 9: 전처리기 (`kn preprocessor`)

### 9.1 프로토콜 런타임
- [ ] stdin/stdout 라인 단위 프로토콜 구현
- [ ] 프로세스 풀 관리 (alive 유지, 라인 간 재생성 없음)

### 9.2 커맨드 구현
- [ ] `kn preprocessor install <language>` (ko/ja/zh)
- [ ] `kn preprocessor add <alias> <command>` — 커스텀 등록
- [ ] `kn preprocessor bind <alias> [vault]` — 볼트 바인딩 + FTS5 재인덱스
- [ ] `kn preprocessor list` — 목록 표시
- [ ] `kn preprocessor remove <alias> [--delete]`

### 9.3 FTS5 통합
- [ ] 바인딩 시 FTS5 토크나이저 `trigram` → `unicode61` 전환
- [ ] 인덱스/쿼리 양쪽 전처리기 통과
- [ ] 체이닝: 다수 전처리기 직렬 파이프

**검증 체크리스트:**
- [ ] `kn preprocessor add echo "cat"` → 등록 확인
- [ ] `kn preprocessor bind echo` → FTS5 재인덱스 트리거
- [ ] 전처리기 바인딩 후 `kn add korean.md` → 형태소 분석된 FTS 인덱스
- [ ] `kn search "한국어쿼리"` → 전처리기 통과 후 검색
- [ ] 전처리기 제거 → FTS5 재인덱스

---

## Phase 10: MCP 서버 (`kn serve`)

### 10.1 트랜스포트
- [ ] `stdio` (기본): MCP 클라이언트 서브프로세스
- [ ] `sse`: Server-Sent Events
- [ ] `http`: `POST /mcp` + `GET /health`

### 10.2 데몬 모드
- [ ] `--daemon` + PID 파일 관리
- [ ] `kn serve stop` → PID로 정지
- [ ] 임베딩/리랭커 모델 warm 유지, 5분 idle 시 dispose

### 10.3 도구 매핑
- [ ] `kn_search`, `kn_add_note`, `kn_vault_status`, `kn_cluster`, `kn_tag_auto`, `kn_ask`, `kn_get`, `kn_multi_get`, `kn_context`, `kn_update`

**검증 체크리스트:**
- [ ] `kn serve --transport stdio` → MCP 프로토콜 핸드셰이크
- [ ] `kn serve --transport http --port 3000` → `/health` 200 응답
- [ ] MCP `kn_search` 도구 호출 → JSON 결과
- [ ] 데몬 시작/정지 → PID 파일 생성/제거

---

## Phase 11: 클러스터링 (`kn cluster`)

### 11.1 구현
- [ ] HDBSCAN 기본 알고리즘
- [ ] dense vector + metadata 입력
- [ ] `--min-cluster`, `--tag`, `--suggest-merge`, `--apply` 옵션

### 11.2 성능
- [ ] 워커 스레드 오프로딩 (메인 CLI 스레드 비차단)
- [ ] 선택적 Bun FFI 네이티브 경로

**검증 체크리스트:**
- [ ] `kn cluster` → 클러스터 그룹 출력
- [ ] `--suggest-merge` → 병합 제안 포함
- [ ] `--apply` → 태그/메타데이터 업데이트 확인
- [ ] 대용량 데이터셋에서 메인 스레드 블로킹 없음 확인

---

## Phase 12: 스케줄러 (`kn schedule`)

### 12.1 커맨드
- [ ] `kn schedule enable [--interval]` — OS 스케줄러 등록
- [ ] `kn schedule disable` — 등록 해제
- [ ] `kn schedule status` — 상태 조회
- [ ] `kn schedule run-now` — 즉시 실행

### 12.2 OS 연동
- [ ] macOS: launchd plist 생성/등록
- [ ] Linux: cron/systemd timer
- [ ] 작업 체인: `kn sync --prune` → `kn tag auto` → `kn cluster --suggest-merge`

**검증 체크리스트:**
- [ ] `kn schedule enable --interval 1h` → launchd/cron 등록 확인
- [ ] `kn schedule status` → 등록 상태 + 마지막 실행 정보
- [ ] `kn schedule run-now` → 작업 체인 즉시 실행
- [ ] `kn schedule disable` → 스케줄러 항목 제거 확인

---

## Phase 13: AI 백엔드 통합 (Provider Integration)

> 현재 Phase 3에서 PlaceholderEmbeddingProvider로 파이프라인 동작을 검증 중.
> 이 Phase에서 실제 AI 백엔드를 연결하여 임베딩/LLM/리랭킹을 실운영 가능하게 한다.

### 13.1 임베딩 프로바이더
- [x] **OpenAI API**: `text-embedding-3-small`, `text-embedding-3-large`
  - `baseUrl` + `apiKey` 기반, `EmbeddingProvider` 인터페이스 구현
- [x] **Ollama (로컬)**: `nomic-embed-text`, `bge-m3` 등
  - `http://localhost:11434/api/embed` 호출, `isLocal: true`
- [ ] **Anthropic (향후)**: 임베딩 API 제공 시 추가
- [ ] **HuggingFace Inference API**: sentence-transformers 모델군

### 13.2 LLM 프로바이더 (`kn ask` 용)
- [x] **OpenAI API**: `gpt-4o`, `gpt-4o-mini` 등
  - Chat Completions API
- [ ] **Anthropic Claude API**: `claude-sonnet-4-20250514` 등
  - Messages API, `@anthropic-ai/sdk` 활용
- [x] **Ollama (로컬)**: `llama3`, `qwen3` 등
  - `http://localhost:11434/api/chat`
- [x] **OpenAI-호환 API**: LM Studio, vLLM, Together AI 등
  - OpenAI SDK로 `baseUrl`만 교체하여 연결

### 13.3 리랭커 프로바이더 (`--rerank` 용)
- [ ] **Ollama 로컬 리랭커**: Qwen3-Reranker 0.6B 등
- [ ] **Cohere Rerank API**
- [ ] **Jina Reranker API**

### 13.4 통합 프로바이더 팩토리
- [x] `src/providers/factory.ts`: vault config 기반 프로바이더 자동 생성
  - config의 `embedding.baseUrl` / `llm.baseUrl` 패턴으로 프로바이더 타입 자동 감지
  - 예: `localhost:11434` → Ollama, `api.openai.com` → OpenAI
- [x] `src/providers/openai.ts`: OpenAI 호환 프로바이더 (embedding + LLM)
- [x] `src/providers/ollama.ts`: Ollama 프로바이더 (embedding + LLM)
- [ ] `src/providers/anthropic.ts`: Claude 프로바이더 (LLM)
- [ ] 프로바이더 헬스체크: `kn vault status`에 프로바이더 연결 상태 포함

### 13.5 라우팅 (`kn ask --routing auto|local|cloud`)
- [ ] `auto`: 로컬 프로바이더 우선 시도 → 실패 시 클라우드 폴백
- [ ] `local`: 로컬 프로바이더만 사용 (Ollama 등)
- [ ] `cloud`: 클라우드 API만 사용 (OpenAI/Anthropic 등)

**검증 체크리스트:**
- [ ] Ollama 로컬 임베딩: `kn add test.md` → 실제 벡터 생성 확인
- [ ] OpenAI 임베딩: API 키 설정 후 `kn add` → 벡터 생성 확인
- [ ] `kn ask "질문"` → Ollama/OpenAI/Claude 각각 응답 생성
- [ ] 프로바이더 미설정 시 명확한 에러 메시지
- [ ] 폴백 동작: 로컬 실패 → 클라우드 자동 전환
- [ ] `kn vault status` → 프로바이더 연결 상태 표시

---

## Phase 14: CJK Optimization

> Derived from analysis of CJK (Korean/Chinese/Japanese) data handling challenges.
> Depends on Phase 9 (preprocessor) and Phase 13 (AI backend).

### 14.1 Chunker CJK awareness
- [ ] Integrate `Intl.Segmenter` for sentence boundary detection (Bun/V8 built-in, no external deps)
- [ ] Auto-detect CJK-dominant content and reduce target chunk size (~300 chars vs 500 for Latin)
- [ ] Recursive character splitting hierarchy: `['\n\n', '\n', '。', '？', '！', '.', '?', '!', ' ', '']`

### 14.2 Embedding model selection for CJK
- [ ] Prioritize BGE-M3 (1024d) for CJK vaults — best multilingual/multi-grained performance
- [ ] Multilingual-E5 as alternative — "query:"/"passage:" prefix convention fits RAG well
- [ ] Auto-suggest model at `kn vault create` based on detected locale or `--locale` option

### 14.3 Language detection & metadata
- [ ] Per-note `language` field in notes table (auto-detected via `Intl.Segmenter` or heuristic)
- [ ] Language-aware search filter: `--lang ko` to narrow results
- [ ] Language stats in `kn vault status` output

### 14.4 FTS5 tokenizer enhancement
- [ ] `Intl.Segmenter('ko', { granularity: 'word' })` as tokenizer preprocessor (Phase 9 integration)
- [ ] Consider `trigram` tokenizer as CJK fallback when no preprocessor is bound

**Verification checklist:**
- [ ] CJK-dominant markdown chunked at ~300 char target with sentence boundaries preserved
- [ ] `kn add korean.md` with BGE-M3 produces meaningful vectors
- [ ] `kn search "한국어 질의"` returns relevant results via both keyword and semantic channels
- [ ] `kn vault status` shows language distribution

---

## Phase 간 의존성 맵

```
Phase 1 (백본)
  └─▶ Phase 2 (vault) ─────────────────────────┐
        └─▶ Phase 3 (add) ──────────────────────┤
              ├─▶ Phase 4 (search)               │
              ├─▶ Phase 5 (sync)                 │
              │     └─▶ Phase 12 (schedule)      │
              └─▶ Phase 6 (tag)                  │
                    └─▶ Phase 11 (cluster)       │
        └─▶ Phase 7 (get/context) ──────────────┤
              └─▶ Phase 8 (ask) ◀── Phase 4     │
        └─▶ Phase 9 (preprocessor) ◀── Phase 4  │
        └─▶ Phase 10 (serve) ◀── All commands ──┤
        └─▶ Phase 13 (AI 백엔드) ◀── Phase 3,8 ┘
              embedder placeholder → 실제 프로바이더 교체
              ask placeholder → 실제 LLM 연결
        └─▶ Phase 14 (CJK 최적화) ◀── Phase 3,9,13
              chunker CJK awareness + language detection + FTS5 tokenizer
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

---

## 다음 세션 시작 가이드

### 현재 상태 (2026-04-16 기준)

**완료된 Phase**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (전체 파이프라인 동작)
**브랜치**: `dev/cli`
**테스트**: 56 pass / 0 fail

### 구현 완료 파일 (31개+ .ts)

```
src/
  cli.ts                    # 엔트리포인트 (commander, 12개 서브커맨드)
  core/
    config.ts               # 글로벌/볼트 2계층 설정
    errors.ts               # KnError + ErrorCode enum
    lock.ts                 # 볼트 파일 락 (PID+timestamp)
    logger.ts               # consola 래퍼 + verbose 토글
    output.ts               # success/error envelope + text/json/jsonl
  stores/
    meta-store.ts           # SQLite 메타데이터 (루트에서 복사)
    vec-store.ts            # zvec 벡터 저장소 (루트에서 복사)
    index.ts                # barrel 재익스포트
  pipeline/
    parser.ts               # gray-matter 프론트매터 추출
    chunker.ts              # break-point scoring 스마트 청킹
    hasher.ts               # Bun.CryptoHasher SHA-256
    embedder.ts             # provider 추상화 + retry/fallback
  search/
    query-builder.ts        # tagFilter/dateFilter/combineFilters
    fusion.ts               # linearFusion, strong-signal, 인접청크병합
    hybrid.ts               # semantic/keyword/hybrid 오케스트레이터
  providers/
    ollama.ts               # ✅ Ollama embedding + LLM (LLMProvider 인터페이스 정의)
    openai.ts               # ✅ OpenAI 호환 embedding + LLM
    factory.ts              # ✅ vault config 기반 프로바이더 자동 생성
  commands/
    vault.ts                # ✅ 실구현 (create/list/switch/delete/status)
    add.ts                  # ✅ 실구현 (전체 인제스천 파이프라인)
    search.ts               # ✅ 실구현 (3모드 하이브리드)
    sync.ts                 # ✅ 실구현 (recovery/prune/reconciliation)
    tag.ts                  # ✅ 실구현 (list/add/remove/auto)
    get.ts                  # ✅ 실구현 (4단계 경로해석)
    context.ts              # ✅ 실구현 (add/list/remove/set-global)
    ask.ts                  # ✅ 실구현 (RAG 파이프라인 + LLM 캐시)
    serve.ts                # 🔲 스텁만 존재
    cluster.ts              # 🔲 스텁만 존재
    schedule.ts             # 🔲 스텁만 존재
    preprocessor.ts         # 🔲 스텁만 존재
```

### 잔여 작업 (후순위)

- **Phase 10 MCP 도구 확장**: `kn_add_note`, `kn_multi_get`, `kn_tag_auto`, `kn_cluster`, `kn_update` — 현재 등록되었지만 "not implemented" 반환. 필요 시 실제 파이프라인 연결.
- **Phase 13 리랭커 확장**: Cohere/Jina API 지원 (드문 셋업, 필요 시).
- **Phase 13 라우팅 폴백**: `--routing auto` 시 로컬 실패 → 클라우드 자동 전환 (현재는 검증만).
- **Phase 9 preprocessor 프리셋**: `install <language>` 실제 번들 (한국어 mecab 등).
- **Phase 9 인덱스측 preprocessor**: 청크 insert 시 FTS5 전처리 적용.
- **Phase 11 HDBSCAN 업그레이드**: 현재 DBSCAN, 필요 시 계층적 HDBSCAN으로 교체.

### 알아야 할 핵심 패턴

- **global opts 접근**: `cmd.optsWithGlobals?.()` — `--format`, `--vault`, `--verbose`
- **vault 해석**: `resolveVaultRoot(globalOpts.vault)` → 볼트 루트 경로
- **vault 이름**: config에서 `activeVault` fallback
- **async/finally 주의**: `try { return await fn(); } finally { db.close(); }` — `await` 필수
- **zvec open**: `openVaultCollection(path, {})` — 빈 객체 `{}` 필수 (undefined 불가)
- **searchFts**: 내부에서 `buildFtsQuery` 호출함 — 외부에서 중복 호출 금지
- **프로바이더 팩토리**: `createEmbeddingProvider(vaultConfig)`, `createLLMProvider(vaultConfig)` — vault config의 baseUrl로 Ollama/OpenAI 자동 감지
- **LLMProvider 인터페이스**: `src/providers/ollama.ts`에 정의, `generate(systemPrompt, userPrompt): Promise<string>`
- **Sonnet 리뷰 미반영 항목**: LLMProvider를 providers/types.ts로 분리, factory에 explicit provider 필드 추가, options any 타입 정리
- **루트 파일 정리**: `meta-store.ts`, `vec-store.ts`, `*.test.ts`가 루트에 아직 남아있음 (src/stores/에 복사본 존재). 테스트가 루트 경로에 의존하므로 보존 중
