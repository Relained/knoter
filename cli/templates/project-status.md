---
id: project-status
name: 캡디/프로젝트 상태
layer: artifact
kind: project-status
templateId: project-status-v1
artifactPath: artifacts/projects/capdi-project-status.md
description: Track project progress, decisions, blockers, and next actions.
---

# 프로젝트/캡디 관리 시나리오

Purpose: track project progress, decisions, blockers, and next actions.

Evidence to use:

- notes (source evidence or legacy rewritten notes) mentioning `캡디`,
  backend, harness, MCP, CLI, knoter, LLM agent, code analysis, or
  implementation decisions
- existing project artifacts with include-artifacts retrieval
- semantic search for project terms before updating

Required sections:

- `# 캡디/프로젝트 상태`
- `## 현재 목표`
- `## 진행 상황`
- `## 결정 사항`
- `## 막힌 점`
- `## 다음 액션`
- `## Sources`

Output sketch:

```markdown
# 캡디/프로젝트 상태

## 현재 목표
- {{goal}}

## 진행 상황
- {{progress}} (source: {{path_or_chunk}})

## 결정 사항
- {{decision}} (source: {{path_or_chunk}})

## 막힌 점
- {{blocker_or_risk}}

## 다음 액션
- [ ] {{next_action}}

## Sources
- {{path_or_chunk}}
```
