---
title: "캡디 LLM 일일 보고서"
date: 2026-05-08
layer: artifact
kind: daily-report
source_path: rewritten/2026-05-08/capdi-llm-rewritten.md
artifact_template_id: daily-report
---

# Daily Report: 2026-05-08

## Summary

- 오늘 근거 자료는 CLI 기반 LLM 지식 관리 시스템의 기획안과 기능 명세, NotebookLM 및 LangChain류 도구와의 비교 분석이다. (source: `rewritten.md#프로젝트-개요`)
- 완료된 구현이나 작업 완료 기록은 원본에 없으며, 미결정 항목과 구현 우선순위가 주요 후속 작업이다. (source: `rewritten.md#원천-추적`; `rewritten.md#미결-사항`)
- 다음 액션은 프로젝트 이름/바이너리명, 구현 언어, zvec 기반 검색/청킹 검증 범위를 먼저 확정하는 것이다. (source: `rewritten.md#미결-사항`; `rewritten.md#구현-우선순위`)

## Today Done

- 기록된 완료 작업 없음. 원본은 기획 및 명세 자료이며 실제 완료 내역을 포함하지 않는다. (source: `rewritten.md#원천-추적`)

## Open Tasks

- [ ] 프로젝트 이름 및 바이너리명 확정. 현재 `km`은 임시 표기다. (source: `rewritten.md#미결-사항`)
- [ ] 구현 언어를 Rust, Go, TypeScript 중에서 결정. (source: `rewritten.md#미결-사항`)
- [ ] zvec 청킹 전략의 최대/최소 토큰 수와 오버랩 윈도우 크기 실험 후 확정. (source: `rewritten.md#미결-사항`)
- [ ] 멀티 Vault 검색 지원 여부 결정. (source: `rewritten.md#미결-사항`)
- [ ] Markdown 외 `.org`, `.rst`, `.adoc` 등 노트 형식 확장 범위 결정. (source: `rewritten.md#미결-사항`)
- [ ] zvec의 서버리스 라이브러리 형태, 하이브리드 검색 네이티브 지원, 자체 리랭킹 반환 가능성 확인. (source: `rewritten.md#미결-사항`)

## Deferred Or Blocked

- 구현 착수 여부는 확인되지 않았다. 언어 선택과 zvec 검증 항목이 확정되지 않아 Phase 1 범위를 바로 고정하기 어렵다. (source: `rewritten.md#미결-사항`; `rewritten.md#구현-우선순위`)

## Area Notes

### 제품 기획

- 목표는 파편화된 개인 노트를 LLM 에이전트와 벡터 기술로 자동 정리하고 연결하는 개발자 및 파워유저 친화적 지식 관리 오케스트레이션 도구다. (source: `rewritten.md#프로젝트-개요`)
- 핵심 가치는 에디터 독립성, 로컬/클라우드 모델 선택 유연성, MCP 기반 에이전트 도구화, 자동화와 능동적 정보 산출이다. (source: `rewritten.md#프로젝트-개요`)

### 검색 및 인덱싱

- 검색은 벡터 데이터베이스 기반 의미 검색과 키워드 검색을 결합한 하이브리드 검색을 기본 방향으로 둔다. (source: `rewritten.md#핵심-아키텍처`; `rewritten.md#하이브리드-검색`)
- 노트 추가 파이프라인은 파싱, 청킹, 임베딩, zvec 저장과 메타데이터 기록으로 구성된다. (source: `rewritten.md#노트-추가와-인덱싱`)

### MCP 및 에이전트

- `km serve`는 MCP 서버 모드로 동작하며 검색, RAG 질의, 노트 추가, Vault 조회, 클러스터링, 자동 태그 제안을 JSON 도구로 노출하는 방향이다. (source: `rewritten.md#동기화-mcp-서버-스케줄링`)
- 이 구조는 사용자가 기존 Markdown 에디터 워크플로우를 유지하면서 LLM 에이전트가 CLI 도구를 호출하는 형태를 목표로 한다. (source: `rewritten.md#프로젝트-개요`; `rewritten.md#langchain-및-llamaindex류-프레임워크`)

### 구현 단계

- Phase 1은 Vault 관리, 노트 추가, 의미 검색, 동기화가 MVP 범위다. (source: `rewritten.md#구현-우선순위`)
- Phase 2는 하이브리드 검색, RAG 질의, 스마트 라우팅, 태그 관리다. (source: `rewritten.md#구현-우선순위`)
- Phase 3은 MCP 서버, 클러스터링, 자동 태그, 스케줄링이다. (source: `rewritten.md#구현-우선순위`)

## Workout

- 운동 기록 없음. 원본에는 운동 종류, 횟수, 볼륨, 연속성 정보가 없다. (source: `rewritten.md#원천-추적`)

## Suggestions

1. Phase 1을 고정하기 전에 `km` 임시명을 유지할지, 실제 바이너리명을 별도로 정할지 먼저 결정한다. (source: `rewritten.md#미결-사항`)
2. 구현 언어 선택은 MCP 생태계 친화성, 단일 바이너리 배포, zvec 연동 난이도를 기준으로 비교한다. (source: `rewritten.md#미결-사항`; `rewritten.md#핵심-아키텍처`)
3. zvec 검증은 의미 검색 단독, 키워드 검색 결합, 하이브리드 검색 리랭킹 반환 가능성 순서로 작은 샘플 Vault에서 확인한다. (source: `rewritten.md#미결-사항`; `rewritten.md#하이브리드-검색`)

## Sources

- `rewritten.md`
- `rewritten.md#원천-추적`
- `rewritten.md#프로젝트-개요`
- `rewritten.md#핵심-아키텍처`
- `rewritten.md#노트-추가와-인덱싱`
- `rewritten.md#하이브리드-검색`
- `rewritten.md#동기화-mcp-서버-스케줄링`
- `rewritten.md#구현-우선순위`
- `rewritten.md#미결-사항`
