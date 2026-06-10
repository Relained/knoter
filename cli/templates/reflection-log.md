---
id: reflection-log
name: 일기/회고록
layer: artifact
kind: reflection-log
templateId: reflection-journal-v1
artifactPath: artifacts/reflection/reflection-log.md
description: Preserve personal reflections, mood, recurring desires, and lessons.
---

# 일기/회고록 시나리오

Purpose: preserve personal reflections, mood, recurring desires, and lessons
without turning them into medical or psychological claims.

Evidence to use:

- notes (source evidence or legacy rewritten notes) with reflective prose,
  repeated `싶다` goals, motivation, frustration, diary entries, or life
  observations
- continuity over the previous 7 days
- semantic search for similar reflection artifacts before updating

Required sections:

- `# 일기/회고록`
- `## 오늘의 관찰`
- `## 반복되는 욕구/목표`
- `## 배운 점`
- `## 다음에 남길 질문`
- `## Sources`

Output sketch:

```markdown
# 일기/회고록

## 오늘의 관찰
- {{observation}} (source: {{path_or_chunk}})

## 반복되는 욕구/목표
- {{goal_or_desire}}

## 배운 점
- {{lesson}}

## 다음에 남길 질문
- {{question_for_future_self}}

## Sources
- {{path_or_chunk}}
```
