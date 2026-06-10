---
id: exam-progress
name: 시험/진도 관리
layer: artifact
kind: progress-tracker
templateId: exam-progress-v1
artifactPath: artifacts/progress/exam-progress.md
description: Track study progress against target counts and pacing.
---

# 시험/진도 관리 시나리오

Purpose: track study progress against target counts and pacing.

Evidence to use:

- notes (source evidence or legacy rewritten notes) with progress
  expressions such as `52 / 205`, `74/206`, `최소 20섹션`, `정처기`,
  exam-day notes, and planned study amounts
- previous progress artifacts when extending the timeline

Required sections:

- `# 시험/진도 관리`
- `## 진도 그래프`
- `## 목표 대비 상태`
- `## 권장 페이스`
- `## 다음 학습`
- `## Sources`

Output sketch:

```markdown
# 시험/진도 관리

## 진도 그래프
| 날짜 | 항목 | 현재 | 전체 | 비고 |
| --- | --- | ---: | ---: | --- |
| {{date}} | {{subject}} | {{current}} | {{total}} | {{note}} |

## 목표 대비 상태
- {{status}}

## 권장 페이스
- {{pace_advice}}

## 다음 학습
- [ ] {{next_study_action}}

## Sources
- {{path_or_chunk}}
```
