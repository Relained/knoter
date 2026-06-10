---
id: task-priority
name: Task 우선순위 보드
layer: artifact
kind: task-board
templateId: task-priority-v1
artifactPath: artifacts/tasks/task-priority.md
description: Durable task board maintained from daily notes.
---

# Task 템플릿

Purpose: maintain a durable task board from daily notes.

Evidence to use:

- daily notes (source evidence or legacy rewritten notes) with `- [ ]`,
  `- [x]`, project notes, TODO sections, and repeated unfinished items
- previous task artifacts with include-artifacts retrieval
- semantic search for recurring tasks such as `캡디`, `녹강`, `알고리즘`,
  `정처기`, `백업`, `공유기`

Required sections:

- `# Task 우선순위 보드`
- `## 우선순위`
- `## 진행 중`
- `## 완료 기록`
- `## 보류/위험`
- `## Sources`

Output sketch:

```markdown
# Task 우선순위 보드

## 우선순위
- [ ] {{task}} - {{reason}} (source: {{path_or_chunk}})

## 진행 중
- [ ] {{task}} (last seen: {{date}})

## 완료 기록
- [x] {{task}} (completed: {{date}}, source: {{path_or_chunk}})

## 보류/위험
- {{risk_or_blocker}}

## Sources
- {{path_or_chunk}}
```
