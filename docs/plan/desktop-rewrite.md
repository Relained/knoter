# Desktop rewrite: decisions and implementation brief

Prepared 2026-09-16; consolidated 2026-09-17. English handoff for the isolated
`v2/` rewrite. This is a design contract, not an implementation-status report.

## Scope and user constraints

Build a local-first macOS/Windows application for four workflows:

1. Watch/import Markdown and PDF sources; use an LLM to create and update wiki documents.
2. Answer wiki questions with inspectable, versioned citations.
3. Offer a polished linked wiki reader and manual editor with reliable persistence.
4. Let workers and users maintain typed tasks and calendar events.

The user assigned a **frontend-only prototype first**, with backend methods behind
a replaceable `KnoterClient`. Mock responses must be identified as simulated.
Automated tests and CI are deferred by the explicit 2026-09-16 instruction:
use typechecks, production builds, `git diff --check`, and manual walkthroughs.
Do not add test runners, browser-test scripts, coverage tooling, or CI until
requested. Real providers, papers, and installed builds still need manual proof;
a browser build cannot establish OS support.

On 2026-09-17 the user requested a backend implementation **plan** for a real
source-to-wiki worker demonstration: Electron main enqueues source additions and
changes; an OS-managed service periodically invokes a worker with a dedicated
default skill. The [demo plan](wiki-worker-demo.md) records the agreed slice and
implementation gates. Planning does not establish implementation or native verification.
The user selected macOS/Markdown, a 60-second worker interval, topic-based wiki
integration in Korean, and connection to an existing Codex CLI installation and
ChatGPT login with a fast model for the demo. Each execution is limited to five
minutes, with at most two automatic retries and twenty executions per local day.
The service-owned CLI adapter receives proposals; the application remains the
only document writer. This narrows the direct-provider adapter choice below for
the demo without authorizing a coding agent to edit canonical files or the DB.
For this demo, only Electron main discovers source changes: while it is fully
exited, the service processes already queued immutable snapshots; new changes
are discovered when main restarts. This deliberately narrows the background
discovery scope described for the broader product below.

Read the [root guide](../../agents.md), [rewrite guide](../../v2/agents.md),
and [prototype README](../../v2/README.md) before work. Read
[legacy decisions](../../v1/docs/architecture.md) and the relevant legacy package guide
only when touching or importing from those packages. Continue the next
user-assigned milestone; this brief does not authorize deployment, purchases,
legacy deletion, or in-place user-data migration.

Exclude multi-user collaboration, cloud sync, browser-only hosting, a plugin
marketplace, external calendar sync, and agent-generated executable UI initially.
Reuse sources, useful workflow policies, and reviewed small helpers; do not copy
legacy orchestration, HTML generation, migrations, or UI state wholesale.

## Architecture and reasons

| Decision | Reason / boundary |
| --- | --- |
| Persistent local service replaces CLI orchestration | UI, ingestion, and chat need shared durable state and live events. A later CLI can be a thin client. |
| Provider adapter replaces a coding agent editing files | The application can validate proposals, retry jobs, and protect manual edits before writing. |
| SQLite owns application documents | Document revisions, citations, task fields, and change application need atomic updates. External Markdown editing becomes explicit import, not automatic two-way sync. |
| Multiple wiki documents have stable IDs | Focused retrieval, hyperlinks, and incremental maintenance should not depend on one giant file or mutable paths. |
| App-owned rendering replaces generated HTML | Consistent editing and interactive typed documents; imported/generated executable HTML is disabled. |
| OS-managed service is independent of Electron | Background processing must continue when the desktop UI exits, if enabled. |

The React renderer owns views and editor state, with no filesystem, DB, shell,
or credentials. Electron main owns windows, dialogs, menus, notifications, and
a narrow preload bridge. A separately bundled Node service is the only document
writer and owns migrations, retrieval, conversations, and jobs. Its job runner
starts with one ingestion job per workspace; extraction runs in an isolated
Python child process so chat remains usable. The extractor returns a versioned
result and never opens the application DB or edits documents.

`KnoterClient` is the renderer-facing application contract, not a replacement
IPC transport. Its native adapter calls a narrow preload API exposed through
`contextBridge`, using Electron's `ipcRenderer.invoke` / `ipcMain.handle` for
renderer-to-main requests. The separate service connection below bridges main
to the independently running worker; it is not needed merely to open an Electron
window. IPC carries requests but does not implement document storage itself.
See [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).

Use versioned JSON over a Unix socket on macOS and a named pipe on Windows.
Require current-user access and an authenticated handshake, request IDs,
cancellation, protocol negotiation, and message-size limits. A pipe name is not
authorization. Reconnect with authoritative state and durable events after a
cursor; saved partial answers replace missed transient token events. No public
HTTP server in the first release; providers are outbound connections. Browser
development uses an adapter behind the same renderer contract.

An Electron-owned utility process alone cannot satisfy the lifecycle contract.
Bundle a pinned Node runtime; never depend on the user's Node/Bun/Python, shell
startup files, or `PATH`. Closing a window or exiting the UI leaves enabled
background work active. Provide explicit enable/disable/status/start/stop/restart.
Run only in the logged-in user's session; do not promise work while logged out,
asleep, or powered off. On login/wake, reconcile files and expired job leases.
Use a service singleton and leases; unavailable credentials produce a recoverable
waiting state, not a retry storm or plaintext fallback.

## macOS and Windows

Initial targets: **macOS arm64, macOS x64, Windows 11 x64**. Windows arm64 and
Windows 10 require separate dependency and installed-app evidence. In M0, pin
compatible stable releases and record exact OS minimums. The proposed
`SMAppService` registration API implies macOS 13+, but dependencies may raise
that floor. These are proposed targets, not tested compatibility claims.

| Concern | macOS | Windows |
| --- | --- | --- |
| Background registration | Bundled per-user LaunchAgent via `SMAppService` | Per-user Task Scheduler logon task |
| Native helper | Signed ServiceManagement/Keychain helper | Task Scheduler/current-user DPAPI helper |
| IPC | Owner-only Unix socket + authentication | Current-user-restricted named pipe + authentication |
| Data / secrets | Application Support / Keychain accessible to the service identity | Local, not roaming, app data / DPAPI-encrypted blob with user-only access |
| First distribution | Signed/notarized app in DMG; ZIP for updates | Signed per-user Squirrel Setup.exe and update artifacts |

Keep registration, paths, credentials, and native shell behavior behind a
platform boundary, rather than OS checks throughout domain code. The service
must retrieve credentials with the UI absent. macOS registration must expose
approval status instead of copying the legacy loose-plist installer.
On Windows, specify the user, non-elevated execution, restart policy, single
instance behavior, battery policy, and execution time limit. Keep a launcher
attached so Task Scheduler observes failure; launch paths must survive updates.

Filesystem and UI constraints:

- Use OS path APIs and executable argument arrays, never shell interpolation of
  filenames. Handle spaces, Korean names, Unicode normalization, case-only
  renames, Windows reserved names/long paths, IME, and Windows display scaling.
  Use Command on macOS and Control on Windows, native menus, and visible focus.
- Separate IDs from paths; preserve display names and source mappings while using
  generated managed-storage names. Watcher events are hints: debounce/hash and
  reconcile on startup, wake, and periodically. Handle atomic saves, partial
  copies, locked files, unavailable folders, and cloud placeholders.
- Losing folder access does not establish deletion. Keep indexed evidence and
  report the location unavailable. Verify permissions from the actual background
  helper; a picker and worker may have different macOS/protected-folder access.
- Keep the live SQLite/WAL database in managed local storage, not a network drive
  or cloud-sync folder.

Package early with Forge and build on each target OS. Bundle service/extractor
runtimes, native libraries, and model assets explicitly, outside ASAR where
needed. Service native modules use the bundled **Node ABI**; only Electron-loaded
modules use its ABI. Include license notices and checksums. Development may use
unsigned builds; release signing identities/certificates and update hosting are
later inputs. Sign/notarize embedded macOS helpers/libraries too; Windows signing
does not guarantee SmartScreen reputation.

Updates must drain/checkpoint/cancel work, suspend OS restart behavior, stop the
service/extractor, and take a consistent backup before replacing binaries.
Refresh background registration, migrate under an exclusive startup lock, and
restart. Account for Windows executable/DLL locks and installer events. Never
open an incompatible newer schema with an older binary; preserve a restorable
pre-update DB and originals after migration failure. An updater requires a
hosted feed and one real upgrade walkthrough. Uninstall removes registration and
executables but retains user data unless deletion is explicitly requested.

Platform references retained from the original plan:
[SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice),
[Keychain](https://developer.apple.com/documentation/security/adding-a-password-to-the-keychain),
[logon triggers](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-logontrigger-triggergroup-element),
[task settings](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings),
[DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata),
[Forge lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle),
[macOS signing](https://www.electronforge.io/guides/code-signing/code-signing-macos),
[Windows signing](https://www.electronforge.io/guides/code-signing/code-signing-windows),
[Squirrel](https://www.electronforge.io/config/makers/squirrel.windows),
[updates](https://www.electronforge.io/advanced/auto-update).
Recheck vendor compatibility when selecting versions in M0.

## Library choices and gates

Defaults, not guarantees. Keep legacy package managers unchanged; use isolated
npm workspaces and committed lockfiles for `v2/`. Pin Python/model dependencies
separately. Scripts must work without Bash on Windows. Add service/core/platform/
extractor modules when a milestone needs them, not empty abstraction packages.

| Choice | Why / cost / acceptance gate |
| --- | --- |
| [Electron](https://www.electronjs.org/docs/latest) | Consistent Chromium UI and native desktop integration across OSes, at the cost of install size, memory, and embedded-runtime updates. |
| [React](https://react.dev/learn) + [TypeScript](https://www.typescriptlang.org/docs/) | Composable views and shared typed contracts; runtime validation is still required at IPC/LLM boundaries. |
| [Vite](https://vite.dev/guide/) | Focused renderer dev/build tooling; keep Node/native imports out of its bundle. |
| [Tailwind](https://tailwindcss.com/docs/installation/using-vite) | Shared spacing, typography, colors, and states; semantic tokens prevent arbitrary classes becoming a second design system. |
| [shadcn/ui](https://ui.shadcn.com/docs) | Customizable, accessible component source; the app must maintain imported code and review upstream changes. It is not a finished visual design. |
| [Milkdown](https://milkdown.dev/docs/guide/why-milkdown) | Markdown-oriented ProseMirror/Remark editor. Keep an integration boundary and validate tables, math, links/citations, IME, undo, and import/export round trips. Record failures before replacing it; do not silently narrow the format. |
| Node.js | Shared TypeScript service ecosystem and SDK/native support; bundle and pin its runtime/ABI separately from Electron. |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + SQLite | Transactions, relational integrity, and FTS5 without a database server. One writer; keep synchronous queries short and verify native packaging. |
| [sqlite-vec](https://alexgarcia.xyz/sqlite-vec/js.html) | Local vector search in the same DB deployment. Provisional pending native loading, stability, and corpus latency in M0/M4. If it fails, measure a bounded exact-vector fallback or another local index behind the same interface; do not call keyword-only search hybrid. |
| [AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/overview) | Generation, streaming, structured output, and tools behind an internal provider adapter. Capabilities differ; do not expose SDK types throughout the app or assume an existing key/subscription. |
| [Docling](https://docling-project.github.io/docling/getting_started/installation/) | Paper layout, tables, and OCR with structured output. Provisional pending CPU-only packaged quality, footprint, and latency. Record failures before selecting a replacement; preserve the source/citation contract. |
| [PDF.js](https://mozilla.github.io/pdf.js/getting_started/) | Original PDF display and cited-page navigation; viewing does not replace paper extraction/OCR. |
| Electron Forge | Makers, installers, signing, and publishing hooks; independent service packaging/lifecycle and an update feed remain explicit work. |

Docling OS documentation is not packaged-product evidence. Bundle a pinned
runtime and verified model files without requiring pip/Python installation.
Prefetch models or provide an app-managed first-use download with progress and
retry; define offline first-run behavior. CPU is the baseline, GPU optional.
[Model management](https://docling-project.github.io/docling/usage/advanced_options/).

## Storage and format contracts

SQLite owns documents, typed fields, revisions, conversations, and jobs.
Immutable content-addressed files own original bytes and attachments.
Extraction/search are rebuildable projections with extractor/model versions.
Export and backup belong in the first durable slice; Markdown export is not a
complete backup. Use SQLite backup APIs or a quiesced checkpointed snapshot,
coordinated with blob retention. Stage blobs before committing references and
clean abandoned staging files on recovery; never just copy an open DB.

| Format | Purpose and invariant |
| --- | --- |
| Original PDF/MD bytes | Immutable evidence versions for re-extraction; never modify a watched original. |
| Markdown body | Portable canonical wiki text in SQLite; define CommonMark/GFM plus explicit math/citation support, with raw HTML disabled. |
| YAML frontmatter | Human-readable import/export IDs, kind, title, source references, and schema version; never a second metadata authority. |
| Typed relational rows | Exact task state, deadlines, event ranges, and links without parsing prose; validate constraints. |
| Versioned JSON | Validated IPC, LLM change sets, extraction results, and structured exports; reject unknown operations/incompatible schemas. |
| SQLite DB | Atomic state, foreign keys, short transactions, schema migrations, consistent backups. |
| Float vectors | Derived retrieval with model, dimension, and content version; never mix embedding spaces. |
| iCalendar `.ics` | Interoperable export with stable UID, time zones, and all-day semantics; export does not imply live synchronization. |
| Manifest + snapshot + blobs | Full restore/machine migration with schema version, checksums, and reference validation; exclude machine-bound credentials. |

Use UUID entity IDs and SHA-256 blob identities; identical bytes do not merge
distinct provenance records. Normalize line endings only in derived text.
Audit timestamps are UTC; preserve intended local times and time-zone IDs for
events. Date-only deadlines/all-day events remain date-only, never midnight UTC.
Use exclusive calendar end dates where required. Recurrence may follow simple
events, but stable exported UIDs are required from the start.
[iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

Minimum model:

- Sources and versions retain location, media type, blob/hash, availability,
  import policy, and extraction state. Ordered segments retain text/tables,
  source version, page/region, and warnings; keep structured extraction output
  so a Markdown projection does not discard layout evidence.
- Documents retain stable ID, kind, title, body, revision, and protection policy;
  task/event fields extend the same ID. Calendar deadlines and Kanban columns
  project tasks rather than creating duplicate records.
- Revisions/change sets retain user/worker/import authorship, reasons, input
  versions, and application state. Citations/links reference document revisions
  or source segments, not mutable paths alone.
- Jobs/attempts/outbox events retain execution and post-commit work.
  Chunks/FTS/vectors retain revision/model identity. Conversations/messages keep
  partial/final answers and the evidence versions behind their citations.

## Ingestion, conflicts, and recovery

Pipeline: **discover → snapshot → extract → retrieve → propose → validate →
apply → index → report**. Persist each stage's input/output versions and a
separate job status (`queued/running/retry_wait/needs_review/succeeded/failed/
cancelled`).

1. Stable snapshots from watches and explicit imports enter one ingestion API.
   Extract deterministic segments and visible warnings; unreadable content must
   not become invented evidence.
2. Retrieve related wiki revisions and source evidence. Request a bounded,
   schema-constrained proposal with citations and reasons. The LLM gets only
   bounded read/search/proposal tools; source text cannot grant capabilities.
3. Validate operation, target ID, expected revision, source version, citation
   existence, and typed fields. Valid JSON cannot establish factual correctness.
4. Compare-and-swap revisions and atomically apply documents, revisions,
   citations, and an indexing outbox entry. No DB lock spans an LLM request.
5. Index committed revisions separately. Embedding failure keeps saved documents
   intact, exposes retrieval freshness, and retries the derived work. Emit a
   durable summary of changed documents, warnings, and usage.

Idempotency covers source identity/version, pipeline version, and operation.
Record provider request IDs; lost network responses can still incur charges,
so do not promise exactly-once billing. Lease/heartbeat jobs and reclaim expired
leases. Persist exponential backoff and finite attempts; expose cancellation,
manual retry, and terminal failures.

On modifications, invalidate dependent evidence and schedule targeted review.
On confirmed deletion, mark the source unavailable and review dependent claims
without deleting unrelated content or user edits. Retain immutable evidence
until an explicit retention/deletion policy removes it.

User and worker writes use the same API. A stale revision cannot overwrite a
newer edit. MVP protection is **document-level**: manual edits protect a generated
document, routing later worker changes to reviewable suggestions. Users accept/
reject or restore automatic maintenance. Protect human-controlled completion
and deadlines across re-extraction; section ownership waits for proven editor
identity preservation. Start with create, replace-body-at-revision, typed-field
update, citation link, and proposed archival; avoid line-number patches.
Undo creates a new revision rather than deleting history.

## Retrieval, chat, and UI intent

Fuse wiki FTS5/vector results and fetch cited source segments as needed.
Exact task/event queries use typed SQL-backed tools. Preserve evidence revision
IDs and show superseded citations; clicking opens the original version/PDF page.
Persist streamed partial turns and cancellation; stopped/failed answers must
look incomplete. Bound context to relevant evidence/history, support document-
and workspace-scoped questions, and state when evidence is insufficient.

Expose read-only chat tools first; later edits use the shared change-set path.
Separate generation/chat/embedding provider configuration. Implement one real
provider with explicit cancellation/structured-output/streaming/embedding
capability checks. Missing credentials must not block reading, editing, or
keyword search. Local storage does not imply local inference: show provider and
outbound source scope; preserve private-source exclusion policies.

Use a fixed Korean/English corpus covering short CJK queries, paper titles,
multi-document and unanswerable questions. Measure recall, citation correctness,
latency, and cost manually while automation is deferred. Default FTS5 tokenization
alone is not a Korean relevance strategy.

Navigation covers Sources, Wiki, Tasks, and Calendar; a collapsible assistant
panel holds Chat, Sources, and Changes. Shared typography/tokens, keyboard access,
and empty/loading/error states are required. Sources need import/watch, original
preview, job status, retry/cancel, and affected-document links. Wiki needs outline,
citations, save status, revisions, and AI review. Tasks need persisted completion,
due date, and status. Calendar starts with agenda/month views, simple event edits,
time zones/all-day semantics, and projected deadlines; add a calendar library
only for a concrete missing interaction.

User refinements from 2026-09-17 remain requirements:

- Back/Forward works for views/documents and respects unsaved edits.
- Wiki hyperlinks, backlinks, unresolved references, and local/global graphs
  make document relationships navigable.
- Expanded sidebars resize; the left sidebar offers icon-only compact mode
  without a full-hide button. The assistant may collapse. Temporary **in-app
  Zen mode** fills the main area and restores the prior layout/editor state.
- Graph scrolling/zooming, including controls and zoom limits, does not scroll
  the main page.
- Documents expose relevant right-click actions and discoverable overflow
  actions. Deletion is recoverable through Trash; restoration preserves identity,
  revisions, favorites, and connections. Keep original sources and other
  documents' Markdown intact. Backend retention/permanent-deletion policy needs
  a separate decision; browser mock deletion does not define filesystem deletion.

Use React Router's hash-based Data Mode to preserve shared `#/wiki/:id` links
and support navigation blockers without server rewrite rules. Keep services
behind `KnoterClient`; adopting Data Mode does not move persistence into route
loaders/actions. A session journal of location keys and URLs exists only to
bound the toolbar's Back/Forward buttons; unknown browser entries start a new
boundary. Browser reload/close uses a separate unload guard. Pin Router 7.18.4
for the Node 22.14 baseline: Router 8.4 requires Node >=22.22 and React >=19.2.7;
a routing refactor does not authorize a runtime upgrade.

Use app-owned rendering, Electron context isolation, and a narrow preload bridge.
Legacy sandboxed HTML may be previewed in isolation, never treated as the new
editable document format.

## Milestones and evidence

Keep each vertical slice runnable. F0 precedes backend work; prove packaging in
M0 instead of deferring it to release. Introduce minimal task/event extensibility
early, with full service behavior in M5. Unavailable targets stay unverified.

| Milestone | Deliverable and acceptance evidence |
| --- | --- |
| F0 — frontend | Isolated UI, typed interface, persistent mock adapter; manually navigate/edit/import/chat/complete tasks/edit events, plus typecheck/build. No claim of real extraction, LLM, or OS-service behavior. |
| M0 — platform proof | Pin runtime/OS matrix; package service, native DB/vector modules, credential/background helpers, editor fixture, and CPU extractor sample. Record native macOS arm64/x64 and Windows x64 results, editor fidelity, extractor footprint/latency, and operation without developer runtimes. Untested targets keep this incomplete. |
| M1 — durable documents | Schema/migrations, CRUD/revisions, typed API, editor, export/backup. Verify reopen, stale-save conflict, Unicode/IME, restore, and crash/restart without losing committed edits. |
| M2 — source to wiki | MD/PDF import/watch, versioned extraction, durable jobs, one real provider, linked citation-bearing wiki. Verify a real paper, deduplication, recoverable extraction/LLM failure, and unchanged originals. |
| M3 — incremental maintenance | Dependencies, source changes/deletion, protected suggestions, cancel/retry. Verify targeted updates, preserved manual edits, killed-service recovery, and no duplicate application on replay. |
| M4 — wiki chat | Hybrid retrieval, persisted streaming, evidence navigation, measured corpus results. Verify correct version/page, unanswerable questions, stale index, cancellation, quality, and latency. |
| M5 — tasks/calendar | Typed worker/user updates, time-triggered refresh, JSON/Markdown/ICS export. Verify completion survives re-extraction, no duplicate events, date/time-zone semantics, task projections, and stable UIDs. |
| M6 — installed product | Background lifecycle, installers, coordinated upgrades, restore, and legacy importer. Verify clean-machine installation/upgrade, login/wake/crash recovery, processing with UI absent, unregister-on-uninstall, signing, and every target OS. |

Record exact manual results and failed attempts against disposable/demo data,
not user originals. Follow [the package guide](../../v2/agents.md) for check
commands and keep run evidence in [the package README](../../v2/README.md);
do not duplicate completed-feature inventories here.

## Migration and handoff

After the format stabilizes, implement a read-only legacy-vault importer into a
new workspace. Snapshot sources/artifact Markdown, preserve provenance and old
paths as metadata, and rebuild derived indexes. Import a single-file wiki as one
document first; topic splitting is separately reviewable. Map workflow policies
explicitly or report unsupported ones. Free-form task/calendar text needs
reviewable typed mappings. Generated legacy HTML is not canonical input.

Provide a dry-run count/unsupported-record/error report and verify the imported
workspace. Leave legacy files, DB, configuration, and application runnable;
rollback means reopening that workspace, not lossy reverse migration. Share
source parsing with ingestion; keep legacy metadata mapping in the importer.

For the next agent: continue only the assigned milestone behind `KnoterClient`;
keep mock and real evidence distinct, honor the no-automation instruction, and
report unavailable platforms honestly. Update this brief when decisions or
contracts change, and package guides when implementation instructions change.
