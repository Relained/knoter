---
title: "캡디 LLM 재작성"
date: 2026-05-08
layer: rewritten
kind: daily
source_note_id: source-capdi-llm
source_path: sources/2026-05-08/capdi-llm.md
rewrite_agent: codex-cli
---

# 캡디 LLM 재작성

## 원천 추적

- 원본 노트: `sources/2026-05-08/capdi-llm.md`
- 워크스페이스 원본 파일: `source.md`
- 재작성 기준: 원본의 프로젝트 기획안, 기능 명세서, NotebookLM 분석, zvec 메모, LangChain 비교 내용을 구조화했다.
- 주의: 원본에는 완료된 작업 수, 운동 기록, 실제 구현 완료 내역이 없다.

## 검색어 정규화

- 임베딩
- 하이브리드 검색
- MCP
- 벡터 데이터베이스
- CLI 지식 관리
- Vault
- RAG
- zvec
- 스마트 라우팅

## 프로젝트 개요

- 목표는 파편화된 개인 노트를 LLM 에이전트와 벡터 기술로 자동 정리하고 연결하는 개발자 및 파워유저 친화적 지식 관리 오케스트레이션 도구를 만드는 것이다. (source: `source.md#프로젝트-기획안-llm-에이전트-기반-cli-지식-관리-시스템`)
- 핵심 가치는 특정 에디터에 종속되지 않는 자유도, 로컬/클라우드 모델의 유연한 활용, MCP를 통한 에이전트의 지식 도구 활용 환경, 자동화와 능동적 정보 산출이다. (source: `source.md#프로젝트-비전-및-목표`)
- CLI 중심 인터페이스를 기본으로 하며, 전용 프론트엔드와는 API 등으로 느슨하게 결합해 기존 에디터 사용을 보장하는 방향이다. (source: `source.md#핵심-아키텍처-및-구성-요소`)

## 핵심 아키텍처

- 검색 엔진은 벡터 데이터베이스 기반 의미 검색과 전통적 키워드 검색을 결합한 하이브리드 검색을 지향한다. (source: `source.md#핵심-아키텍처-및-구성-요소`)
- 데이터베이스는 로컬 및 클라우드를 모두 지원하는 벡터 데이터베이스 구축을 목표로 한다. 기능 명세에서는 로컬 우선 벡터 DB로 `alibaba/zvec`를 언급한다. (source: `source.md#핵심-아키텍처-및-구성-요소`; `source.md#기술-스택-요약`)
- 에이전트 통신에는 MCP(Model Context Protocol)를 적용해 외부 LLM 에이전트가 CLI 도구를 자신의 도구처럼 활용할 수 있게 한다. (source: `source.md#핵심-아키텍처-및-구성-요소`)
- 노트 원본은 Markdown 기반이고, 입출력은 JSON 또는 plain text를 선택할 수 있는 구조로 제안되어 있다. (source: `source.md#기술-스택-요약`)

## 주요 기능

### Vault 관리

- Vault는 개인 Vault, 프로젝트 Vault처럼 주제와 목적에 따라 물리적 또는 논리적으로 분리되는 독립 지식 단위다. (source: `source.md#주요-기능-명세`)
- 명세상 `km vault create/list/switch/delete/status` 명령이 제안되어 있다. 각 Vault는 `notes/`, `.km/index/`, `.km/meta.db`, `.km/config.toml` 구조를 가진다. (source: `source.md#km-vault--vault-관리`)

### 노트 추가와 인덱싱

- `km add <file|dir|glob>`는 파싱, 청킹, 임베딩, 저장 순서의 데이터 파이프라인을 수행한다. (source: `source.md#km-add--노트-추가-및-인덱싱`)
- 파싱 단계는 Markdown 프론트매터에서 제목, 태그, 날짜 등 메타데이터를 추출한다. 청킹은 헤딩 기반 분할을 우선하고 토큰 윈도우 분할을 폴백으로 둔다. (source: `source.md#km-add--노트-추가-및-인덱싱`)
- 임베딩 단계는 각 청크를 벡터로 변환하고, 저장 단계는 zvec 인덱스와 메타데이터 DB에 원본 경로, 청크 오프셋, 태그 등을 기록한다. (source: `source.md#km-add--노트-추가-및-인덱싱`)
- 지원 파일 형식 1차 범위는 `.md`, `.txt`, `.pdf`로 제안되어 있다. (source: `source.md#km-add--노트-추가-및-인덱싱`)

### 하이브리드 검색

- `km search <query>`는 기본 모드로 하이브리드 검색을 사용한다. (source: `source.md#km-search--하이브리드-검색`)
- 검색 모드는 `semantic`, `keyword`, `hybrid`로 나뉜다. `hybrid`는 벡터 유사도 검색과 FTS 기반 키워드 검색 결과를 RRF 등으로 병합한다. (source: `source.md#km-search--하이브리드-검색`)
- JSON 출력은 질의, 모드, 결과 배열, 청크 ID, 원본 노트 경로, 제목, 청크 텍스트, 점수, 태그, 생성 시각을 포함하는 형태로 제안되어 있다. (source: `source.md#km-search--하이브리드-검색`)

### RAG 질의

- `km ask <question>`은 내부적으로 `km search`를 먼저 수행해 관련 컨텍스트를 수집한 뒤 LLM에게 전달하는 RAG 파이프라인으로 설명되어 있다. (source: `source.md#km-ask--llm-질의-rag`)
- 옵션에는 컨텍스트 청크 수 제한, 모델 강제 지정, 라우팅 모드, 출처 표시, 원본 응답 출력이 포함된다. (source: `source.md#km-ask--llm-질의-rag`)

### 클러스터링과 태그

- `km cluster`는 Vault 내 청크 벡터를 기반으로 클러스터링을 수행하고 유사 노트 그룹과 병합 후보를 제안한다. (source: `source.md#km-cluster--ai-기반-자동-분류`)
- `km tag`는 태그 목록, 태그 추가/삭제, LLM 기반 자동 태그 제안을 포함한다. `km tag auto --dry-run`은 제안만 수행하는 방식으로 설명되어 있다. (source: `source.md#km-tag--태그-관리`)

### 동기화, MCP 서버, 스케줄링

- `km sync`는 Vault의 `notes/` 디렉터리를 스캔해 변경/추가/삭제된 파일을 감지하고 인덱스를 증분 업데이트한다. `--full`과 `--prune` 옵션이 있다. (source: `source.md#km-sync--인덱스-동기화`)
- `km serve`는 MCP 서버 모드로 동작하며 `km_search`, `km_ask`, `km_add_note`, `km_list_vaults`, `km_vault_status`, `km_cluster`, `km_tag_auto` 도구를 JSON 입출력으로 노출한다. (source: `source.md#km-serve--mcp-서버-모드`)
- `km schedule`은 시스템 스케줄러를 등록해 `km sync --prune`, `km tag auto`, `km cluster --suggest-merge`를 주기적으로 수행하는 방향으로 제안되어 있다. (source: `source.md#km-schedule--백그라운드-스케줄링`)

## 데이터 모델

- 메타데이터 DB는 SQLite를 전제로 하며 `notes`, `chunks`, `tags`, `chunks_fts` 테이블이 제안되어 있다. (source: `source.md#메타데이터-스키마-sqlite`)
- `notes`는 Vault, 파일 경로, 제목, 파일 해시, 생성/수정/인덱싱 시각을 관리한다. (source: `source.md#메타데이터-스키마-sqlite`)
- `chunks`는 청크 ID, 노트 ID, 헤딩, 내용, 오프셋, 토큰 수를 관리한다. (source: `source.md#메타데이터-스키마-sqlite`)
- `tags`는 태그와 출처(`manual`, `auto`, `frontmatter`)를 관리한다. (source: `source.md#메타데이터-스키마-sqlite`)
- `chunks_fts`는 키워드 검색용 SQLite FTS5 가상 테이블로 제안되어 있다. (source: `source.md#메타데이터-스키마-sqlite`)
- zvec 인덱스는 Vault별로 독립된 인덱스 파일을 유지하고, 벡터 ID를 `chunks.id`와 맞춰 결과 청크를 식별할 수 있게 한다. (source: `source.md#zvec-인덱스`)

## 스마트 라우팅

- 스마트 라우팅은 질의 복잡도를 판별해 low는 로컬 모델, high는 클라우드 API, medium은 `routing_threshold` 설정에 따라 분기하는 구조다. (source: `source.md#스마트-라우팅-상세`)
- 복잡도 판별 요소는 질의 토큰 수, 검색 결과 수와 분산, 멀티홉 추론 필요 여부, "비교해줘", "분석해줘" 같은 명시적 지시어 감지다. (source: `source.md#스마트-라우팅-상세`)
- 사용자가 `--routing local` 또는 `--routing cloud`를 명시하면 자동 판별 과정을 건너뛰는 것으로 제안되어 있다. (source: `source.md#스마트-라우팅-상세`)

## 구현 우선순위

- Phase 1 기반 MVP: `vault create/list/switch/delete`, `add`, `search --mode semantic`, `sync`. (source: `source.md#구현-우선순위`)
- Phase 2 실용 단계: `search --mode hybrid`, `ask`, 스마트 라우팅, `tag` 관리. (source: `source.md#구현-우선순위`)
- Phase 3 에이전트 단계: `serve`, `cluster`, `tag auto`, `schedule`. (source: `source.md#구현-우선순위`)

## 미결 사항

- 프로젝트 이름 및 바이너리명은 미정이며, `km`은 임시 표기다. (source: `source.md#미결-사항-및-향후-검토`)
- 구현 언어는 Rust, Go, TypeScript 중 결정이 필요하다. (source: `source.md#미결-사항-및-향후-검토`)
- zvec 청킹 전략의 최대/최소 토큰 수와 오버랩 윈도우 크기 등은 실험 후 확정이 필요하다. (source: `source.md#미결-사항-및-향후-검토`)
- 멀티 Vault 검색 지원 여부는 검토가 필요하다. (source: `source.md#미결-사항-및-향후-검토`)
- Markdown 이외 `.org`, `.rst`, `.adoc` 등 노트 형식 확장 범위는 검토가 필요하다. (source: `source.md#미결-사항-및-향후-검토`)
- zvec에 대해 서버리스 라이브러리 형태 지원, 하이브리드 검색 네이티브 지원, 자체 리랭킹 후 반환 가능성을 확인해야 한다는 메모가 있다. (source: `source.md#zvec`)

## 비교 분석

### NotebookLM

- 원본은 NotebookLM을 사용자가 제공한 텍스트 데이터를 벡터화하고 LLM으로 의미 기반 검색과 답변을 제공하는 RAG 레퍼런스로 본다. (source: `source.md#notebooklm-분석-by-gemini`)
- NotebookLM 분석에는 데이터 수집 및 파싱, 청킹 및 임베딩, 저장 및 인덱싱, 의미 검색, 컨텍스트 주입과 근거 기반 답변 생성, 출처 표기가 포함되어 있다. (source: `source.md#notebooklm-분석-by-gemini`)

### LangChain 및 LlamaIndex류 프레임워크

- 원본은 이 프로젝트가 개발자와 파워유저 대상에서 가벼움, 검색 제어, 능동적 오케스트레이션, MCP 기반 에디터 생태계 통합을 비교 우위로 가질 수 있다고 분석한다. (source: `source.md#langchain과의-비교`)
- LangChain류 일반 RAG 스크립트와 비교해, 제안 도구는 zvec 같은 in-process 기반 DB를 활용한 가벼운 CLI 반응성과 하이브리드 검색 가중치 및 청킹 전략 제어를 강점으로 제시한다. (source: `source.md#langchain과의-비교`)
- 원본은 단순 질의응답형 RAG보다 스케줄러와 클러스터링을 통한 능동적 노트 정리 및 태깅 제안이 프로젝트의 핵심 경쟁력이라고 본다. (source: `source.md#langchain과의-비교`)
