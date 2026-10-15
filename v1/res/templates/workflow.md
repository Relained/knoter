---
id: artifact-workflow
name: knoter Artifact Workflow
version: 7
kind: artifact-set
locale: ko-KR
---

# knoter Artifact Workflow

> This file is seeded into every vault at `templates/workflow.md`. Edit it to
> customize how the agent maintains this vault. The sync runner passes queued
> source changes to the agent; the agent works directly on the vault files in
> the working directory.

## Vault Layout

- `sources/`: raw user files. Evidence only — never modify or delete them.
- `artifacts/`: durable agent-maintained documents. Each artifact `.md` keeps
  an HTML display next to it (same path with `.html`).
- `templates/`: this contract plus per-artifact templates (`<name>.md` with a
  default `<name>.html` display). Read them before writing artifacts.
- `.db/`: knoter index storage. Never touch anything inside it.

## Contract

Use source files, existing artifacts, and search results as evidence.

- Do not invent facts. Mark uncertain conclusions as inference.
- Preserve source lineage in frontmatter and in concrete claims.
- Keep counts, dates, task states, streak values, names, and file paths.
- Prefer updating durable artifacts over creating duplicate documents.
- Integrate durable, public, permanent knowledge into the llm-wiki; route
  temporary or task-shaped evidence to scenario artifacts.
- When a queued source was deleted, update or delete the artifacts (and HTML)
  that depended on it.

## Agent Procedure

1. The work prompt lists queued source changes (added / updated / deleted).
2. Read each changed source file. For context, search the index:
   - `kn search "<query>"` — semantic+keyword over the llm-wiki (default)
   - `kn search "<query>" --scope artifacts|sources|all --mode keyword`
3. Update `artifacts/llm-wiki.md` with durable knowledge from the sources
   (see Wiki Update Rules below).
4. Create or update scenario artifacts justified by the evidence, following
   the matching template in `templates/`. Write each artifact at the
   `artifactPath` declared in its template frontmatter.
5. Maintain each touched artifact's HTML display (see HTML Display Contract).
6. Do not write outside `artifacts/`. Do not modify `sources/`, `templates/`,
   or `.db/`.

## Wiki Update Rules

`artifacts/llm-wiki.md` is the long-term knowledge base and the only
semantically indexed document.

1. Identify durable, public, permanent knowledge in the sources: project
   facts, long-term constraints, decisions, definitions, recurring patterns.
2. Integrate it into the existing wiki structure. Update topic sections in
   place; create a new topic section only when no existing section fits.
3. Add one dated line per run to the Recent Updates section:
   `<date>: <what changed and why>`.
4. Do not copy temporary, task-shaped, or private content into the wiki;
   route it to scenario artifacts instead.
5. Preserve existing wiki content that is unrelated to this update.

## Artifact Templates

| Template | Artifact | Select when |
| --- | --- | --- |
| `llm-wiki` | `artifacts/llm-wiki.md` | Always for durable public knowledge |
| `calendar` | `artifacts/calendar.md` | Date-anchored events, deadlines, refresh points |
| `todo` | `artifacts/todo.md` | Short-lived actionable items |
| `kanban` | `artifacts/kanban.md` | Staged work moving across columns |

Beyond the bundled set, create a new scenario artifact only when the evidence
clearly justifies a durable document; declare a stable
`artifact_template_id` and keep one document per purpose.

## HTML Display Contract

Every artifact keeps a purpose-fit HTML display the user opens in the
workbench:

- Path: the artifact path with `.md` replaced by `.html`
  (`artifacts/llm-wiki.md` → `artifacts/llm-wiki.html`).
- Create the HTML when the artifact is created; update it whenever the
  artifact content changes; delete it when the artifact is deleted.
- Start from the template's default HTML (`templates/<name>.html`) and keep
  its structure; fill it with the artifact's current data.
- HTML is rendered in a sandboxed view: self-contained markup and inline
  styles only — no `<script>`, no iframes, no inline event handlers, no
  external loads.

## Artifact Frontmatter

```yaml
---
title: "<human title>"
date: <document-date>
layer: artifact
kind: "<llm-wiki or artifact family>"
source_path: "<source path this update drew from>"
artifact_template_id: <template id>
---
```

When updating an existing artifact, preserve useful existing structure and
add new dated entries instead of rewriting the whole document unless the
document is clearly inconsistent.
