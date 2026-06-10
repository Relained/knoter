---
id: ideas-backlog
name: 아이디어 백로그
layer: artifact
kind: idea-backlog
templateId: idea-backlog-v1
artifactPath: artifacts/ideas/ideas-backlog.md
description: Preserve loose ideas as a durable backlog without forcing immediate execution.
---

# 아이디어/기획 정리 시나리오

Purpose: preserve loose ideas as a durable backlog without forcing immediate
execution.

Evidence to use:

- notes (source evidence or legacy rewritten notes) containing product
  ideas, Minecraft build ideas, automix/music ideas, infrastructure ideas,
  writing topics, or speculative plans
- existing idea artifacts before adding duplicates

Required sections:

- `# 아이디어 백로그`
- `## 새 아이디어`
- `## 확장 가능성`
- `## 보류`
- `## Sources`

Output sketch:

```markdown
# 아이디어 백로그

## 새 아이디어
- {{idea}} (source: {{path_or_chunk}})

## 확장 가능성
- {{idea}}: {{possible_next_step}}

## 보류
- {{idea_or_reason}}

## Sources
- {{path_or_chunk}}
```
