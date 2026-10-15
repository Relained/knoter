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

## Native lifecycle and remaining verification limits

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
