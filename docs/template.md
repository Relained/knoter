---
id: artifact-workflow
name: knoter Artifact Workflow
version: 3
kind: artifact-set
locale: ko-KR
requiredSections:
  - Contract
  - Agent Procedure
  - Rewritten Source Prompt
  - Scenario Templates
  - Output Contracts
  - Retrieval Notes
---

# knoter Artifact Workflow Template

> Bundled fallback template. Vaults should override it with `.kn/template.md`.
> External LLM agents combine this template with `kn report context` JSON and
> explicit `kn`/MCP retrieval before writing rewritten notes or user-visible
> artifacts. `knoter` stores, validates, indexes, and retrieves documents; it
> does not generate prose in normal `kn` commands.

## Contract

Use source files, rewritten notes, artifacts, and retrieval results as evidence.

Document layers:

- `source`: raw user files. These are evidence only and are not chunked or
  vector-indexed.
- `rewritten`: first-pass external-agent rewrite of a source document. This is
  the primary cleaned retrieval layer.
- `artifact`: durable user-facing documents generated or maintained from
  rewritten notes, template instructions, and retrieval.

Rules:

- Do not invent facts. Mark uncertain conclusions as inference.
- Preserve source lineage in frontmatter and in concrete claims.
- Use explicit `kind` only when the source/template supports it.
- Keep counts, dates, task states, streak values, names, and file paths.
- Prefer updating durable artifacts over creating duplicate documents.
- Before creating an artifact, search existing rewritten notes and, when needed,
  search artifacts with `includeArtifacts`.

Required context fields from `kn report context`:

- `date`
- `timezone`
- `template`
- `sourceInventory`
- `rewrittenSources`
- `dailyNotes`
- `signals`
- `continuity`
- `retrieval`

## Agent Procedure

1. Read this template and the target-date context bundle.
2. Inspect target source files from `sourceInventory`.
3. For each target source that needs cleanup, run the Rewritten Source Prompt
   below with the source content and source path.
4. Save the result under `rewritten/YYYY-MM-DD/...` with valid rewritten
   frontmatter.
5. Search rewritten notes and relevant existing artifacts before artifact
   planning. Use zvec/semantic search when keyword search is too narrow.
6. Choose one or more Scenario Templates below based on the evidence.
7. For each scenario, create or update the durable artifact under `artifacts/`.
8. Include source paths or chunk ids in claims that depend on specific evidence.

## Rewritten Source Prompt

Use this prompt when converting a raw source note into a rewritten note.

```text
You are the knoter rewrite agent.

Input:
- source_path: {{source_path}}
- target_date: {{date}}
- source_content:
{{source_content}}

Task:
1. Rewrite the source into a clean Markdown note.
2. Preserve all factual content: dates, names, counts, task checkboxes, streaks,
   meals, workouts, study topics, project notes, and links.
3. Organize loose lines under clear headings.
4. Do not add facts that are not in the source. You may add short labels or
   grouping headings when they clarify the source.
5. Keep unfinished tasks as unchecked checkboxes and completed tasks as checked
   checkboxes.
6. If the source contains study material, structure it as knowledge notes with
   definitions, key points, examples, and review questions.
7. If the source contains daily planning or reflection, separate observations,
   tasks, mood/reflection, and next actions.

Output:
- Markdown only.
- Include this frontmatter:
---
title: "<human title>"
layer: rewritten
kind: "<daily|study|project|reflection|mixed>"
doc_date: {{date}}
source_path: "{{source_path}}"
rewrite_agent: "<agent-name-or-runtime>"
rewrite_prompt_hash: "<stable prompt/version hash>"
---
```

## Scenario Templates

The agent may produce multiple artifacts for one date. A scenario is selected
only when evidence supports it.

### 식단관리 템플릿

Purpose: daily meal tracking, diet advice, and streak continuity.

Evidence to use:

- rewritten daily notes with `# 식단`, meal lines, snacks, drinks, or diet
  streaks
- previous diet artifacts when extending streaks
- semantic search for `식단`, `아침`, `점심`, `저녁`, `디저트`, `밥`, `다이어트`

Artifact: `artifacts/diet/diet-dashboard.md`

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

### 운동관리 템플릿

Purpose: workout volume tracking and workout streak continuity.

Evidence to use:

- rewritten daily notes with `# 운동`, `운동 N일차`, home training, running, or
  route notes
- previous workout artifacts when extending streaks
- semantic search for `운동`, `홈트`, `뛰었음`, `streak`

Artifact: `artifacts/workout/workout-dashboard.md`

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

### Task 템플릿

Purpose: maintain a durable task board from daily notes.

Evidence to use:

- rewritten notes with `- [ ]`, `- [x]`, project notes, TODO sections, and
  repeated unfinished items
- previous task artifacts with include-artifacts retrieval
- semantic search for recurring tasks such as `캡디`, `녹강`, `알고리즘`,
  `정처기`, `백업`, `공유기`

Artifact: `artifacts/tasks/task-priority.md`

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

### Study 시나리오

Purpose: convert raw study drafts into organized rewritten knowledge notes.

Evidence to use:

- source notes about 자료구조, NLP, algorithms, Transformer, BERT, heaps,
  trees, references, or class notes
- semantic search over existing rewritten study notes to avoid duplicate pages

Primary output: `rewritten/YYYY-MM-DD/study.md`

Optional artifact: `artifacts/study/study-index.md`

Required rewritten sections:

- `# {{study_title}}`
- `## 정제된 핵심`
- `## 개념 정리`
- `## 예시 또는 적용`
- `## 복습 질문`
- `## Sources`

### 프로젝트/캡디 관리 시나리오

Purpose: track project progress, decisions, blockers, and next actions.

Evidence to use:

- rewritten notes mentioning `캡디`, backend, harness, MCP, CLI, knoter, LLM
  agent, code analysis, or implementation decisions
- existing project artifacts with include-artifacts retrieval
- semantic search for project terms before updating

Artifact: `artifacts/projects/capdi-project-status.md`

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

### 시험/진도 관리 시나리오

Purpose: track study progress against target counts and pacing.

Evidence to use:

- rewritten notes with progress expressions such as `52 / 205`, `74/206`,
  `최소 20섹션`, `정처기`, exam-day notes, and planned study amounts
- previous progress artifacts when extending the timeline

Artifact: `artifacts/progress/exam-progress.md`

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

### 아이디어/기획 정리 시나리오

Purpose: preserve loose ideas as a durable backlog without forcing immediate
execution.

Evidence to use:

- rewritten notes containing product ideas, Minecraft build ideas, automix/music
  ideas, infrastructure ideas, writing topics, or speculative plans
- existing idea artifacts before adding duplicates

Artifact: `artifacts/ideas/ideas-backlog.md`

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

### 일기/회고록 시나리오

Purpose: preserve personal reflections, mood, recurring desires, and lessons
without turning them into medical or psychological claims.

Evidence to use:

- rewritten notes with reflective prose, repeated `싶다` goals, motivation,
  frustration, diary entries, or life observations
- continuity over the previous 7 days
- semantic search for similar reflection artifacts before updating

Artifact: `artifacts/reflection/reflection-log.md`

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

## Output Contracts

### Rewritten Note Frontmatter

```yaml
---
title: "<human title>"
layer: rewritten
kind: "<daily|study|project|reflection|mixed>"
doc_date: <source-date>
source_path: "<source path>"
rewrite_agent: "<agent-name-or-runtime>"
rewrite_prompt_hash: "<stable prompt/version hash>"
---
```

### Artifact Frontmatter

```yaml
---
title: "<human title>"
date: <target-date-or-document-date>
layer: artifact
kind: "<artifact family>"
source_path: "<primary rewritten path or existing artifact path>"
artifact_template_id: artifact-workflow
artifact_operation: "create" # create | update
---
```

When updating an existing artifact, preserve useful existing structure and add
new dated entries instead of rewriting the whole document unless the document is
clearly inconsistent.

Suggested signal kinds for explicit external-agent output:

- `task`
- `workout`
- `daily`
- `area`
- `metric`

These are signal records, not global document type inference.

## Retrieval Notes

Default backend is SQLite FTS5 + zvec hybrid.

- Use rewritten notes as the primary retrieval layer.
- Source files are path evidence and should be opened only when rewriting or
  checking raw context.
- Use artifact-inclusive retrieval before extending durable dashboards.
- Use semantic/zvec search for loose concepts such as `좋은 질문`,
  `세계관`, `운`, `자동믹스`, `캡디`, or `Transformer`.
- Artifacts are excluded from default search unless include-artifacts is set.
- PageIndex is a future optional backend, not required for this template.
