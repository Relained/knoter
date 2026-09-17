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

## Native lifecycle and remaining verification limits

### 2026-09-17 — SMAppService registered but could not launch

macOS 27 launch logs rejected the bundled helper's code signature; the Mac had no
Apple signing identity. The user selected the explicitly labeled local
LaunchAgent route for this demo. Ad-hoc bundle verification does not establish
SMAppService compatibility, notarization, or distributable signing. Main still
owns discovery; the service can finish stored snapshots after UI exit but does
not discover files added or edited while the UI is closed.

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
