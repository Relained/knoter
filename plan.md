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
- [ ] 사용자 입력 → 안전한 FTS5 쿼리 변환
  - bare term → `"term"*` (prefix match)
  - quoted phrase → `"exact phrase"` (그대로)
  - `-bad` → `NOT "bad"`
  - 양성 term AND 결합
  - 내부 따옴표 이스케이프 (doubling)
- [ ] 전처리기 바인딩 시 쿼리도 전처리기 통과

### 4.2 스코어 정규화 및 퓨전 (`src/search/fusion.ts`)
- [ ] BM25 정규화: `normalized = pos / (1 + pos)` (pos = -raw_score)
- [ ] 선형 퓨전: `final = alpha * vec_score + (1 - alpha) * bm25_norm`
- [ ] 기본 alpha = 0.80 (설정/플래그로 조정 가능)

### 4.3 하이브리드 검색 (`src/search/hybrid.ts`)
- [ ] `semantic` 모드: zvec dense retrieval만
- [ ] `keyword` 모드: FTS5 + scalar 필터만
- [ ] `hybrid` 모드 (기본값):
  1. FTS5 keyword 검색 + scalar 조건
  2. zvec dense 검색 + metadata pre-filter
  3. BM25 정규화
  4. 선형 퓨전
- [ ] Strong-signal shortcut 구현
  - 퓨전 후: `top * (top - second) >= 0.06` AND `top >= 0.40`
  - BM25-only tier-0: `top_bm25 >= 0.75` AND `gap >= 0.10`

### 4.4 필터 및 점수 처리
- [ ] `tagFilter`, `dateFilter`, `combineFilters` 조합
- [ ] `--semantic-min`, `--keyword-min`, `--hybrid-min` 적용
- [ ] `--threshold`는 `--hybrid-min` deprecated alias

### 4.5 후처리
- [ ] 인접 청크 병합: noteId별 그룹 → seq_index 정렬 → 연속 청크 합치기
  - 병합 결과: 최고 점수 유지, 내용 순서대로 연결

### 4.6 선택적 LLM 향상
- [ ] 리랭킹 (`--rerank`): cross-encoder 리랭킹, 스코어 블렌딩, 캐싱
- [ ] 쿼리 확장 (`--expand`): lex/vec/hyde 서브쿼리, RRF 퓨전, 캐싱
  - 확장은 리랭커 사용 가능 시에만 활성화

**검증 체크리스트:**
- [ ] query-builder.ts 유닛테스트: 일반 텀, 따옴표 구, 부정, 특수문자 이스케이프, injection 시도
- [ ] fusion.ts 유닛테스트: BM25 정규화 값 범위 [0,1], 퓨전 가중치 적용
- [ ] `kn search "test query" --mode semantic` → zvec 결과만
- [ ] `kn search "test query" --mode keyword` → FTS5 결과만
- [ ] `kn search "test query"` (hybrid) → 양 채널 퓨전 결과
- [ ] `kn search "test" --tag linux --after 2024-01-01` → 필터 적용 확인
- [ ] `--semantic-min 0.5` 적용 시 저점수 결과 제외 확인
- [ ] 동일 노트의 인접 청크가 병합되어 반환되는지 확인
- [ ] strong-signal shortcut: 높은 확신 결과에서 LLM 단계 스킵 확인

---

## Phase 5: 동기화 및 복구 (`kn sync`)

### 5.1 기본 동기화
- [ ] 파일시스템 스캔 → SHA-256 해시 비교 → 변경분만 처리
- [ ] 신규/변경 파일 → `kn add` 파이프라인 통과
- [ ] 삭제 파일 → note/chunk/tag 메타데이터 + 벡터 제거

### 5.2 옵션 모드
- [ ] `--full`: 해시 무시, 전체 재구축
- [ ] `--prune`: 소스 파일 없는 엔트리만 제거
- [ ] `--changed`: 변경 파일만 1회성 처리

### 5.3 복구 (Recovery)
- [ ] 시작 시 `vector_sync_status = 'pending'` 엔트리 스캔
- [ ] 멱등 벡터 upsert로 중단된 작업 재개 → `synced` 전환

### 5.4 정합성 검증 (Reconciliation)
- [ ] metadata chunk ID vs zvec document ID 비교
- [ ] 한쪽만 있는 레코드: 정책에 따라 수리/정리
- [ ] normal sync와 `--full` 양쪽에서 실행

**검증 체크리스트:**
- [ ] 파일 추가 → `kn sync` → 새 노트 인덱싱 확인
- [ ] 파일 수정 → `kn sync` → 변경분만 재인덱싱 (해시 비교)
- [ ] 파일 삭제 → `kn sync --prune` → 해당 엔트리 제거 확인
- [ ] `kn sync --full` → 전체 재구축 (모든 파일 재처리)
- [ ] pending 상태 인위 생성 → `kn sync` → pending 복구 확인
- [ ] metadata-only 레코드 인위 생성 → reconciliation 수리 확인
- [ ] vector-only 레코드 인위 생성 → reconciliation 정리 확인
- [ ] 볼트 락 동시 접근 시 적절한 실패

---

## Phase 6: 태그 관리 (`kn tag`)

### 6.1 구현
- [ ] `kn tag list` — 태그 분포 표시
- [ ] `kn tag add <file|glob> <tag>...` — 수동 태그 추가
- [ ] `kn tag remove <file|glob> <tag>...` — 태그 제거
- [ ] `kn tag auto [--dry-run]` — 자동 태그 제안/적용

### 6.2 양 레이어 동기화
- [ ] tag 변경 시 metadata + zvec `tags` 필드 동기화

**검증 체크리스트:**
- [ ] `kn tag add note.md dev` → metadata + zvec 양쪽 태그 확인
- [ ] `kn tag remove note.md dev` → 양쪽 제거 확인
- [ ] `kn tag list` → 올바른 분포 표시
- [ ] `kn tag auto --dry-run` → DB 변경 없이 제안만
- [ ] tag 변경 후 `kn search --tag dev` → 필터 결과 반영 확인

---

## Phase 7: 문서 조회 (`kn get`) 및 컨텍스트 (`kn context`)

### 7.1 `kn get`
- [ ] 경로 해석 순서: 정확 일치 → suffix match → substring match
- [ ] `--section`, `--offset`, `--max-chars`, `--json` 옵션
- [ ] miss 시 유사 경로 제안 (fuzzy matching)
- [ ] 배치 조회: `kn get <id1> <id2> ...` → `{ found, not_found }`

### 7.2 `kn context`
- [ ] `kn context add <path> <description>` — 경로별 컨텍스트 설명 등록
- [ ] `kn context list` — 등록된 컨텍스트 목록
- [ ] `kn context remove <path>` — 제거
- [ ] `kn context set-global <description>` — 볼트 전역 컨텍스트
- [ ] 검색 결과에 context description 포함

**검증 체크리스트:**
- [ ] `kn get docs/api.md` → 파일 내용 반환
- [ ] `kn get api.md` (suffix match) → 정상 해석
- [ ] `kn get nonexist.md` → 유사 경로 제안
- [ ] `kn get id1 id2 --json` → found/not_found 구조
- [ ] `kn context add docs/ "API documentation"` → contexts 테이블 저장
- [ ] `kn search "api"` 결과에 context description 포함 확인

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
- [ ] **OpenAI API**: `text-embedding-3-small`, `text-embedding-3-large`
  - `baseUrl` + `apiKey` 기반, `EmbeddingProvider` 인터페이스 구현
- [ ] **Ollama (로컬)**: `nomic-embed-text`, `bge-m3` 등
  - `http://localhost:11434/api/embeddings` 호출, `isLocal: true`
- [ ] **Anthropic (향후)**: 임베딩 API 제공 시 추가
- [ ] **HuggingFace Inference API**: sentence-transformers 모델군

### 13.2 LLM 프로바이더 (`kn ask` 용)
- [ ] **OpenAI API**: `gpt-4o`, `gpt-4o-mini` 등
  - Chat Completions API, 스트리밍 응답 지원
- [ ] **Anthropic Claude API**: `claude-sonnet-4-20250514` 등
  - Messages API, `@anthropic-ai/sdk` 활용
- [ ] **Ollama (로컬)**: `llama3`, `qwen3` 등
  - `http://localhost:11434/api/chat`
- [ ] **OpenAI-호환 API**: LM Studio, vLLM, Together AI 등
  - OpenAI SDK로 `baseUrl`만 교체하여 연결

### 13.3 리랭커 프로바이더 (`--rerank` 용)
- [ ] **Ollama 로컬 리랭커**: Qwen3-Reranker 0.6B 등
- [ ] **Cohere Rerank API**
- [ ] **Jina Reranker API**

### 13.4 통합 프로바이더 팩토리
- [ ] `src/providers/factory.ts`: vault config 기반 프로바이더 자동 생성
  - config의 `embedding.baseUrl` / `llm.baseUrl` 패턴으로 프로바이더 타입 자동 감지
  - 예: `localhost:11434` → Ollama, `api.openai.com` → OpenAI
- [ ] `src/providers/openai.ts`: OpenAI 호환 프로바이더 (embedding + LLM)
- [ ] `src/providers/ollama.ts`: Ollama 프로바이더 (embedding + LLM + reranker)
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
