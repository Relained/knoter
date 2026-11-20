# Wiki-worker demo: failures and verification limits

This is the canonical native-demo failure record, consolidated on 2026-09-18.
It preserves observations, causes, remedies, and unresolved limits rather than a
completed-feature checklist. Dates use Asia/Seoul; attempt timestamps in the local
database use UTC. Keep source bodies, credentials, and private runtime artifacts
out of this document.

The [demo plan](../plan/wiki-worker-demo.md) owns scope and user decisions;
the [V2 README](../../v2/README.md) owns setup and operation. Browser-preview
failures remain in that README and do not establish native-platform behavior.

## Writing intent and preservation

### 2026-09-18 — A source summary was not a useful reference wiki

The initial skill required concise, source-only prose. The HTML result compressed
the learning note and omitted the lookup structure the user wanted. The user
requested an HTML hub, attribute/element subtopics, and named entries such as
`href` and `src`, with official evidence for factual supplementation.

The writing contract now permits topic hierarchies, lookup headings, and separate
official citations. This is a content-quality requirement: valid JSON and valid
citations do not establish that an article is useful or complete. The original
source must remain available when the wiki reorganizes its contents.

### 2026-09-18 — The reference-writing prompt overfit HTML

The skill and invocation prompt then treated reference articles as the universal
outcome. The user clarified that original ideas, interpretations, hypotheses,
experiences, questions, and exam notes also belong in the wiki. A single source
can contain several of these; neither a fixed template nor a hierarchy is
mandatory. Personal authorship can be supported by the original note without
external corroboration. That does not establish its factual claims as true.

Both prompts now instruct the worker to preserve authorship, distinctive
reasoning, uncertainty, problem conditions, and recorded solutions or mistakes.
The worker must not invent the user's motivation, experience, reasoning, official
answers, or exam coverage. A general
concept page must not absorb the context of a personal idea or a specific problem.
HTML remains an example. MDN is a retrieval limit, not a restriction on subjects
allowed in the wiki. These decisions are retained in D11–D13 of the demo plan.

### 2026-09-18 — Unverified thinking was silently omitted

An intermediate disposable mixed-note run omitted a claim the source had
explicitly set aside and the reason for setting it aside. Avoiding unsupported
facts must not erase the user's thinking process. The skill was refined to retain
such material as an attributed uncertainty or rejected premise. A subsequent
synthetic run retained it alongside the idea and exam reasoning without official
citations. This small walkthrough is not a general semantic-quality evaluation.

## Evidence, syntax, and tool failures

### 2026-09-17 — Codex evidence tools disappeared

Disabling `code_mode_host` also hid explicit MCP tools in CLI 0.154.0. The first
missing-evidence result was rejected. Keeping that host available while disabling
code mode and exposing only the wiki namespace restored the evidence bridge.
Revalidate the actual tool surface before changing CLI versions; a configuration
setting alone is not evidence that all unwanted tools are inaccessible.

### 2026-09-17 — Inline citations lost their targets

The Markdown reader stripped the worker's `source:` URI. It now maps only UUID
source targets to the internal citation button and retains the default URL
sanitizer for other links. Preserving a displayed citation label without a usable
target is not sufficient evidence navigation.

### 2026-09-18 — The HTML source produced no linked wiki

Two real proposals were rejected because a regex treated inline HTML tag examples
as executable markup. A later unrelated-topic `no_change` was accepted and the
source appeared Connected with zero notes. Markdown syntax validation now permits
inert inline/fenced code while continuing to reject raw HTML and unsafe content.
The skill requires supported new topics, unlinked no-change results require
review, and Jobs exposes reasons and retry actions. Previously rejected proposals
were checked against frozen evidence in a disposable backup copy.

The no-linked-wiki guard catches an empty outcome, not inadequate coverage inside
an already linked article. That semantic limit remains relevant to retries below.

### 2026-09-18 — A generated citation combined two UUIDs

A retry proposed an HTML topic but mixed a source ID into its version ID. The
read-evidence guard rejected it. Each attempt's output schema now enumerates its
frozen source/version IDs; pair, segment, and actual-read checks remain mandatory.
Do not repair a model proposal by bypassing these checks or writing the live DB.

### 2026-09-18 — Official-reference validation failed and later recurred

The first reference rewrite fetched the attributes page but cited unread element
pages, omitted a visible official link, and kept a parent title inconsistent with
child paths. The result was rejected. Parent existence and per-attempt reference
checks remain mandatory; retry prompts include the prior validation error. Title
links in wiki and Markdown syntax are normalized to stable IDs.

During the later four-source reprocessing with the generalized prompt, the first
exam-note attempt again fetched the attributes page while proposing unrelated
HTML replacements that cited unread element pages. It failed with
`Official citation was not read in this attempt.` No operations from that attempt
were applied. Reprocessing eventually produced an exam wiki without official
supplements; the guards were not relaxed. The recurrence shows that prompt
instructions and one successful retry do not eliminate fabricated attribution.

Every official citation needs a successful read of that exact page in the same
attempt, matching segments, and a visible canonical link near the explanation.
An old wiki citation or a link inside another reference is not such a read. MDN
repository macros remain unexpanded; their rendered contents cannot be inferred.
Structural checks do not verify whether each cited passage supports each claim.
General web research and non-MDN reference providers remain unimplemented.

### 2026-09-18 — An array literal broke a new title link

A synthetic mixed-note walkthrough placed a bracketed array in a new title and
emitted malformed wiki-link syntax. Validation withheld the proposal. The skill
now keeps literal arrays/code in the body and uses unambiguous titles for new
links; existing titles can be linked by ID. This is prompt guidance, not proof
that arbitrary generated links will be valid.

### 2026-09-18 — A retry attempted an unexpected MCP tool

The first reading-method attempt reported `wiki.read_mcp_resource` after allowed
source/wiki reads. The runner terminated it with `Unexpected worker tool.` A
manual retry used the permitted tools and returned `no_change`; the allowlist
was unchanged. The record establishes detection and termination, not that the
unexpected call could never be attempted. Its underlying model/tool-selection
cause was not resolved by the retry and remains a regression case.

## Reprocessing and completion reporting

### 2026-09-18 — A backup did not fulfill the regeneration request

The first bulk execution was blocked by the host's automatic approval review,
which required authorization covering all four source payloads and related wiki
content sent through the connected Codex CLI/ChatGPT path. A local backup was
created, but generation had not started. After the destination and data scope
were disclosed and the user instructed execution again, the same action was
authorized and ran. This was an orchestration constraint, not a product failure.
Preserve that authorization for the disclosed scope; do not substitute backup
completion for the requested wiki work or repeatedly request the same permission.

### 2026-09-18 — Reprocessing was not a forced rewrite of every note

The four-source run used the installed generalized prompt from commit `185a004`,
CLI 0.154.0, and `gpt-5.6-luna` with low reasoning. It demonstrated a limit of the
current retry semantics: a new attempt can return `no_change`, or update another
source's topic from the frozen workspace evidence, without rewriting the topic
that triggered the job.

In this run the HTML-triggered job created the exam-note wiki and retained the
three existing HTML pages. The exam job then returned `no_change` because that
wiki already existed. The reading-method retry also returned `no_change`. The
recall-observation job produced a replacement proposal adding the source's
fictional-demo context to the shared reading wiki. Its human-edit protection
kept that proposal pending; it was not automatically accepted.

This is evidence against reporting “all four wikis regenerated.” Only one new
wiki was committed; the HTML pages and protected reading body were unchanged.
Three jobs ended in `succeeded` and one in `needs_review` for a valid protected
proposal. A successful job is not proof of a new revision, faithful coverage, or
a change to its triggering source's topic. Inspect the operations and affected
document IDs as well as the job status. Generation scope across sources and
consistency of the model's no-change judgments remain unresolved quality concerns;
no forced rewrite mode was added during this run.

The installed app displayed the new exam wiki with its source and wiki links.
Original-file hashes and the protected document remained unchanged, and stored
wiki links had existing targets. These checks do not certify completeness of the
generated explanations. The exam code was not executed or independently checked
against language specifications, and no non-MDN official research was performed.
The pending reading proposal was inspected but its acceptance was not exercised.

## Claude Code worker (D14)

### 2026-10-16 — Claude Code rejected the proposal schema

The first real Claude Code 2.1.300 attempt exited with code 1 within a second and
was recorded only as a generic CLI failure; the job moved to `needs_review` and the
connection to `incompatible`. Raw CLI diagnostics are intentionally not persisted,
so the cause was found by repeating the same invocation in a disposable directory:
`--json-schema` refused the draft 2020-12 meta-schema reference that Zod emits.
Claude now receives the same constraints rendered as draft-07, including UUID
formats; Codex still reads the 2020-12 file. A generic CLI error does not show
which flag failed, so reproduce the exact invocation before changing arguments.

### 2026-10-16 — Scope of the Claude Code verification

A disposable workspace ran the packaged backend and bundled Node from a terminal,
not from the LaunchAgent, with `claude-sonnet-5-5` at medium effort. A Korean HTML
note produced a hub and two subtopics with source and MDN citations in about 30
seconds. Editing that note kept the existing IDs, revised the hub, and added a new
subtopic. Attempts recorded only the four wiki evidence tools, and the per-attempt
MCP configuration was removed afterward. Synthetic events confirmed that exposed
built-in tools, missing or extra MCP servers, older versions, unexpected tool use,
and server tools stop an attempt, and that 401/404/529 map to AUTH/MODEL/TRANSIENT.
Claude Code updated itself from 2.1.294 to 2.1.300 during the session; the kept
launcher path remained connected.

Not established in that run: keychain login access from the LaunchAgent and the
native chooser returning the unresolved launcher path (both checked below);
whether a CLAUDE.md in the attempt directory's parents would be loaded (none
existed on the test machine); and a Codex run after the shared runner refactor.
The installed Codex 0.162.1 does not match the pinned 0.154.0, so its connection
reports `incompatible`.

### 2026-10-16 — Installed-app check through the LaunchAgent

The packaged build was installed in `~/Applications` and driven through its UI
against the real workspace, using a disposable one-note folder. Enable background
reported `local_agent_running` with a service PID. The chooser's Go to Folder
suggested the Caskroom target, but the app kept and displayed
`/opt/homebrew/bin/claude` and reported `Claude Code · ready`. The LaunchAgent
service then completed a `claude-sonnet-5-5` attempt in about 20 seconds using
only `source_read`, `wiki_search`, and `reference_read`. Jobs showed `Wiki updated`,
and the new document carried source citations. Keychain login therefore works from
the LaunchAgent on this Mac with Claude Code 2.1.300 and a claude.ai login. This
does not cover other login methods or the state after logout or reboot.

With the Korean input source active, ⌘⇧G did not open Go to Folder in the
chooser, but typing `/` did. A folder registered by mistake could be removed only
through the service's `removeWatch` command, because the UI has no control for it.

### 2026-11-20 — A long note reached the worker as a 2 KB preview

A lecture note of 651 segments (51,610 characters, 67 KB) waited in Review: the
worker declined it because it had seen only segments s1–s11. Claude Code saves any
MCP text result longer than 50,000 characters to a file and leaves the model a path
and a 2 KB preview, and this worker has no file tools. `source_read` returns the
whole note in one result, here about 108,000 characters. More than half of that is
JSON around the text: a segment ends at every blank line, and each repeats its
heading and line numbers. `MAX_MCP_OUTPUT_TOKENS=80000`, set on 2026-10-16 for this
purpose, does not move that threshold.

The bridge now declares `_meta["anthropic/maxResultSizeChars"]` at the CLI's ceiling
of 500,000 on `source_read`, `wiki_read`, and `reference_read`.

Limits: only the built bridge's tool list was checked. No worker job ran after the
change, so whether this note now completes within one run (5 minutes, 12 page
changes, every segment assigned) is unobserved. The ceiling is not a guarantee: a
256 KiB note of 2,000 segments with long headings or heavy escaping can still pass
500,000 characters and would again arrive as a preview. Reading in pages with each
heading sent once, and splitting a long note across runs (P1 of the plan), were not
built. Codex was not checked; the installed 0.162.1 is not the pinned version.
Answering the Review card with feedback cannot help a note that was not read.

## Personal-wiki redesign (D12–D20)

### 2026-10-16 — Migrated tables broke positional inserts

The schema 2 migration added columns to `sources` and `documents`. Inserts that
relied on column order then failed. The service reported only a generic
`INVALID_REQUEST`, so a disposable run showed every snapshot failing with no cause;
a minimal snapshot narrowed it down. Inserts into migrated tables now name their
columns. A migration check that only opens a copied database does not exercise
writes.

### 2026-10-16 — Korean output was corrupted at stdout chunk boundaries

Claude Code's stream-json output was decoded one stdout chunk at a time, so a
multi-byte character split between chunks became U+FFFD in a proposal. One
disposable revision was affected; none of the 22 revisions in the installed
workspace were. The worker now uses a streaming UTF-8 decoder, and the 51-note run
below had no U+FFFD.

### 2026-10-16 — The raised daily limit was missed in reserve()

Phase 0 raised the limit to 200 in `startAttempt` but not in `reserve()`, which
still compared with 20. From the 21st run, jobs were deferred to the next day
while the UI showed 20 of 200. Both paths now use `DAILY_RUN_LIMIT`. Grep for
literals when a constant replaces them.

### 2026-10-16 — Every job wrote exactly one page per note

Across the disposable runs, each job returned one operation: a new page for the
note itself. No job updated an existing page or split a note. Coverage was partial.
`2026-03-18.md` cited 4 of 12 segments in one combined page, `Arch Linux 초기
설치.md` cited 14 of 29, and `fzf&rg&bat.md` became one page for three tools. Under
the earlier skill and Codex, the installed workspace split `2026-03-11.md` into an
update and two new pages, but most jobs there were also single-operation. Causes:
note-centred jobs and hints, whole-body rewrites as the only way to update a page,
no check that every part of a note was placed, and whole-proposal rejection on
any title or parent conflict. The user prioritised fixing this (topic plan,
section edits, splitting workflow, per-part hints).

### 2026-10-16 — Multi-topic notes after the topic plan, section edits, and glossary

With the topic plan (D21), every segment of nine multi-topic notes was placed.
Notes became two to four pages instead of one. Routing into other existing pages
stayed at zero until the hints changed. The first per-part hints scored raw
substrings, so long pages such as `Arch Linux 초기 설치` and `zsh & oh-my-posh` were
offered for C++, capstone, and machine-learning parts alike. Hints now come from
glossary terms (page titles, their parenthesised parts, and declared aliases),
then from rare words in page titles only, with Korean particles stripped and
English matched as whole words. With these hints:
- `2026-03-19.md` added a section to the existing capstone page.
- `기계학습/4강.md` added a section to the existing `Support Vector Machines` page,
  leaving the rest of the page and its citations intact.
- Glossary linking added links in four other pages without a model run.

Remaining limits:
- Daily and exam notes still often create a page per subject even when related
  concept pages exist.
- A note-context page such as `자료구조 중간고사 메모 (2026-04-09)` can appear.
- The glossary links by surface form: `매개변수` in an SVM page linked to the C++
  parameter page.
- The staged loop (session cards, flow, separate routing call) is deferred by the
  user in favour of refining this single call.

### 2026-10-16 — Scope of the redesign verification

Disposable workspaces with Claude Code 2.1.300 (`claude-sonnet-5-5`), driven
headlessly over the service socket and through the development desktop app:
- **Search-based attempts:** attempt context was about 0.4 KB; it had been the
  whole corpus.
- **Supplements:** a hub with subpages was built from Obsidian links via search
  hints. Wikipedia-backed supplements were marked 보충, stored their segments, and
  showed provider and licence in the UI. General web reads and refusals of local
  and private addresses were exercised directly as well as by the worker.
- **Removal:**
  - a single-source page moved to Trash without a model run;
  - a protected page became a proposal, which was accepted;
  - 11 of 12 notes vanishing at once were held for Retry;
  - a moved file kept its identity;
  - a restored file brought its page back.
- **Tags and links:** tags were applied on create and update. Link insertion handled
  Korean particles, and backlinks and the tag filter rendered in the app.
- **51-note subset** (copies of `NOTES/Linux` and `NOTES/지식`):
  - 48 pages, 22 inserted links, 16 references (8 Wikipedia, 8 web), one empty note
    closed without a run;
  - attempts took 15 s on average and 30 s at most;
  - copied originals were unchanged.
  - Two jobs went to review. One proposal copied a note's `[[Dependency Injection]]`
    link to a page that does not exist and was rejected whole. A note holding only
    one link was declined.

Not established:
- WebSearch was never invoked; the worker passed URLs and Wikipedia titles straight
  to `reference_read`, so its availability for this account is unconfirmed.
- `source_search` was unused.
- Codex web search (installed 0.162.1, pinned 0.154.0).
- The full 348-note run.
- The packaged app under the LaunchAgent with these changes.
- Content quality beyond spot checks.

## Side chat (D22)

### 2026-10-16 — Scope of the side-chat verification

Before `dev`'s personal-wiki redesign was merged, a disposable workspace created
by the pre-chat service (schema 1) opened under the chat build and migrated with its source, queued job, and manually
edited note intact. With the development service, development Electron, and Claude
Code 2.1.300, real replies covered: a Haiku 5.5/low question with no changes; a
Sonnet 5.5/medium edit of a mentioned note that cited the request and carried the
note's existing source citations; an attachment that became a new note and a cited
`chat` source; a protected note left unchanged until mentioned; a second send
rejected while a reply ran; a stopped reply and a service killed mid-reply, both
applying nothing. A background job on the same build still succeeded after the
worker's process launch and evidence reads moved into shared modules. One Electron
turn combined a typed mention, the open-note chip, and a dropped attachment
through IPC.

The model followed the protection rule itself, so the service's rejection of an
unmentioned protected target and of an unread replacement were not triggered by a
live reply. Codex chat replies were not run: the installed Codex was 0.162.1,
while the demo requires 0.154.0. Its catalog parser was checked only against
0.162.1's `debug models`; whether 0.154.0 provides that command is unknown, and
the verified model is used if it does not. The packaged app and LaunchAgent, the
OS file chooser (the drop was synthetic), Opus/Fable, `xhigh`/`max` effort, and
answer quality beyond this small corpus were not exercised. As with the worker,
a CLI orphaned by a killed service keeps running until it exits, but its expired
capability can no longer read evidence or apply changes.

A Sonnet reply wrote `**"매주 수요일"**로`; the reader showed the asterisks
because CommonMark does not close emphasis between a quote and a following Hangul
particle. The same day the reader gained CJK-friendly emphasis and TeX math, and
the editor stopped escaping both on save; the browser failure table in the V2
README records the cause and retest. Dev Electron rendered both from `file://`
with KaTeX fonts loaded; the packaged app was not rebuilt for this check.

### 2026-10-16 — The installed build used another schema 2

Before installing, the live workspace reported schema 2, but its tables were `dev`'s
redesign (`sources.missing_since`), not the chat tables this branch had numbered 2.
The installed app had been built from that newer `dev`. Installing the branch alone
would have skipped the chat migration on that database and failed at startup, and
dropped the redesign. `dev` was merged first; the chat migration became schema 3,
and the chat was rebuilt on its search-based evidence reads and section edits.
Check `PRAGMA user_version` and the tables of the live workspace before replacing an
installed build, and number new migrations after the base branch's.

On the merged build, a fresh disposable workspace ran one worker job and the same
Claude Code chat scenarios as before (question, mentioned edit as a section edit,
attachment to a new page, protection with and without a mention, stop); all behaved
as designed. A Haiku reply linked a page as `[title](wiki:ID)`, which the reader
drops; such links are now rewritten to the app's page address. An online SQLite
copy of the live workspace migrated from schema 2 to 3 with its 66 pages, 349
sources, and queue unchanged; no model was called on that copy, and it was deleted.

The packaged merge was then installed in `~/Applications` following the replacement
steps: a full backup through the old service, **Disable service**, the old bundle
moved aside, the new bundle copied, and the LaunchAgent registered again. The service
started without the stale-lock failure, migrated the live workspace to schema 3 with
the same counts, kept the worker paused, and listed the Claude Code chat models. The
app UI and a chat reply on the live workspace were not exercised.

## Workspace UI rewrite and supplement ratio (D23)

### 2026-10-16 — Scope of the UI-rewrite verification

Electron 44.4.1 ran from `npm run check` output on Linux under Xvfb with openbox,
against a development service with a disposable workspace and Markdown folder; it
was not the packaged macOS app. The frameless window, knoter's window controls,
maximize/restore, rejection of an invalid window command, and switching between
knoter's and the system title bar (the window is replaced and the preference
persists) behaved as intended. Bare Xvfb ignored maximize until a window manager
ran: maximize is a window-manager request, so a missing one looks like a broken
button. The Sources and Agent windows showed the real watch, queued sources, and
service state. macOS traffic-light placement and Windows were not exercised.

No worker CLI was available, so no worker job or chat turn ran. The supplement
ratio reaching the job and turn data, and the skill's balance rule, were checked by
reading the code and building, not by an attempt; whether pages follow the ratio
is unmeasured. A rewrite re-cites the notes behind a page, so it depends on the
chat reading those versions; a page whose notes were all removed cannot be
rewritten with citations.

### 2026-10-30 — A drag moved the whole graph, and new layouts appeared already formed

The user asked for Obsidian's drag, where the dragged note's neighborhood follows by
rule, and for a new graph to be built before the view is set. Causes found:
- **Inverted link bias.** Each link moved its busier end more, the reverse of d3, so
  leaves dragged central notes around; central notes settled 1.9–3× off their ring.
- **Unconverged layouts.** The 300-tick cooling stopped short of equilibrium: reheating
  a settled 120-note layout with nothing dragged moved notes 93 units on average and
  turned the disc about 5°. A drag reheated everything, so unrelated notes moved about
  as far as linked ones (101 vs 80 units for a 300-unit drag).
- **Built before shown.** Layouts were computed synchronously and then shown, so small
  graphs had one frame of motion, and the camera was fit to the unfinished layout and
  again when it settled.
- **Smaller defects.** A Link slider above about 2.2 made fresh layouts diverge.
  Dragging the focus of a local graph kept the simulation running forever. Panning
  swallowed the next keyboard Enter on a note. Reordered notes or links counted as a
  new structure and restarted the layout.

Remedies: d3's link bias, and link strength capped at 1. During a drag, and while
added notes settle in, each note's motion is scaled by its link distance from the
dragged or added notes (1, 0.7, 0.4, 0.2 for one to four links, 0 beyond), or by
nearness to the drag. A new layout is drawn at a fifth of its size and unfolds over
1.1 s while notes fade in by ring; the camera is fit once it cools. Layouts, cameras,
and still-settling notes are kept across remounts; a quick remount after a note was
added had otherwise reheated the whole graph. The structure key is order-independent.

Measured on a synthetic 120-note demo wiki in offscreen Electron 44.4.1 against the
Vite preview on macOS, with real mouse events. A 279-unit drag of the core moved notes
one link away 214 units on average, then 107, 64, and 16 by link distance, and 0 for
the 23 notes farther away. Adding an unlinked note moved no other note. Returning Home
moved nothing and kept the camera. A re-layout kept the camera still while 127 notes
appeared over 0.9 s and refit once. Node runs on 66–350-note graphs gave the same
ordering. Not exercised: a visible window at display frame rate, the reduced-motion
path, connected mode with the real workspace, the packaged app, and Windows.

### 2026-10-30 — Links to titles with spaces or Korean text never resolved

Since the 2026-09-17 React Router refactor, `routePath` encoded a note id before
`generatePath` encoded it again. Link resolution decodes once, so `[[Smoke A]]` or
`[[한글 노트]]` looked up `Smoke%20A` and matched no note: the graph drew no line and
the reader marked the link unresolved. `[[uuid|label]]` links, which the worker and
Chat write, were unaffected because UUIDs need no encoding. A packaged-build smoke
test with hand-written title links showed 0 connections. `generatePath` now does the
only encoding.

Measured in the packaged build, with its bundled service on a disposable
`KNOTER_DATA_DIR` and nine notes linked by title. Before: 0 graph lines and 7 of 7
reader links unresolved. After: 8 lines, all 7 links resolved, and the Korean link
opened its note. The same runs showed the packaged graph unfolding before its single
fit. Not exercised: the user's workspace, its existing title links, and Windows.

### 2026-10-30 — Hardware acceleration was implicit, and a pan re-rastered the graph

The user asked how hardware acceleration was set up, for it to be used, and for a
Settings toggle. Main configured nothing: Electron's default (enabled) applied, with
no way to turn it off for a misbehaving driver and no sign of whether Chromium had
fallen back to the CPU. In the renderer, the graph camera was a CSS transform on an
SVG `<g>` with no compositing reason, so every pan frame re-rasterized the page's
root layer, which held the whole graph, instead of moving it on the compositor.

Remedies: main reads the preference after `setName` (which names the user data
folder) and before `ready`; disabled calls `disableHardwareAcceleration`, enabled
leaves Chromium's own GPU path and driver blocklist (no `ignore-gpu-blocklist` or
forced GPU rasterization). Changing it relaunches the app. Settings shows Chromium's
compositing and rasterization status, and the camera group has
`will-change: transform`.

Measured in Electron 44.4.1 on Linux under Xvfb with no GPU, so with software
compositing, against the built renderer in demo mode with a synthetic 120-note wiki
and a 90-step pan, three runs each. Raster during the pan fell from 340–412 ms to
209–268 ms; the busiest layer went from the root layer, 95–176 tiles (77–113 ms), to
the camera layer rastering only the 18 newly exposed tiles (26–30 ms). At 400% zoom,
once settled, the image matched the previous build (11 of 769,128 pixels differed).
Against a development service: turning it off relaunched with the GPU process on
`--use-gl=disabled` and the status "Off"; turning it on relaunched without that flag;
an unsaved edit raised the discard prompt, and **Keep editing** kept the draft and
the setting; a title-bar change kept the setting; an old `{frame}` file and an
unreadable file both started with acceleration on.

Not exercised: a real GPU, so neither the "In use" status nor the GPU-side gain was
seen; macOS, the packaged app, and Windows. About seven small layers per pan frame
(note halos, the graph hint, and the search bar, composited for overlap) were
re-created and rasterized in both builds; that churn is unexplained and remains.

### 2026-11-13 — The graph was an SVG element per note, restyled every frame

The user asked for the graph to be WebGL-accelerated so it runs comfortably. Each note
was an SVG group (link, halo, dot, label, and its own context-menu root) and each link
a line; every simulation frame set a `transform` on every group and four attributes on
every line, and hover re-rendered every note through React. The 2026-10-30 compositor
layer helped only a pan of a still graph: a zoom, a drag, or a layout that was still
moving re-rasterized everything.

Remedy: `graph/renderer.ts` draws notes and links as instanced WebGL 2 quads (circle
and line coverage computed in the fragment shader, one buffer upload and two or three
draw calls per frame) and labels as text on a 2D canvas above, culled to the view. The
build animation, dim/halo fades, and animated camera moved from CSS into the renderer.
Hit-testing replaces per-note pointer targets. Notes remain a visually hidden list of
links for keyboard focus, activation, and the menu; one context menu serves the canvas.
Without WebGL 2, or while its context is lost, the 2D canvas draws the same picture.
No dependency was added.

Measured in the app's browser pane on macOS (Vite dev build, demo mode, device pixel
ratio 1) with a disposable synthetic wiki of 2,000 notes and 2,779 links. The pane was
hidden, where `requestAnimationFrame` does not fire, so frames were pumped by hand and
timed through a `readPixels` sync: script plus draw took 0.4–0.5 ms on average (1.9 ms
worst) per frame for a pan at fit zoom, a zoom to 400%, and a pan with labels shown;
the 122 frames of a new layout averaged 9.8 ms (18.3 ms worst), nearly all of it the
simulation. Forcing `WEBGL_lose_context` switched to the 2D drawing and restoring it
switched back; changing `data-theme` recolored the graph. On the six-note seed: hover
highlight and tooltip, right-click menu, a note drag (no navigation), wheel zoom, pan,
and Enter on a focused note link (opened the note) behaved as before.

Not exercised: a visible window at display frame rate, so no measured frame rate and
no before/after comparison with the SVG build; Electron, the packaged app, connected
mode, and Windows; hardware acceleration off in Electron, so which path it takes there
is unknown; a high-density display; touch input; modifier-clicks, which are forwarded
to the hidden link as a synthetic click and may not open a new window; a screen
reader. Labels now draw above all notes instead of interleaved with them, and hover
does not follow a note that moves under a still pointer. The simulation, not drawing,
is now the cost of a moving layout.

### 2026-11-13 — Shortcomings of the graph view after the move to canvas

A review of the new graph listed nineteen defects, which the user asked to have fixed.
With 2,000 notes the central labels overlapped, links formed one mass, and zoomed-out
notes covered each other; a ninth collection reused a color; the fit ignored the
panels on the left and bottom, and the graph showed through the text above it; hover
did not follow moving notes; the tooltip was the browser's; search dimmed non-matches
without moving the view; Tab walked every note; a keyboard-opened menu appeared in the
corner; and nothing said which drawing path was in use.

Remedies: labels are placed greedily, highlighted then pinned then by degree, and
skipped where they would overlap; links fade and the minimum note size shrinks with
zoom in dense graphs; collections past eight get `oklch` hues at a per-theme
lightness; the fit measures the panels; a gradient covers the graph under the top
overlay; hover is re-picked on simulation and camera frames; an in-app tooltip, a
background menu, a match count, and a fallback mark were added; search frames the
matches and restores the earlier view; note links have one Tab stop with arrow-key
movement, a focus ring, and a view that follows; minimum zoom is 1%; the hint goes
after the first move. Wheel input now distinguishes a mouse wheel (whole notches,
zoom) from a trackpad (pan, pinch to zoom), and two touch points pinch. A modified
click now opens the note like a plain one: Electron denies new windows, so the old
link behavior did nothing there.

Checked in the same hidden browser pane with the same 2,000-note synthetic wiki, now
in thirteen collections, frames pumped by hand: script plus draw stayed at 0.4–0.6 ms
per frame (1.7 ms worst) for pans and zooms with label placement; a search for eleven
notes moved the zoom from 5.5% to 12% and clearing it returned to 5.5%. Synthetic
wheel events panned for small deltas, zoomed with Ctrl, and zoomed for 120-unit
notches, with the page not scrolling. Arrow keys moved focus between seed notes with
one Tab stop, and a keyboard menu opened at its note. Tooltip, background menu,
legend, fallback mark, and dark theme were seen in screenshots.

Not exercised: real mouse wheels, trackpads, and touch screens, so the wheel
classification rests on synthetic events and may mistake one device for another;
a visible window; Electron and the packaged app; a screen reader; label stability
while a large layout is still moving. The graph's drawing path is not shown in
Settings beside Chromium's GPU status.

### 2026-11-13 — Every snapshot re-parsed every note, stalling the window every two seconds

The user asked for the canvas graph to be verified in a packaged build on the workspace
in use (389 notes, 1,359 links, 18 collections). The build was run from `out/` without
installing it; with no service or main-process change since the installed 2026-10-30
build, it connected to that build's running LaunchAgent service. Only views were
changed: nothing was edited, and the forces were left alone.

Found there, not in the 2,000-note preview: a 230–245 ms main-thread task every two
seconds, with or without input. `buildWikiLinks` parsed the Markdown of every note on
each snapshot, and the connected client delivers one every two seconds whether or not
anything changed. The installed SVG build had the same stall. Link targets are now
kept per note while its text is unchanged, and titles are indexed once per pass; the
link count stayed 1,359. Two smaller defects showed on this data: links faded to 26%
at the fitted zoom were close to invisible, so the fade floor is 45%; and every search
match kept its label regardless of overlap, so only the note under the pointer is now
exempt, and links not between two matches fade while searching.

Measured over the DevTools protocol in a visible 1440×940 window on an Apple M4 Pro
(ANGLE Metal, device pixel ratio 1, a display of about 160 Hz), as intervals between
animation frames while pointer and wheel events were dispatched each frame:

| | Installed SVG build | This build |
| --- | --- | --- |
| Layout build, first 240 frames | 14 fps average, worst frame 905 ms | 161 fps, worst 11.8 ms |
| Pan at the fitted zoom | 115 fps, one 260 ms stall | 162 fps, worst 12.8 ms |
| Wheel zoom in to 400% | 84 fps, 14 of 60 frames over 20 ms | 148 fps, worst 15.6 ms |
| Pan at 400% with labels | 126 fps, one 262 ms stall | 161 fps, worst 10.5 ms |
| Wheel zoom out | 83 fps, 18 of 80 frames over 20 ms | 145 fps, worst 18.6 ms |
| Idle for 8 s | stalls every 2 s | 161 fps, no long task |

The installed build's first row was taken right after launch and this build's after
**Re-layout**. Also seen in this build on that data: the drawing path reported
`webgl`; a note drag and the settling after it at 160 fps with no navigation; the
tooltip, the note menu and the background menu (opened and closed, nothing chosen
except Re-layout); one Tab stop with arrow keys moving between notes; a search for
`네트워크` framing 45 matches at 40% and clearing back to 16%; a click opening its
note and Back returning to the graph at the same zoom.

Not exercised: a real mouse wheel, trackpad, or touch screen (events were synthetic,
so the wheel classification is still unconfirmed on devices); a high-density display;
hardware acceleration off; a screen reader; Windows; the build installed in place of
the current one, and its bundled service. The sandbox blocked the Electron download
during packaging and local connections to the debugging port until both were allowed.

### 2026-11-13 — The whole-wiki graph read as a cobweb

On the user's 389-note, 1,359-link wiki the force layout looked like a cobweb, and a
first remedy, one disc per collection, was not what was wanted: the user showed
Obsidian's graph view as the target. What made the old picture a web: every note kept
a box as wide as its label clear, so notes stood far apart on long links; links were
translucent and brightened wherever they crossed; and the hub rings and wedges gave a
lobed outline.

Remedy for the whole-wiki graph: plain link, repulsion, and gravity forces with weak
springs (0.35 of d3's) and circle-only spacing, tuned so the body is round and evenly
filled; links drawn opaque in a color mixed toward the background, so crossings do not
add up; smaller minimum dot sizes. Left to the forces alone, notes without links and
small separate groups settled far from a densely linked body, so they are held on a
ring a fixed gap outside it. Wikis under about 120 notes blend label boxes back in,
down to full boxes at 40, because they show every label.

Checked with a headless run of the simulation on that wiki (read-only) drawn to an
image, on synthetic vaults of 12 to 5,000 notes with leaf-heavy hubs, and in the app
from a development run (`electron .`) on the same workspace: a round body, 21 notes
without links on the ring, a 22-note group and a 3-note group beside it; the synthetic
vaults showed the dandelion clusters and the ring of the reference picture. A tick took
0.39 ms for that wiki in Node (0.62 ms with the ring layout's label boxes), after two
per-tick allocations were removed from the repulsion loop. A dragged busy note moved
its neighbors 78, 39, and 24 units at one to three links and notes beyond four links 1
unit; a dragged unlinked note returned to the ring; a restore moved nothing.

Not exercised: real frames. The app window was hidden during these runs, where
animation frames do not fire and the renderer process is slowed, so frames were pumped
by hand and their timings varied tenfold between runs; no frame rate is claimed for
this layout. A reheat of a settled layout still moves notes about 110 units on
average, as the earlier layout did: 300 ticks stop short of equilibrium. The spacing of
notes on the ring is uneven near a group that sits on it. The 120-note threshold for
label boxes is a guess checked only at 6, 12, and 60 notes.

### 2026-11-16 — Link kinds: verification limits

The graph's split into semantic and word links was checked in the browser preview only,
on a synthetic 160-note wiki, not on the installed app or the user's wiki. The worker
skill's **Connect pages** section (D26) was not run against a model: no job was executed
after the change, so whether the worker writes fewer and better-stated `[[...]]` links,
and leaves glossary links in their stored form when it rewrites a page, is unobserved.
Pages written before the change keep their links. Links the earlier skill had the worker
write without guidance on when to link all read as semantic.

### 2026-11-13 — The service was re-registered to a build inside a worktree

While the packaged build was being tried from `v2/out/`, the LaunchAgent plist was
rewritten at 02:56 to launch `KnoterServiceLauncher` from that folder (the Agent
window's **Enable** or **Restart** does this; the verification scripts did not press
it). Later `npm run package:demo` runs replaced that app under the running service,
and the UI logged `Background service is unavailable` for a time. The service process
started at 02:56 kept running from memory. Consequences to keep in mind: the next
service start will run whatever build is in `out/` then, including an unverified
skill; removing the worktree or `out/` leaves the registration pointing at nothing.
Remedy still to do: disable the service, install a chosen build at
`~/Applications`, and enable it there, as the README describes. Do not repackage a
build the service is registered to; a development run (`electron .` from `v2`, which
needs `node node_modules/electron/install.js` once in a fresh worktree) shows a new
renderer on the same workspace without touching `out/`.

## Native lifecycle and remaining verification limits

### 2026-11-20 — The app became knoter; its folders did not

At the user's request the app is named knoter instead of Knoter Wiki Demo: the bundle,
its executable, the menu, and the window title. Electron names the user data folder
after the app, and the service's workspace lives in that same folder, so the rename
alone would have opened an empty settings folder beside the real workspace. Main now
sets the user data path to the service's data folder explicitly. The data and log
folders, the bundle ID, and the LaunchAgent label keep the first name; moving them
would need a migration of an installed workspace and a new registration, and was not
asked for.

The LaunchAgent stores the installed app's path, so a renamed app is a moved app:
disable the service from the old build, install the new one, enable it there.

Limits: the name and path calls were tried in a throwaway Electron run, where the
override held; the window settings surviving the rename were not observed in the app
itself before the install. The outbound `User-Agent` still says `knoter-wiki-demo`.

### 2026-11-20 — The app icon made packaging depend on `actool`

The packaged app showed Electron's default icon on a dark plate. It now ships a knot of
cord, chosen by the user after three other drafts (a k-shaped graph, round graphs, a
cloud of notes): green on paper in light appearance, cream on green in dark. One icon
cannot be both in an `.icns`, so `AppIcon.icon` (Icon Composer) carries the two and the
packager compiles it with `actool` into `Assets.car`; the `.icns` remains for systems
before macOS 26. Packaging therefore needs macOS 26 and Xcode 26, and fails without them
rather than falling back.

`actool` writes scratch files in the per-user temporary folder and failed inside the
agent sandbox (`You don't have permission to save the file ... in the folder "T"`), as
did `iconutil`; both ran outside it. The icon format's JSON is not documented: the
appearance keys (`fill-specializations`, `image-name-specializations`) were taken from
the tool's own frameworks and confirmed by exporting each rendition with Icon Composer's
`ictool`.

Limits: the Mac was in dark appearance, so only the dark icon was seen as the system
draws it; the light one was checked through `ictool` and the compiled catalog's
renditions. The Tinted and Clear icon styles, the `.icns` on an older system, and the
Dock after an install were not checked.

### 2026-11-13 — Quitting the Windows app killed the service mid-job

The Windows package runs the service as the app's own child. After a quit while a
worker job ran, `service.lock` was still there, the SQLite WAL was unmerged, and the job
was left running: Node starts a child that is not detached inside a job object that
Windows ends with the parent, so the service died with the app before it could stop the
worker, close the database, and remove its lock. No data was lost; the next start
replayed the WAL.

The app now starts the service detached, and the service stops itself in order when its
stdin closes, which also covers an app that dies. The app waits eight seconds before
ending it by force. A service that exits within thirty seconds is retried after three
seconds for the first five tries, since a reopened app can start while the previous
service is still stopping.

Limits: one quit while a job ran was repeated with the fix, and the lock was removed and
the WAL merged. That check used the workspace in use rather than a disposable one, and
the job it interrupted was queued again by hand. An app ended from Task Manager, logoff,
shutdown, and sleep were not tried, and the quit was not repeated on the build renamed
knoter.

### 2026-11-13 — A Windows workspace looked empty after reopening the app

The app had first been started from a terminal inside a Store-packaged program (the
Claude desktop app). Windows redirects such a process's writes under `%APPDATA%` to
`%LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming`, and its children inherit that,
so the workspace was created there. The same exe opened from Explorer used the real
`%APPDATA%\Knoter Wiki Demo` and made a new, empty workspace. Nothing was lost.

With the app closed, the workspace was copied to the real folder; the empty one and the
redirected copy were renamed aside, not deleted. For checks from such a terminal, start
the exe through `explorer.exe`, and keep files that an outside process must read out of
`AppData`.

Limits: the app does not notice or report a redirected folder. Only this one
Store-packaged launcher was seen.

### 2026-09-17 — SMAppService registered but could not launch

macOS 27 launch logs rejected the bundled helper's code signature; the Mac had no
Apple signing identity. The user selected the explicitly labeled local
LaunchAgent route for this demo. Ad-hoc bundle verification does not establish
SMAppService compatibility, notarization, or distributable signing. Main still
owns discovery; the service can finish stored snapshots after UI exit but does
not discover files added or edited while the UI is closed.

### 2026-10-16 — An old SMAppService registration shared the agent label

The 2026-09-17 SMAppService attempt left `com.knoter.wiki-demo.worker`
registered in the GUI domain, relaunching with exit code 1 more than 20,000
times, although `~/Library/LaunchAgents` held no plist. Registration skips the
bootstrap when that label already exists, so Enable background would have
reported the stale job. Running the old bundle's `KnoterServiceControl
sm-unregister` removed it before the replacement. Before reinstalling, check
`launchctl print gui/$(id -u)/com.knoter.wiki-demo.worker`, not only the
LaunchAgents directory.

### 2026-10-16 — A stale service lock blocked startup after PID reuse

The new LaunchAgent then exited with code 1 on every spawn, logging "Another
service owns this workspace." The `service.lock` from 2026-09-21 named a PID
that macOS had since reused for a root daemon. `kill(pid, 0)` returned EPERM for
that other user's process, and the lock check treated any error other than ESRCH
as a live owner. Moving the stale lock aside let the service start. Stale locks
were routine: on a clean stop, `server.close()` had already removed the socket,
so the failing socket unlink skipped the lock's removal.

The check now treats EPERM as a reused PID, as well as a same-user process whose
`ps` start time is later than the lock's mtime, and shutdown removes the lock
even when the socket is gone. Disposable-workspace checks covered a root PID, a
live same-user process started after the lock's mtime, and a second service
against a live one. A start in the same second as the lock, unreadable `ps`
output, a process that predates a later-copied or touched lock, and an empty or
non-numeric lock still count as a live owner. If the message persists, inspect
the lock's PID before moving the lock aside.

### 2026-09-17 — Native chooser stopped enabling Open

During bundle iteration, a complete UI quit and clean relaunch restored folder
and executable selection. Do not replace a running app bundle; confirm full exit
before reinstalling. A service restart alone is not the same as a clean UI launch.

### 2026-09-17 — Packaging dependency audit remained incomplete

The recorded audit used pinned patched `tar`, `tmp`, and esbuild versions. The
Forge chain still reported the unpatched `extract-zip` advisory; only the pinned
Electron distribution was unpacked during packaging. The production-dependency
audit reported no advisories at that time. This dated observation is not a fresh
audit, packaged-runtime certification, or release security review.

### 2026-09-17/18 — Recovery and semantic coverage remain bounded

Disposable storage walkthroughs covered deduplication, stale revisions/leases,
cancellation, protected proposals, Trash fencing, daily-limit accounting, and
backup/restore. The later four-source run was user-authorized operation of the
installed workspace, not a destructive recovery test. Physical sleep,
logoff/reboot, power loss during disk writes, other CPU architectures, Windows,
and large-corpus performance remain unverified by these records.

Prompt walkthroughs used a small corpus and cannot establish reliable preservation
of all personal reasoning, useful topic boundaries, or factual correctness.
Automated tests and CI remain deferred by user instruction. Use the package's
documented checks for future changes; these observations do not establish broad
automated regression coverage.
