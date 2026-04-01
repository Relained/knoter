## 프로젝트 기획안: LLM 에이전트 기반 CLI 지식 관리 시스템

### 1. 프로젝트 비전 및 목표

- **목표:** 파편화된 개인의 노트를 LLM 에이전트와 벡터 기술을 활용해 자동 정리하고 연결해 주는 **개발자 및 파워유저 친화적인 지식 관리 오케스트레이션 도구**.
    
- **핵심 가치:** 특정 에디터에 종속되지 않는 자유도, 로컬/클라우드 모델의 유연한 활용, 에이전트가 직접 지식을 다룰 수 있는 환경(MCP) 제공. 자동화 - 능동적인 정보 산출 
    

### 2. 핵심 아키텍처 및 구성 요소

- **인터페이스:** CLI (Command Line Interface) 중심. (전용 프론트엔드와는 API 등으로 느슨하게 결합하여 기존 에디터 사용 보장)
    
- **검색 엔진:** 하이브리드 검색 (Vector DB 기반 Semantic Search + 전통적 키워드 검색 결합)
    
- **데이터베이스:** 로컬 및 클라우드를 모두 지원하는 Vector DB 구축
    
- **에이전트 통신:** MCP (Model Context Protocol)를 적용하여 외부 LLM 에이전트가 CLI 도구를 자신의 도구(Tool)처럼 활용할 수 있도록 지원.
    

### 3. 주요 기능 명세

- **독립적인 볼트(Vault) 관리:** '개인 Vault', '프로젝트 1 Vault' 등 주제와 목적에 따라 데이터베이스를 물리적/논리적으로 분리하여 관리.
    
- **데이터 파이프라인 자동화:** 사용자가 작성한 원본 노트를 자동으로 파싱(Parsing) ➡️ 임베딩(Embedding) ➡️ Vector DB에 통합.
    
- **AI 기반 자동 정리 (Clustering):** 벡터 유사도를 기반으로 파편화된 개인 노트 중 비슷한 내용을 묶어서 보기 편하게 자동 분류 및 병합 제안.
    
- **LLM 친화적 입출력:** 터미널 출력뿐만 아니라, LLM 에이전트가 즉시 컨텍스트로 읽고 처리하기 쉬운 규격화된 포맷(JSON 등)으로 검색 결과 및 데이터를 반환.
    

### 4. 핵심 차별점 (vs. NotebookLM 등 기존 서비스)

- **스마트 라우팅 (모델 오케스트레이션):** 단순 검색이나 가벼운 정리는 빠르고 가벼운 **로컬 모델**을 사용하고, 고도의 추론이 필요한 복잡한 작업에만 **상용 API 모델**을 호출하여 속도와 비용, 프라이버시를 동시에 잡음.
    
- **워크플로우 유지:** 특정 웹 UI에 갇히지 않고, 사용자가 평소 쓰던 에디터(VSCode, Obsidian, Neovim 등)를 그대로 사용 가능.
    
- **능동적 지식 관리:** 사용자가 질문할 때만 답하는 수동적 형태를 넘어, CLI 기반 스케줄링 등을 통해 에이전트가 백그라운드에서 능동적으로 노트를 통합하고 정리.




# 기능 명세 by opus 4.6
한국어 기능 명세서 작성을 위해 프로젝트 요구사항을 분석했다

# CLI 지식 관리 시스템 — 기능 명세서

---

## 1. 시스템 개요

CLI 프로그램명은 미정으로, 이하 `km`(knowledge manager)으로 표기한다. 모든 상호작용은 터미널 명령어를 통해 이루어지며, MCP 서버 모드를 통해 외부 LLM 에이전트에게 도구로 노출된다.

**기술 스택 요약**

- 벡터 DB: alibaba/zvec (로컬 우선, 추후 클라우드 동기화 확장 가능)
- 임베딩 모델: 로컬 모델 (e.g., `nomic-embed-text`, `bge-m3`) + 클라우드 API 폴백
- LLM: 로컬 모델 (Ollama 등) + 클라우드 API (OpenAI, Anthropic 등) 스마트 라우팅
- 데이터 포맷: 노트 원본은 Markdown 기반, 입출력은 JSON/plain text 선택 가능

---

## 2. 전역 옵션 및 설정

### 2.1 전역 CLI 플래그

```
km [command] [subcommand] [args]
  --vault, -v <name>     대상 Vault 지정 (미지정 시 현재 활성 Vault)
  --output, -o <format>  출력 포맷: text | json | jsonl (기본: text)
  --quiet, -q            사람이 읽는 메시지 억제, 데이터만 출력
  --verbose              디버그 로그 출력
  --config <path>        설정 파일 경로 오버라이드
```

`--output json`과 `--quiet`의 조합은 LLM 에이전트가 파이프라인으로 결과를 소비할 때의 표준 패턴이다.

### 2.2 설정 파일 구조

기본 위치: `~/.config/km/config.toml`

toml

````toml
[general]
default_vault = "personal"
default_output = "text"

[embedding]
provider = "local"                   # local | openai | custom
local_model = "nomic-embed-text"
# openai_api_key는 환경변수 KM_OPENAI_KEY 또는 시스템 키링 사용

[llm]
routing = "auto"                     # auto | local | cloud
local_endpoint = "http://localhost:11434"  # Ollama 등
local_model = "llama3"
cloud_provider = "anthropic"
cloud_model = "claude-sonnet-4-20250514"
# 라우팅 임계값: 이 복잡도 이하이면 로컬 모델 사용
routing_threshold = "medium"         # low | medium | high

[scheduler]
enabled = false
interval = "6h"                      # 백그라운드 정리 주기
```

---

## 3. 명령어 명세

### 3.1 `km vault` — Vault 관리

Vault는 독립된 지식 단위이며, 각 Vault는 자체 zvec 인덱스와 메타데이터 DB를 갖는다.
```
km vault create <name> [--path <dir>]
```
- 새 Vault 생성. `--path` 미지정 시 `~/.local/share/km/vaults/<name>/`에 생성.
- 생성 구조:
```
  <vault_root>/
    notes/          # 원본 노트 (마크다운)
    .km/
      index/        # zvec 인덱스 파일
      meta.db       # 메타데이터 (SQLite 등 경량 DB)
      config.toml   # Vault 단위 설정 오버라이드
```
```
km vault list
```
- 등록된 모든 Vault 목록 출력. 활성 Vault에 `*` 표시.
```
km vault switch <name>
```
- 현재 셸 세션의 활성 Vault 변경.
```
km vault delete <name> [--confirm]
```
- Vault 삭제. `--confirm` 없으면 대화형 확인 요구.
```
km vault status [<name>]
```
- Vault 상태 요약: 노트 수, 인덱스 된 문서 수, 마지막 동기화 시각, 디스크 사용량.

---

### 3.2 `km add` — 노트 추가 및 인덱싱
```
km add <file|dir|glob> [--recursive] [--tag <tag>...] [--watch]
```

**동작 흐름 (데이터 파이프라인)**

1. **파싱**: 입력 파일을 읽고, 프론트매터(YAML) 파싱 → 제목/태그/날짜 등 메타데이터 추출
2. **청킹**: 문서를 의미 단위로 분할 (헤딩 기반 분할 우선, 폴백으로 토큰 윈도우 분할)
3. **임베딩**: 각 청크를 벡터로 변환
4. **저장**: zvec 인덱스에 벡터 삽입 + 메타데이터 DB에 원본 경로, 청크 오프셋, 태그 등 기록

**옵션**

- `--recursive, -r`: 디렉토리 재귀 탐색
- `--tag, -t`: 수동 태그 부여 (프론트매터 태그와 병합)
- `--watch, -w`: 파일 변경 감시 모드. 파일이 수정되면 해당 노트만 재인덱싱
- `--dry-run`: 실제 인덱싱 없이 파싱 결과만 출력

**지원 파일 형식** (1차)

- `.md`, `.txt` — 직접 파싱
- `.pdf` — 텍스트 추출 후 파싱 (추후 확장)

**중복 처리**: 파일 해시 기반으로 이미 인덱싱된 파일은 건너뛰고, 내용이 변경된 파일은 기존 청크를 삭제 후 재삽입.

---

### 3.3 `km search` — 하이브리드 검색
```
km search <query> [options]
```

**검색 전략**

| 모드 | 설명 |
|---|---|
| `--mode semantic` | 벡터 유사도 검색만 수행 |
| `--mode keyword` | 메타데이터 DB 대상 전문 검색 (FTS) |
| `--mode hybrid` (기본값) | 양쪽 결과를 RRF(Reciprocal Rank Fusion) 등으로 병합 |

**옵션**
```
  --top, -n <int>        반환 결과 수 (기본: 10)
  --threshold <float>    유사도 임계값 (기본: 0.5)
  --tag <tag>...         태그 필터
  --after <date>         날짜 필터 (이후)
  --before <date>        날짜 필터 (이전)
  --mode <mode>          검색 모드: semantic | keyword | hybrid
````

**출력 구조 (JSON 모드)**

json

````json
{
  "query": "BTRFS 서브볼륨 스냅샷 전략",
  "mode": "hybrid",
  "results": [
    {
      "id": "chunk_a3f2e1",
      "note_path": "notes/linux/btrfs-guide.md",
      "title": "BTRFS 관리 가이드",
      "chunk_text": "서브볼륨 스냅샷은 COW 특성을 활용하여...",
      "score": 0.87,
      "score_detail": { "semantic": 0.91, "keyword": 0.72 },
      "tags": ["linux", "filesystem"],
      "created_at": "2025-11-03T14:22:00Z"
    }
  ],
  "total": 1
}
```

text 모드에서는 사람이 읽기 편한 축약 형태로 출력하되, 핵심 필드(경로, 스코어, 미리보기)는 유지한다.

---

이건 필요없을 듯 프론트에 포함하면 좋을듯
### 3.4 `km ask` — LLM 질의 (RAG)
```
km ask <question> [options]
```

내부적으로 `km search`를 먼저 수행해 관련 컨텍스트를 수집한 뒤, LLM에게 질문과 함께 전달하는 RAG 파이프라인.

**옵션**
```
  --context-limit <int>  LLM에 전달할 최대 청크 수 (기본: 5)
  --model <override>     이번 질의에 사용할 모델 강제 지정
  --routing <mode>       auto | local | cloud (이번 질의에만 적용)
  --show-sources         답변 끝에 참조한 노트 경로 목록 표시
  --raw                  LLM 원본 응답 그대로 출력 (후처리 없음)
````

**스마트 라우팅 로직**

1. 질문의 예상 복잡도를 판별 (키워드 수, 추론 요구 수준 추정)
2. `routing_threshold` 설정값과 비교
3. 임계값 이하이면 로컬 모델로 처리, 초과이면 클라우드 API 호출
4. `--routing` 플래그로 수동 오버라이드 가능

**출력 (JSON 모드)**

json

````json
{
  "answer": "BTRFS 스냅샷은 읽기 전용과 쓰기 가능 두 가지 모드로...",
  "model_used": "llama3:local",
  "routing_reason": "low_complexity",
  "sources": [
    { "note_path": "notes/linux/btrfs-guide.md", "chunk_id": "chunk_a3f2e1" }
  ]
}
```

---

### 3.5 `km cluster` — AI 기반 자동 분류
```
km cluster [options]
```

Vault 내 모든 (또는 필터된) 청크의 벡터를 기반으로 클러스터링을 수행하고, 유사 노트 그룹을 제안한다.

**옵션**
```
  --algorithm <alg>      클러스터링 알고리즘: kmeans | hdbscan | agglom (기본: hdbscan)
  --min-cluster <int>    최소 클러스터 크기 (기본: 3)
  --suggest-merge        LLM을 활용해 병합 가능한 노트 쌍 제안
  --apply                제안된 분류 태그를 실제로 메타데이터에 기록
  --tag <tag>...         특정 태그의 노트만 대상으로 클러스터링
```

**출력 예시 (text)**
```
Cluster 1: "리눅스 파일시스템" (5 notes)
  - notes/linux/btrfs-guide.md
  - notes/linux/ext4-vs-btrfs.md
  - notes/linux/fstab-tips.md
  ...

Cluster 2: "캡스톤 진행" (3 notes)
  - notes/capstone/week1-report.md
  - notes/capstone/architecture-draft.md
  ...

[Merge suggestion] btrfs-guide.md § "마운트 옵션" ↔ fstab-tips.md § "SSD 최적화"
  → 두 섹션이 동일 주제를 다룸 (similarity: 0.93). 통합을 권장.
```

---

### 3.6 `km sync` — 인덱스 동기화
```
km sync [--full] [--prune]
```

- 기본 동작: Vault의 `notes/` 디렉토리를 스캔하여 변경/추가/삭제된 파일을 감지하고, 인덱스를 증분 업데이트.
- `--full`: 전체 인덱스를 재구축.
- `--prune`: 원본이 삭제된 노트의 인덱스 엔트리를 정리.

---

### 3.7 `km tag` — 태그 관리
```
km tag list                          # Vault 내 모든 태그와 노트 수 출력
km tag add <file|glob> <tag>...      # 수동 태그 부여
km tag remove <file|glob> <tag>...   # 태그 제거
km tag auto [--dry-run]              # LLM 기반 자동 태그 제안/부여
```

`km tag auto`는 태그가 없거나 부족한 노트를 탐지하고, 내용 기반으로 태그를 제안한다. `--dry-run`이면 제안만, 아니면 프론트매터에 직접 기록.

---

### 3.8 `km serve` — MCP 서버 모드
```
km serve [--transport <stdio|sse>] [--port <int>]
```

MCP(Model Context Protocol) 서버로 동작하며, 외부 LLM 에이전트(Claude, Cursor 등)가 아래 도구를 호출할 수 있게 한다.

**노출되는 MCP 도구(Tool) 목록**

| Tool 이름 | 매핑 CLI 명령 | 설명 |
|---|---|---|
| `km_search` | `km search` | 하이브리드 검색 실행 |
| `km_ask` | `km ask` | RAG 질의 |
| `km_add_note` | `km add` | 노트 추가 및 인덱싱 |
| `km_list_vaults` | `km vault list` | Vault 목록 조회 |
| `km_vault_status` | `km vault status` | Vault 상태 조회 |
| `km_cluster` | `km cluster` | 클러스터링 실행 |
| `km_tag_auto` | `km tag auto` | 자동 태그 제안 |

모든 도구의 입출력은 JSON으로 고정된다. `--transport stdio`는 Claude Desktop/Claude Code 등의 표준 연동 방식이고, `--transport sse`는 HTTP 기반 원격 연동용이다.

---

### 3.9 `km schedule` — 백그라운드 스케줄링
```
km schedule enable [--interval <duration>]
km schedule disable
km schedule status
km schedule run-now
````

활성화 시 시스템 스케줄러(systemd timer, cron 등)를 등록하여 주기적으로 다음을 수행한다.

1. `km sync --prune` — 인덱스 동기화
2. `km tag auto` — 미분류 노트 자동 태깅
3. `km cluster --suggest-merge` — 클러스터링 및 병합 제안 생성

결과는 `~/.local/share/km/logs/`에 기록되며, `km schedule status`로 마지막 실행 결과를 확인할 수 있다.

---

## 4. 데이터 모델

### 4.1 메타데이터 스키마 (SQLite)

sql

````sql
-- 노트 원본 단위
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,   -- UUID
    vault_id    TEXT NOT NULL,
    file_path   TEXT NOT NULL,      -- Vault 기준 상대 경로
    title       TEXT,
    file_hash   TEXT NOT NULL,      -- 변경 감지용 SHA-256
    created_at  DATETIME,
    updated_at  DATETIME,
    indexed_at  DATETIME
);

-- 청크 단위 (zvec 벡터와 1:1 매핑)
CREATE TABLE chunks (
    id          TEXT PRIMARY KEY,   -- zvec 벡터 ID와 동일
    note_id     TEXT NOT NULL REFERENCES notes(id),
    heading     TEXT,               -- 소속 헤딩 계층
    content     TEXT NOT NULL,      -- 원본 텍스트
    offset_start INT,
    offset_end   INT,
    token_count  INT
);

-- 태그
CREATE TABLE tags (
    note_id     TEXT NOT NULL REFERENCES notes(id),
    tag         TEXT NOT NULL,
    source      TEXT DEFAULT 'manual',  -- manual | auto | frontmatter
    PRIMARY KEY (note_id, tag)
);

-- FTS 가상 테이블 (키워드 검색용)
CREATE VIRTUAL TABLE chunks_fts USING fts5(content, content=chunks, content_rowid=rowid);
```

### 4.2 zvec 인덱스

각 Vault 별로 독립된 zvec 인덱스 파일을 유지한다. 벡터 ID는 `chunks.id`와 동일하게 맞춰, 메타데이터 DB 조인 없이도 zvec 결과에서 바로 청크를 식별할 수 있게 한다.

---

## 5. 스마트 라우팅 상세
```
[질의 입력]
    │
    ▼
[복잡도 판별기] ── 휴리스틱 기반 ──┐
    │                              │
    │  factor 1: 질의 토큰 수       │
    │  factor 2: 검색 결과 수/분산   │
    │  factor 3: 멀티홉 추론 필요 여부│
    │  factor 4: 명시적 지시어 감지   │
    │     ("비교해줘", "분석해줘" 등) │
    │                              │
    ▼                              │
[복잡도 점수: low / medium / high] ◄┘
    │
    ├─ low    → 로컬 모델 (빠름, 무료, 프라이버시)
    ├─ medium → routing_threshold 설정에 따라 분기
    └─ high   → 클라우드 API (정확도 우선)
````

사용자가 `--routing local` 또는 `--routing cloud`를 명시하면 판별 과정을 건너뛴다.

---

## 6. 에러 처리 및 종료 코드

|코드|의미|
|---|---|
|`0`|성공|
|`1`|일반 에러 (파일 없음, 파싱 실패 등)|
|`2`|Vault 관련 에러 (존재하지 않는 Vault 등)|
|`3`|인덱싱 에러 (zvec 쓰기 실패, 임베딩 실패 등)|
|`4`|LLM 연결 에러 (로컬 모델 미응답, API 키 누락 등)|
|`10`|설정 파일 문법 에러|

JSON 출력 모드에서 에러 발생 시에도 구조화된 에러 객체를 반환한다.

json

```json
{ "error": { "code": 4, "message": "Local LLM endpoint unreachable at localhost:11434" } }
```

---

## 7. 구현 우선순위

**Phase 1 — 기반 (MVP)** `vault create/list/switch/delete` → `add` (파싱+청킹+임베딩+zvec 저장) → `search --mode semantic` → `sync`

**Phase 2 — 실용** `search --mode hybrid` (FTS 추가) → `ask` (RAG 파이프라인) → 스마트 라우팅 → `tag` 관리

**Phase 3 — 에이전트** `serve` (MCP 서버) → `cluster` → `tag auto` → `schedule`

---

## 8. 미결 사항 및 향후 검토

- **프로젝트 이름 및 바이너리명**: 현재 `km`은 임시 표기. 확정 필요.
- **구현 언어**: Rust(성능, 단일 바이너리) vs Go(개발 속도) vs TypeScript(MCP 생태계 친화) 중 결정 필요.
- **zvec 청킹 전략 세부 튜닝**: 헤딩 기반 분할의 최대/최소 토큰 수, 오버랩 윈도우 크기 등 실험 후 확정.
- **멀티 Vault 검색**: 여러 Vault를 동시에 검색하는 크로스 Vault 쿼리 지원 여부.
- **노트 형식 확장**: `.org`, `.rst`, `.adoc` 등 Markdown 이외 포맷 지원 범위.


# notebooklm 분석 by gemini
## Gemini의 응답

맞습니다. 말씀하신 대로 사용자가 제공한 텍스트 데이터를 벡터화하고, LLM을 통해 의미 기반으로 검색하여 답변을 제공한다는 점에서 NotebookLM은 구상하시는 프로젝트와 가장 맞닿아 있는 레퍼런스입니다.

기본적으로 NotebookLM은 매우 고도화된 **RAG (Retrieval-Augmented Generation, 검색 증강 생성)** 파이프라인을 따르고 있습니다. NotebookLM이 백그라운드에서 어떤 방식으로 작동하는지 단계별로 파헤쳐 보겠습니다.

Getty Images

탐색

### 1. 데이터 수집 및 파싱 (Ingestion & Parsing)

- **작동 방식:** 사용자가 PDF, Google Docs, 텍스트 파일, 웹 URL 등을 업로드하면, 시스템이 문서를 읽어 들이고 텍스트를 추출합니다.
    
- **특징:** 단순히 글자만 빼내는 것이 아니라, 문서의 구조(제목, 문단, 목록 등)를 어느 정도 파악하여 메타데이터로 함께 유지합니다.
    

### 2. 청킹 및 임베딩 (Chunking & Embedding)

- **작동 방식:** 추출된 긴 텍스트를 의미를 잃지 않는 선에서 적절한 크기의 조각(Chunk)으로 쪼갭니다. (예: 문단 단위, 혹은 특정 토큰 수 기준)
    
- **벡터화:** 쪼개진 텍스트 조각들을 임베딩 모델(Google의 경우 text-embedding API 등)에 통과시켜 고차원의 숫자 배열(Vector)로 변환합니다. 이 벡터값은 텍스트의 '의미적 위치'를 나타냅니다.
    

### 3. 저장 및 인덱싱 (Storage & Vector DB)

- **작동 방식:** 생성된 벡터값들은 빠른 유사도 검색을 위해 Vector DB에 저장됩니다.
    
- **특징:** 이때 벡터값만 저장하는 것이 아니라, 원본 텍스트 조각과 해당 조각이 원래 문서의 어디에 위치했는지(출처, 페이지 번호 등)에 대한 메타데이터도 함께 연결하여 저장합니다. (구상하시는 Vault 개념과 동일합니다.)
    

### 4. 쿼리 처리 및 의미 검색 (Semantic Search / Retrieval)

- **작동 방식:** 사용자가 질문을 입력하면, 시스템은 그 질문 역시 동일한 임베딩 모델을 사용해 벡터로 변환합니다.
    
- **매칭:** 질문의 벡터와 Vector DB에 저장된 수많은 문서 조각들의 벡터 간의 '거리(유사도)'를 계산하여, 의미상 가장 관련성이 높은(가까운) 텍스트 조각들을 빠르고 정확하게 찾아냅니다. (Semantic Search)
    

### 5. 컨텍스트 주입 및 답변 생성 (Generation with Grounding)

- **작동 방식:** 검색해 낸 관련 텍스트 조각들을 LLM(Gemini 1.5 Pro 등)에게 전달하는 프롬프트에 **'컨텍스트(문맥)'**로 주입합니다.
    
- **Grounding (근거 기반):** 프롬프트에는 보통 *"오직 제공된 컨텍스트만을 바탕으로 답변하고, 외부 지식을 지어내지 말라"*는 강력한 지시가 포함됩니다. 이를 통해 할루시네이션(환각)을 최소화합니다.
    

### 6. 출처 표기 (Citation Generation)

- **작동 방식:** LLM이 답변을 생성할 때, 자신이 활용한 컨텍스트 조각이 원본 문서의 어느 부분인지 추적하여 답변 문장 끝에 주석(Citation)을 달아줍니다.


# zvec
semantic + 키워드 검색을 시스템 레벨에서 지원??

1. 서버리스 (도커 컨테이너 필요없음) -> 라이브러리 형태로 지원
2. 하이브리드 검색 네이티브 지원
3. 자체 리랭킹 후 반환
4. 

# langchain과의 비교
## Gemini의 응답

LangChain이나 LlamaIndex 같은 프레임워크로 일반 사용자가 구축한 RAG 파이프라인과 비교했을 때, 기획하신 프로젝트는 **특정 타겟층(개발자, 파워유저)에게 압도적인 경쟁력을 가질 수 있습니다.**

범용 프레임워크를 사용한 일반적인 워크플로우가 가진 태생적 한계와, 제안하신 커스텀 시스템이 가지는 비교 우위를 분석해 드립니다.

### 1. 극단적인 가벼움과 실행 속도 (Zero Bloat)

LangChain은 훌륭한 프로토타이핑 도구지만, 의존성 패키지가 방대하고 무겁습니다. 일반 사용자가 만든 LangChain 스크립트는 터미널에서 실행할 때마다 환경을 로드하느라 체감되는 지연 시간(Latency)이 발생합니다.

반면 제안하신 도구는 `zvec`과 같은 In-Process 기반 DB를 사용하여 극도로 가벼운 구조를 지향합니다. 사용자가 CLI에서 명령어를 입력했을 때 딜레이 없이 즉각적으로 반응하는 경험은 데일리 지식 관리 도구로서 엄청난 강점입니다. 군더더기 없는 가벼운 환경을 선호하고, 백그라운드 리소스 점유에 민감한 유저들에게 강력한 어필 포인트가 됩니다.

### 2. 블랙박스 탈피와 정교한 검색 제어 (Fine-grained Control)

일반적인 프레임워크는 사용 편의성을 위해 내부 로직을 크게 추상화(블랙박스화)해 둡니다. 이는 빠르게 챗봇을 만들 때는 좋지만, 검색 품질을 극한으로 끌어올리려 할 때는 오히려 방해가 됩니다.

특히 자연어 처리에서 문서의 특징을 정확히 잡아내기 위해서는 의미 기반의 밀집 벡터(Dense Vector)뿐만 아니라, 특정 키워드의 출현 빈도(Term Frequency) 등을 반영하는 희소 벡터(Sparse Vector)의 가중치를 섬세하게 튜닝해야 합니다. 커스텀 시스템을 구축하면 프레임워크의 제약 없이 이 하이브리드 검색의 가중치와 청킹(Chunking) 전략을 프로젝트 볼트의 성격에 맞게 완벽히 통제할 수 있습니다.

### 3. 수동적 RAG(질의응답) vs 능동적 오케스트레이션(정리 및 군집화)

일반 사용자가 프레임워크로 짜는 워크플로우의 90% 이상은 "내 노트에서 X를 찾아줘" 형태의 수동적인 챗봇입니다.

이 프로젝트의 진정한 경쟁력은 **'오케스트레이션'**에 있습니다. 사용자가 질문하지 않아도 시스템이 백그라운드나 스케줄러를 통해 파편화된 노트를 분석하고, 벡터 유사도가 높은 개념들을 찾아내 먼저 묶어주거나(Clustering) 태깅을 제안하는 '능동성'을 갖추게 됩니다. 이는 단순한 검색 엔진이 아니라 '디지털 브레인'을 관리해 주는 비서의 역할을 합니다.

### 4. 에디터 생태계와의 매끄러운 통합 (MCP의 힘)

LangChain으로 만든 도구는 결국 터미널 창이나 별도의 웹 UI(Streamlit 등)에 사용자를 가둬둡니다. 글을 쓰다가 검색을 위해 창을 전환해야 하는 컨텍스트 스위칭이 발생합니다.

하지만 **MCP(Model Context Protocol)**를 채택한 이 시스템은 사용자가 선호하는 마크다운 에디터 환경을 전혀 해치지 않습니다. 평소 쓰던 에디터에서 자유롭게 노트를 작성하기만 하면, Claude와 같은 LLM 에이전트가 MCP를 통해 백그라운드에서 이 CLI 도구를 호출하여 컨텍스트를 파악합니다. 즉, 도구가 사용자의 워크플로우에 강요되는 것이 아니라, 워크플로우 아래로 투명하게 녹아드는 구조입니다.

---

**요약하자면:** 기존 프레임워크로 짠 스크립트가 '레고 블록으로 대충 조립해 만든 쓸만한 수납장'이라면, 기획하신 프로젝트는 **'맞춤형으로 깎아 만든, 다른 스마트홈 기기(LLM 에이전트)들과 완벽하게 연동되는 빌트인 시스템'**입니다. 프레임워크의 불필요한 추상화와 무거움을 덜어내고, 본연의 목적에 집중한 로컬 최적화 도구라는 점에서 시장에 나올 경우 파워유저 층에서 확실한 지지를 받을 수 있는 매력적인 아키텍처입니다.