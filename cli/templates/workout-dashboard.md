---
id: workout-dashboard
name: 운동관리 대시보드
layer: artifact
kind: workout-dashboard
templateId: workout-management-v1
artifactPath: artifacts/workout/workout-dashboard.md
description: Workout volume tracking and workout streak continuity.
---

# 운동관리 템플릿

Purpose: workout volume tracking and workout streak continuity.

Evidence to use:

- daily notes (source evidence or legacy rewritten notes) with `# 운동`,
  `운동 N일차`, home training, running, or route notes
- previous workout artifacts when extending streaks
- semantic search for `운동`, `홈트`, `뛰었음`, `streak`

Required sections:

- `# 운동관리 대시보드`
- `## 운동량 그래프`
- `## 금일 운동 평가`
- `## 다음 운동 조언`
- `## Streak`
- `## Sources`

Output sketch:

```markdown
# 운동관리 대시보드

## 운동량 그래프
| 날짜 | 운동 | 양/강도 | streak |
| --- | --- | --- | --- |
| {{date}} | {{exercise_type}} | {{volume_or_unknown}} | {{streak}} |

## 금일 운동 평가
- {{assessment_from_evidence}}

## 다음 운동 조언
- {{next_workout_suggestion}}

## Streak
- 운동: {{streak_value_or_unknown}}

## Sources
- {{path_or_chunk}}
```
