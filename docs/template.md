---
id: artifact-workflow
name: knoter Artifact Workflow
version: 2
kind: artifact-set
locale: ko-KR
requiredSections:
  - Contract
  - Agent Procedure
  - Artifact Planning
  - Output Contracts
---

# knoter Artifact Workflow Template

> Bundled fallback template. Vaults should override it with `.kn/template.md`.
> External LLM agents combine this template with `kn report context` JSON and
> additional `kn`/MCP retrieval before writing or updating user-visible
> artifacts. `knoter` itself does not generate prose in normal `kn` commands.

## Contract

Use the report context bundle and explicit database retrieval as evidence.

Required context fields:

- `date`
- `timezone`
- `template`
- `sourceInventory`
- `rewrittenSources`
- `dailyNotes`
- `signals`
- `continuity`
- `retrieval`

Document layer rules:

- `source`: user raw files, path reference only, not chunked/indexed.
- `rewritten`: external-agent rewritten source, primary retrieval layer.
- `artifact`: generated or maintained user-visible documents, indexed but
  excluded unless `includeArtifacts` is true.

Do not invent facts. Mark uncertain conclusions as inference. Preserve source
paths or chunk ids for concrete claims. Prefer updating a durable artifact when
the new evidence extends an existing user-facing document.

## Agent Procedure

1. Read this template and the `kn report context` bundle.
2. Inspect `sourceInventory` for target-date evidence and source lineage.
3. Use `rewrittenSources`, `dailyNotes`, `signals`, and `retrieval.groups.date`
   for same-day facts.
4. Use `continuity` for previous 7-day unfinished work, recurring routines, and
   documents that likely need continuation.
5. Search the database through available `kn` or MCP retrieval tools before
   deciding final outputs:
   - search rewritten notes for task/workout/wiki/domain terms
   - search with artifacts included when checking whether an existing artifact
     should be extended
   - retrieve candidate existing artifact documents before modifying them
6. Build an artifact plan. The plan may contain zero, one, or many output
   documents.
7. For each planned output, decide whether to create a new artifact or update an
   existing artifact. Write only evidence-backed content.
8. Save generated/updated Markdown under `artifacts/` with valid frontmatter.

## Artifact Planning

The final output is not necessarily one daily report. It can be a one-to-many
set of artifacts, and some entries may be continuations of existing documents.

Use these common artifact families when evidence supports them:

- `daily-report`: concise daily summary and next actions
- `task-list`: todo/tasks document, often extended across days
- `workout-log`: workout history suitable for graphs and trend extraction
- `morning-brief`: a short evidence-aware sentence that helps the user start
  the day with courage
- `personal-wiki`: durable personal knowledge pages
- `area-note`: project or interest-area note such as `knoter`, `llm-wiki`, or
  study notes

Prefer continuation when:

- an existing artifact has the same durable subject, such as a personal wiki
  page or long-running task list
- the new evidence adds entries to a graph/log/timeline
- the output would duplicate a document already present in artifact retrieval

Prefer a new artifact when:

- the subject is date-specific and not a durable page
- no existing artifact can be found with artifact-inclusive retrieval
- the template or evidence clearly requests a separate document

## Output Contracts

Each artifact file must include frontmatter:

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

### Daily Report

```markdown
# Daily Report: {{date}}

## Summary
- {{one_sentence_summary}}
- {{main_risk_or_gap}}
- {{recommended_next_action}}

## Today Done
- {{completed_item}} (source: {{path_or_chunk}})

## Open Tasks
- [ ] {{open_task}} (source: {{path_or_chunk}})

## Deferred Or Blocked
- {{blocked_item}} - {{reason_if_known}} (source: {{path_or_chunk}})

## Sources
- {{path_or_chunk}}
```

### Task List

```markdown
# Tasks

## Open
- [ ] {{task}} (source: {{path_or_chunk}})

## Done
- [x] {{task}} (source: {{path_or_chunk}})

## Deferred
- [ ] {{task}} - {{reason_if_known}} (source: {{path_or_chunk}})
```

### Workout Log

```markdown
# Workout Log

## {{date}}
- {{exercise_type}}: {{count_or_volume}} (source: {{path_or_chunk}})

## Graph Data
~~~json
[
  { "date": "{{date}}", "exercise": "{{exercise_type}}", "value": "{{count_or_volume}}" }
]
~~~
```

### Morning Brief

```markdown
# Morning Brief: {{date}}

{{one_or_two_sentences_based_on_recent_context}}

Sources: {{path_or_chunk}}
```

### Personal Wiki Or Area Note

```markdown
# {{durable_subject}}

## Current Understanding
- {{fact_or_progress}} (source: {{path_or_chunk}})

## Updates
### {{date}}
- {{new_information_or_refinement}} (source: {{path_or_chunk}})
```

## Rewritten Source Guidance

When an external agent rewrites source material, the result should:

- use frontmatter `layer: rewritten`
- keep explicit `kind` only when source evidence supports it
- normalize headings, timestamps, tasks, workouts, and source references
- preserve source path/id lineage
- avoid summarizing away counts, dates, task status, or names

Suggested signal kinds for agent output:

- `task`
- `workout`
- `daily`
- `area`
- `metric`

These are signal records, not global document type inference.

## Retrieval Notes

Default backend is zvec + SQLite FTS5 hybrid.

- CJK chunking uses sentence boundaries and smaller chunks.
- Short CJK keyword fallback exists for 1-2 character terms.
- Artifacts are excluded by default; include artifacts when checking whether to
  continue an existing user-facing document.
- PageIndex is a future optional backend, not required for this template.
