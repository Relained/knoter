# KN CLI 이슈 트래커

> 구현 과정에서 발견된 버그, 기술부채, 개선 필요사항 정리.
> 상태: `OPEN` / `FIXED` / `DEFERRED`

---

## 버그 (발견 → 수정 완료)

### BUG-001: lock.ts releaseLock 빈 파일 쓰기 [FIXED]
- **Phase**: 1
- **파일**: `src/core/lock.ts`
- **증상**: `releaseLock`가 `Bun.write(lockPath, "")` 사용 → 빈 파일이 남음 → 다음 `acquireLock`에서 `JSON.parse("")` 실패
- **수정**: `unlinkSync(lockPath)`로 파일 삭제

### BUG-002: commander 서브커맨드 `<action>` 충돌 [FIXED]
- **Phase**: 1
- **파일**: vault.ts, tag.ts, context.ts, schedule.ts, preprocessor.ts
- **증상**: `.command("vault <action>")`에서 `<action>` 필수 인자가 하위 서브커맨드와 충돌
- **수정**: `.command("vault")`로 변경 (5개 파일)

### BUG-003: chunker code-fence 필터 순환참조 [FIXED]
- **Phase**: 3
- **파일**: `src/pipeline/chunker.ts`
- **증상**: `breakPoints.filter(bp => !isInsideCodeFence(..., breakPoints))` — 필터링 중인 배열을 참조로 전달
- **수정**: 필터 전 원본 `allBreakPoints` 보존, 필터에 원본 전달

### BUG-004: chunker 윈도우 후보 필터 범위 [FIXED]
- **Phase**: 3
- **파일**: `src/pipeline/chunker.ts`
- **증상**: 현재 청크 시작 위치보다 앞에 있는 break point도 후보에 포함됨
- **수정**: `bp.position > position` 조건 추가

### BUG-005: add 커맨드 global opts 섀도잉 [FIXED]
- **Phase**: 3
- **파일**: `src/commands/add.ts`
- **증상**: 로컬 `--format`, `--vault` 옵션이 글로벌 옵션을 섀도잉 → `--format json` 무시됨
- **수정**: 로컬 옵션 제거, `cmd.optsWithGlobals?.()` 사용

### BUG-006: searchFts 이중 FTS5 빌드 [FIXED]
- **Phase**: 4
- **파일**: `src/search/hybrid.ts`
- **증상**: `buildFtsQuery(query)` 호출 후 결과를 `searchFts()`에 전달 → `searchFts` 내부에서 다시 `buildFtsQuery` 호출 → 이중 이스케이프
- **수정**: raw query 직접 전달

### BUG-007: isBm25StrongSignal 타입 불일치 [FIXED]
- **Phase**: 4
- **파일**: `src/search/hybrid.ts`
- **증상**: `isBm25StrongSignal(results)` — `FtsResult[]` 전달했으나 `number[]` 기대
- **수정**: `.map(r => r.score)` 추가

### BUG-008: zvec openVaultCollection 필수 옵션 [FIXED]
- **Phase**: 4
- **파일**: `src/search/hybrid.ts`
- **증상**: `openVaultCollection(path)` — options 인자 없으면 zvec에서 `"must be a CollectionOptions object"` 에러
- **수정**: `openVaultCollection(path, {})` 빈 객체 전달

### BUG-009: async/await finally DB 조기 close [FIXED]
- **Phase**: 4
- **파일**: `src/search/hybrid.ts`
- **증상**: `try { return hybridSearch(...) } finally { metaDb.close() }` — `await` 없이 Promise 반환 → `finally`가 즉시 실행 → DB 사용 중 close
- **수정**: `return await hybridSearch(...)` — 모든 async 분기에 `await` 추가
- **위험도**: 높음. 같은 패턴이 다른 커맨드에도 있을 수 있음 → 전수 검사 필요

---

## 기술부채 (OPEN)

### DEBT-001: PlaceholderEmbeddingProvider 중복 정의
- **파일**: `src/commands/add.ts`, `src/commands/sync.ts`, `src/search/hybrid.ts`
- **내용**: 동일한 placeholder 클래스가 3곳에 정의됨
- **해결**: Phase 13에서 `src/providers/` 통합 시 제거

### DEBT-002: 루트 레벨 파일 미정리
- **파일**: `meta-store.ts`, `vec-store.ts`, `meta-store.test.ts`, `vec-store.test.ts` (루트)
- **내용**: `src/stores/`에 복사본 존재하나 루트 원본도 남아있음. 기존 테스트가 루트 경로 의존.
- **해결**: 테스트 import를 `src/stores/`로 변경 후 루트 파일 삭제

### DEBT-003: package.json name/bin 미업데이트
- **내용**: `name`이 아직 `"nlpr"`, `bin` 필드 없음
- **해결**: `name: "knoter"`, `bin: { "kn": "src/cli.ts" }` 추가

### DEBT-004: ora 스피너 stdout 오염
- **증상**: `--format json` 사용 시 ora 스피너 출력이 JSON과 혼재
- **해결**: JSON 모드에서 ora 비활성화하거나 stderr로 리다이렉트

### DEBT-005: kn tag auto 휴리스틱 품질
- **내용**: 현재 헤딩 단어 추출 기반의 단순 로직. 실사용 가치 낮음.
- **해결**: Phase 13에서 LLM 기반 자동 태깅으로 교체

### DEBT-006: async/await finally 패턴 전수 검사
- **관련**: BUG-009
- **내용**: `try { return fn() } finally { cleanup() }` 패턴에서 `await` 누락 가능성 있는 모든 파일 점검 필요
- **대상 파일**: sync.ts, tag.ts, get.ts 등 MetaDB를 try/finally로 관리하는 모든 커맨드

---

## 개선 필요 (DEFERRED)

### IMP-001: 커맨드별 유닛테스트 부재
- **내용**: pipeline 모듈(parser, chunker, embedder, hasher)과 search 모듈(fusion, query-builder)에 유닛테스트 없음
- **우선순위**: 중간. E2E 스모크테스트로 기본 동작은 검증됨.

### IMP-002: --threshold deprecated alias 미구현
- **Phase**: 4
- **내용**: `--threshold`를 `--hybrid-min` alias로 처리하고 deprecation 경고 출력

### IMP-003: kn context 서브커맨드 미구현
- **Phase**: 7
- **내용**: contexts 테이블은 MetaDB에 존재. CRUD + 검색결과 통합만 필요.

### IMP-004: AST-aware 청킹 미구현
- **Phase**: 3
- **내용**: `--chunk-strategy auto`로 tree-sitter 기반 코드 파일 청킹. 마크다운 외 파일 지원 시 필요.
