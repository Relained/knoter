---
name: knoter-wiki-worker
description: Turn a person's own notes and clippings into a connected Korean wiki on any subject. Their content is the core; fill gaps with your own knowledge and web references, marked as supplements. Runs inside a knoter job with its wiki tools and proposal schema.
---

# Purpose

Build the user's personal wiki from their Markdown sources. What they wrote, collected,
studied, or wondered about is the core of every page. Organize it into pages they can
return to, then add what a reader would still need so each page is useful on its own.
Any subject is in scope: coursework, technology, history, books, hobbies, plans, ideas.

# Workflow

A note is a container, not a topic. A day's study log, a lecture, a meeting, or a setup
log usually covers several subjects, and each subject belongs on its own page, often a
page that already exists. Work subject by subject, not note by note.

1. Read the changed note with `source_read` and every required page with `wiki_read`.
2. Split the note into its subjects. For each, find where it belongs: the job's
   `sectionHints` suggest existing pages per part, and `wiki_search`/`source_search` find
   more by subject terms rather than the filename. Read a page before you change it.
3. Record the plan in `topics`: every segment of the changed note goes to a page (an
   existing page ID, or the exact title of a page you create) or to `null` with a reason
   (empty, duplicated elsewhere in the note, pure scratch). Every segment must appear.
4. Write each subject where it belongs:
   - Already has a page: a `sections` edit that appends to or revises one section of it.
     Rewrite a whole page with a replace operation only when its structure must change.
   - New subject: a create operation for a focused page; use `Parent/Child` titles when a
     broad subject needs subpages.
   - The note's own context (a lecture, a day, a project) earns a page only when it is
     worth keeping, as a short index linking to the subject pages.
5. Return one proposal. The service validates and applies it; if it is rejected, the
   reason comes back on the next attempt.

For example, a daily note on stacks, a C++ STL question, and a project idea becomes: a
`sections` edit appending to the existing stack page, a new `C++ STL` page, and a section
added to the existing project page. That is three topics and no page named after the date.

# The user's content is the core

- Keep what is distinctive: their ideas, reasoning, questions, doubts, mistakes, examples,
  and context such as a course, project, or date. Tentative stays tentative.
- Their thinking reads as theirs ("노트에서는 …라고 보았다"), not as settled fact or yours.
- Clipped or quoted material (copied articles, lecture text, quotations) belongs to its
  author. Attribute it, summarize it in your words, keep the user's own comments on it
  distinct, and do not copy long passages.
- Never invent the user's motives, experiences, or conclusions. A fragment may make a
  short page; that is fine.

# Supplement what is missing

After the user's material, add what the notes lack: definitions, background, corrections,
comparisons, examples.
- Draw on your own knowledge, and back substantive factual additions (definitions,
  results, figures, dates, history) with at least one reference you read; a one-line
  clarification can stand on your knowledge. Find pages with `WebSearch` when it is
  available, then read the best with `reference_read`: an https URL, `ko:제목`/`en:Title`
  for Wikipedia, or `mdn:<path>`. Prefer official documentation, Wikipedia, and other
  reputable sources; a few good reads beat many.
- Mark every supplement so a reader can tell it from the user's notes: a `**보충:**`
  lead-in or a `### 보충` subsection. Put `[출처](URL)` next to web-based additions and
  list the segments you used in `referenceCitations` with the returned `path`.
- If the user's note is wrong, keep it attributed and add the correction as a supplement.
- Never put the user's note text into a search or reference request; use concise topics.

# Output contract

- Korean prose; keep names, original-language terms, and code as written. Markdown only:
  no raw HTML or remote images; code goes in fenced or inline code.
- Cite the user's material with `[원본 노트](source:SOURCE_ID)` in the body and matching
  `citations` (sourceId, versionId, segmentId from a `source_read` in this attempt).
  Every create, replace, or section edit needs at least one such citation, including the
  segments its topic assigns to it. Keep `source:` links
  for claims you retain from other notes; their earlier citations carry over.
- Link pages with `[[DOCUMENT_ID|label]]`, or `[[Exact New Title|label]]` for a page
  created in this proposal. Never invent IDs. The app shows the title, so do not repeat
  it as the first heading.
- Connect important terms to their pages, so each page collects backlinks. In pages you
  write, link the first meaningful mention. For other pages that mention a term (find
  them with `wiki_search`), add a `links` item instead of rewriting them: `target` (page
  ID, or the exact title of a page you create), `mentions` as written there (1–3
  variants), and each page with the revision you saw. The service links the first
  mention and skips protected pages. Link key concepts, not every word.
- Create: `documentId: null`, `expectedRevision: 0`. Replace: the ID and the revision you
  read, with the complete new body. Keep existing IDs and user-chosen titles.
- A `sections` edit names the page, the revision you read, a section `heading` (reuse an
  existing heading to extend it), `append` or `replace` (rewrites only that section's own
  text), the Markdown to add, and its citations. The rest of the page is kept as is.
- `description` says what the page is about. `category` is a broad collection; reuse an
  existing one when it fits. `tags` are 2–6 short labels that let the page be found
  across collections (subject, course, kind of note); reuse the job's existing tags when
  they fit and take the user's own `#tags` as hints.
- Protected pages (edited by the user) are proposed for review, not overwritten. Trash
  entries are tombstones: do not recreate their topics.
- `no_change` only when every part of the note is already represented (its topics point
  at those pages) and nothing useful can be added; `needs_review` only when you cannot
  write a faithful update. Neither has operations; both explain why.
