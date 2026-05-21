# knoter Daily Report Template

> Bundled fallback template. Vaults should override it with `.kn/template.md`.
> External LLM agents combine this template with `kn report context` JSON and write the final artifact. `knoter` itself does not generate prose in normal `kn` commands.

## Contract

Use the report context bundle as evidence.

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
- `artifact`: generated user-visible output, indexed but excluded unless `includeArtifacts` is true.

Do not invent facts. Mark uncertain conclusions as inference. Preserve source paths or chunk ids for concrete claims.

## Agent Procedure

1. Check `sourceInventory` for target-date evidence.
2. Use `rewrittenSources` and `retrieval.groups.date` for same-day facts.
3. Use `signals.tasks` for open/done/deferred todos.
4. Use `signals.workouts` and workout retrieval for exercise metrics.
5. Use `retrieval.groups.areas` for interest-area notes.
6. Use `continuity` for previous 7-day unfinished work and recurring routines.
7. Write a concise Markdown artifact under `artifacts/YYYY-MM-DD/`.

## Output Markdown

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

## Area Notes
### {{area_name}}
- {{fact_or_progress}} (source: {{path_or_chunk}})

## Workout
- {{exercise_type}}: {{count_or_volume}}
- Continuity: {{streak_or_gap_if_known}}

## Suggestions
1. {{practical_suggestion}}
2. {{follow_up_question_if_needed}}

## Sources
- {{path_or_chunk}}
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
- Artifacts are excluded by default.
- PageIndex is a future optional backend, not required for this template.
