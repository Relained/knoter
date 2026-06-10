---
id: artifact-workflow
name: knoter Artifact Workflow
version: 5
kind: artifact-set
locale: ko-KR
requiredSections:
  - Contract
  - Agent Procedure
  - Wiki Update Prompt
  - Scenario Templates
  - Output Contracts
  - Retrieval Notes
---

# knoter Artifact Workflow Template

> Bundled fallback template. Vaults should override it with `.kn/template.md`.
> External LLM agents combine this template with `kn report context` JSON and
> explicit `kn`/MCP retrieval before writing user-visible artifacts.
> `knoter` stores, validates, indexes, and retrieves documents; it does not
> generate prose in normal `kn` commands.

## Contract

Use source files, existing artifacts, and retrieval results as evidence.

Document layers:

- `source`: raw user files. These are evidence only and are not chunked or
  vector-indexed.
- `artifact`: durable agent-maintained documents under `artifacts/`. The
  `kind: llm-wiki` artifact is the long-term knowledge base and the default
  retrieval layer; scenario artifacts (dashboards, trackers, boards) hold
  temporary or task-shaped knowledge.
- `rewritten` (legacy): first-pass rewrites from the old pipeline. Existing
  rewritten notes stay indexed and default-searchable, but new work must not
  author rewritten notes.

Rules:

- Do not invent facts. Mark uncertain conclusions as inference.
- Preserve source lineage in frontmatter and in concrete claims.
- Use explicit `kind` only when the source/template supports it.
- Keep counts, dates, task states, streak values, names, and file paths.
- Prefer updating durable artifacts over creating duplicate documents.
- Integrate durable, public, permanent knowledge into the llm-wiki; route
  temporary or task-shaped evidence to scenario artifacts.
- Before creating an artifact, search the llm-wiki and, when needed, search
  all artifacts with `includeArtifacts`.

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
3. Search the llm-wiki and relevant existing artifacts before planning
   updates. Use zvec/semantic search when keyword search is too narrow.
4. Run the Wiki Update Prompt below to integrate durable knowledge from the
   source into `artifacts/llm-wiki.md`.
5. Choose one or more Scenario Templates below based on the evidence.
6. For each scenario, create or update the durable artifact under `artifacts/`.
7. Include source paths or chunk ids in claims that depend on specific evidence.

## Wiki Update Prompt

Use this prompt when integrating a source note into the llm-wiki knowledge
base.

```text
You are the knoter knowledge agent.

Input:
- source_path: {{source_path}}
- target_date: {{date}}
- current_wiki:
{{wiki_content}}
- source_content:
{{source_content}}

Task:
1. Identify durable, public, permanent knowledge in the source: project facts,
   long-term constraints, decisions, definitions, and recurring patterns.
2. Integrate that knowledge into the existing wiki structure. Update topic
   sections in place; create a new topic section only when no existing section
   fits.
3. Add one dated line to the Recent Updates section:
   `{{date}}: <what changed and why>`.
4. Do not copy temporary, task-shaped, or private content into the wiki; route
   it to scenario artifacts instead.
5. Do not add facts that are not in the source or the existing wiki.
6. Preserve existing wiki content that is unrelated to this update.

Output:
- Markdown only, the full updated wiki document.
- Include this frontmatter:
---
title: "LLM Wiki"
layer: artifact
kind: llm-wiki
source_note_id: "{{source_note_id}}"
source_path: "{{source_path}}"
artifact_template_id: llm-wiki
---
```

## Scenario Templates

Scenario templates live as per-artifact template files, one file per durable
artifact. Bundled defaults ship with the CLI (`cli/templates/`); a vault
overrides or extends them at `.kn/templates/<name>.md`. Read them with
`kn template list` / `kn template get <name>`; `kn llm rewrite` seeds every
effective template into the agent workspace under `templates/`.

A scenario is selected only when evidence supports it. The agent may update
multiple artifacts for one date. Each template file declares `kind`,
`templateId`, `artifactPath`, the required sections, and an output sketch;
write the artifact at its declared `artifactPath` and use its `templateId`
as `artifact_template_id`.

| Template | Artifact | Select when |
| --- | --- | --- |
| `llm-wiki` | `artifacts/llm-wiki.md` | Always for durable public knowledge (see Wiki Update Prompt) |
| `calendar` | `artifacts/calendar.md` | Date-anchored events, deadlines, refresh points |
| `todo` | `artifacts/todo.md` | Short-lived actionable items |
| `kanban` | `artifacts/kanban.md` | Staged work moving across columns |
| `diet-dashboard` | `artifacts/diet/diet-dashboard.md` | Meal lines, snacks, diet streaks |
| `workout-dashboard` | `artifacts/workout/workout-dashboard.md` | Workout volume, streak continuity |
| `task-priority` | `artifacts/tasks/task-priority.md` | Task checkboxes, TODO sections, repeated unfinished items |
| `study-index` | `artifacts/study/study-index.md` | Study drafts, class notes, concept material |
| `project-status` | `artifacts/projects/capdi-project-status.md` | Project progress, decisions, blockers |
| `exam-progress` | `artifacts/progress/exam-progress.md` | Progress counts and exam pacing |
| `ideas-backlog` | `artifacts/ideas/ideas-backlog.md` | Loose ideas and speculative plans |
| `reflection-log` | `artifacts/reflection/reflection-log.md` | Reflective prose, diary entries |

Templates marked `scaffold: true` in frontmatter (llm-wiki, calendar, todo,
kanban) are written as starter documents by `kn template scaffold`; the other
scenario artifacts are created by agents only when evidence supports them.

## Output Contracts

### Artifact Frontmatter

```yaml
---
title: "<human title>"
date: <target-date-or-document-date>
layer: artifact
kind: "<llm-wiki or artifact family>"
source_note_id: "<source note id>"
source_path: "<source path>"
artifact_template_id: <scenario id, llm-wiki, or artifact-workflow>
artifact_operation: "create" # create | update
---
```

### Legacy Rewritten Note Frontmatter

Old vaults contain rewritten notes with the frontmatter below. They stay
indexed and searchable, but do not author new rewritten notes; the contract
is artifact-first.

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

- Use the llm-wiki artifact as the primary retrieval layer; legacy rewritten
  notes stay indexed and remain part of default search.
- Source files are path evidence and should be opened only when integrating
  or checking raw context.
- Default search covers non-artifact layers plus `kind: llm-wiki` artifacts;
  set include-artifacts to widen to every artifact kind before extending
  durable dashboards.
- Use semantic/zvec search for loose concepts such as `좋은 질문`,
  `세계관`, `운`, `자동믹스`, `캡디`, or `Transformer`.
- PageIndex is a future optional backend, not required for this template.
