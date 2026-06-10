---
id: diet-dashboard
name: 식단관리 대시보드
layer: artifact
kind: diet-dashboard
templateId: diet-management-v1
artifactPath: artifacts/diet/diet-dashboard.md
description: Daily meal tracking, diet advice, and streak continuity.
---

# 식단관리 템플릿

Purpose: daily meal tracking, diet advice, and streak continuity.

Evidence to use:

- daily notes (source evidence or legacy rewritten notes) with `# 식단`,
  meal lines, snacks, drinks, or diet streaks
- previous diet artifacts when extending streaks
- semantic search for `식단`, `아침`, `점심`, `저녁`, `디저트`, `밥`, `다이어트`

Required sections:

- `# 식단관리 대시보드`
- `## 식사량 그래프`
- `## 금일 식사 조언`
- `## 다이어트 조언`
- `## Streaks`
- `## Sources`

Output sketch:

```markdown
# 식단관리 대시보드

## 식사량 그래프
| 날짜 | 아침 | 점심 | 저녁/간식 | 조절 상태 |
| --- | --- | --- | --- | --- |
| {{date}} | {{breakfast}} | {{lunch}} | {{dinner_or_snack}} | {{diet_streak}} |

## 금일 식사 조언
- {{evidence_backed_advice}}

## 다이어트 조언
- {{habit_or_next_meal_guidance}}

## Streaks
- 식단조절: {{streak_value_or_unknown}}

## Sources
- {{path_or_chunk}}
```
