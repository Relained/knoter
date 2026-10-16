# knoter V2 demo

Native [wiki-worker demo](../docs/plan/wiki-worker-demo.md), alongside the browser
preview of the [desktop rewrite](../docs/plan/desktop-rewrite.md). Use disposable
Markdown sources. Neither mode migrates the legacy vault or browser preview data.

## Run the native demo

Packaging currently requires macOS Apple Silicon, Xcode Command Line Tools,
Node **22.14.0**, and npm. The build copies this exact Node runtime and its license
into the app; the installed service does not depend on shell PATH or global Node.
Codex CLI **0.154.0** must already be installed and logged in with ChatGPT
(`codex login`, then `codex login status`). The selected account must have access
to `gpt-5.6-luna`. Alternatively, Claude Code **2.1.294 or newer** logged in with
`claude auth login` (check with `claude auth status`) runs the same worker on
`claude-sonnet-5-5`; it receives only WebSearch and the wiki MCP bridge.
The app never copies login tokens into its workspace.

From `v2`:

```sh
npm ci
npm run package:demo
```

This runs the required `npm run check`, compiles the Swift helpers, bundles the
service and renderer, and packages an ad-hoc signed app at
`out/Knoter Wiki Demo-darwin-arm64/Knoter Wiki Demo.app`. Install it at a stable
location such as `~/Applications/Knoter Wiki Demo.app` before enabling background
work. Before replacing or moving an installed build, **Disable service**, quit the
app completely, replace it, reopen it, and enable the service again.

1. Open **Agent** from the status bar (⌘⇧A) and choose **Enable background**. The
   status should show `local_agent_running` and a connected service PID.
2. Choose **Connect Codex CLI** and select the installed executable. In the macOS
   chooser, ⌘⇧G can navigate to the absolute path reported by `command -v codex`.
   The service checks its version and existing ChatGPT login. Reconnect here after
   fixing authentication or an unavailable model; the worker does not switch models.
   To use Claude Code instead, choose **Connect Claude Code** and select the launcher
   from `command -v claude` (such as `~/.local/bin/claude` or
   `/opt/homebrew/bin/claude`); the launcher path is
   kept so self-updates stay connected, and each attempt re-checks its tool surface.
3. Open **Sources** (⌘⇧S), choose **Watch Markdown folder**, and select a small
   disposable folder. **Import snapshot** instead registers selected files once.
   Source discovery runs only while the app is open; the service works from stored
   immutable versions.
4. Wait for the next 60-second queue check. **Run now** uses the same queue. Open
   the resulting wiki, its source links, and the stored version/segment evidence.
   Edit the source and observe a new version and an update to the same wiki topic.
   **Jobs** in Agent shows the result and its explanation. **No linked wiki** means
   processing did not connect an active document; historical no-change results can be
   retried.
   New no-change results without a linked wiki require review instead of reporting success.
5. Editing a wiki yourself protects it. Subsequent worker changes appear for review
   in the side panel's **Changes** (⌘⇧H), with notes that did not reach the wiki;
   **Accept** and **Reject** resolve those proposals.
   Trash is recoverable, and pages you delete are not recreated automatically.
   Deleting a note removes its wiki content two minutes after a scan last saw it:
   pages left with no source move to Trash as **Moved by knoter** (protected pages
   are proposed instead), and others are rewritten without it. Restoring the file
   brings those pages back. A moved or renamed file with unchanged bytes keeps its
   identity; an unreadable folder never counts as deletion, and many notes vanishing
   at once wait for **Retry**.
6. Quit the UI after a source is registered: its queued work continues. Changes
   made to files while the UI is closed are discovered after reopening. **Pause
   queue** keeps the service available for editing; **Disable service** stops it.

Your notes are the core of the wiki, on any subject. The worker organizes factual
knowledge, original ideas, experiences, questions, and study/exam notes according
to their content, attributes clipped material to its author, and then fills gaps
from its own knowledge and the web, marking every addition as **보충**. Personal
reasoning, uncertainty, and problem context should survive alongside reusable
concepts. The writing contract is recorded in
[D13 and D19](../docs/plan/wiki-worker-demo.md#2-사용자-결정표).

Reference topics can use hubs and subtopics, such as `HTML`, `HTML/attribute`, and
`HTML/element`; this is an example, not a required shape for every note. Use
**Subtopics**, parent breadcrumbs, and **On this page** for hierarchical articles.
Existing IDs and revisions are retained when a document is reorganized. Hierarchy
labels come from slash-separated titles; renaming a parent does not rename child
titles, while stored UUID links remain stable.

Notes and chat replies render GFM with TeX math: `$…$` inline, and `$$…$$` on its
own line, a `$$` block, or a ` ```math ` fence for display. KaTeX loads only for
text containing `$`, with `\href` and HTML commands disabled. Emphasis next to
Hangul, such as `**"매주 수요일"**로`, renders as bold. The editor keeps both when
saving; it writes a standalone one-line `$$…$$` as a `$$` block and an in-sentence
`$$…$$` as `$…$`.

Substantive factual supplements are checked against pages the service reads for
the worker: Wikipedia (Korean or English) through its API, MDN, or any public https
page the worker found with web search. At most ten pages are read per attempt.
Only the chosen page address or title leaves the machine, never note text. Web
reads refuse local and private network addresses. **Supplement references** lists
each page with its provider and licence; choose **Inspect cited passages** to read
the stored snapshot. Its URL, retrieval date, hash, and attribution survive
revisions and full backup/restore.

A note is treated as a container of subjects. The worker assigns every part of the
changed note to the page where it belongs (or skips it with a reason), creates
pages for new subjects, and adds or revises single sections of existing pages
instead of rewriting them. The service rejects a plan that leaves parts unplaced
and retries once with the reason.

The worker tags pages (shown on pages and cards, in the sidebar **TAGS** group, and
as a library filter). Page titles and the aliases the worker declares form a
glossary; the service links the first mention of each glossary term across the
wiki, skipping ambiguous terms and protected pages. **Backlinks** on each page show
where it is linked from.

The user approved a **local LaunchAgent for this demo** after SMAppService rejected
the unsigned helper. Registration creates only
`~/Library/LaunchAgents/com.knoter.wiki-demo.worker.plist`, pointing to the installed
app. Disable removes that registration while preserving data. Service logs are in
`~/Library/Logs/Knoter Wiki Demo/`. Do not move the installed app while registered.
Apple-issued signing, notarization, and the SMAppService distribution path remain
outside this local demo.

Workspace data lives in `~/Library/Application Support/Knoter Wiki Demo/`: SQLite
with revisions, citations, durable jobs and attempt records, plus immutable source
blobs. The UI exposes backup/export under **Backup and export**. A full backup
contains a consistent database snapshot and checksummed originals; Markdown export
is a reading/interchange format, not a full backup. Restore requires an empty
workspace and reconnecting folders/CLI. Preserve any existing workspace by moving
it aside **after disabling the service and quitting the app**, then start a fresh
workspace and choose **Restore backup**. Never replace a live SQLite database.
A new build migrates the database to schema 2 on first start, after which older
builds refuse to open it; back up the workspace before installing a newer build.

For development, run `npm run check`, then `npm run service` in one terminal and
`npm run desktop` in another. Both accept the same `KNOTER_DATA_DIR` environment
variable for a disposable workspace. Development mode does not register an OS
service and stops when its service terminal exits.

### Workspace layout

The wiki is the main view. **Home** shows one search field over the graph of every
note; typing highlights matches and Enter opens the first.

The graph is a 3D sphere built around the notes your wiki revolves around. knoter
finds them itself (PageRank over the links, choosing hubs that are not next to each
other) and lists them as **Central notes**. The most central one sits at the core,
the others on an inner shell; every other note radiates outward from the nearest
central note, one layer per link, so each grows its own part of the sphere. Notes
without links settle on the outer shell. Forces still shape it as in Obsidian's
graph: notes repel, links pull like springs, and nothing is clamped to the window.

- Drag to turn the sphere, Shift-drag to pan, scroll to zoom, and double-click empty
  space to fit it again. With the graph focused, arrow keys turn it and `+`, `-`,
  and `0` zoom or fit. Click a note to open it, drag one to move it, and right-click
  for its menu; hovering shows its title and links.
- The graph turns slowly while nobody uses it (it pauses on hover and for a few
  seconds after you interact); the orbit button switches this off.
- **Forces** (the sliders button) adjusts the center (shape), repel, link, and
  distance forces. **2D** switches to the flat map, which keeps every note as a
  keyboard-focusable link; the choice is remembered.
- **Graph around this note** (⌘G) shows one to three links around a note, with that
  note at the core.

- **Sources** and **Agent** open as windows inside the app: drag their title bar to
  move them, double-click it to maximize. `#/sources` links open the Sources window.
- The side panel holds **Chat** and **Changes**. Changes lists, for the whole
  workspace, proposals waiting for review, notes that did not reach the wiki, and
  revision history for the open note or all notes.
- The status bar at the bottom shows the save and service state and toggles
  navigation, Sources, Agent, Activity, Chat, Changes, and Zen, as Zed's dock
  buttons do.
- **Settings → Window** chooses knoter's own title bar (search built in; macOS
  keeps its traffic lights, other platforms get knoter's window controls) or the
  system title bar. The window reopens to apply it after checking for unsaved edits.
  The choice is stored by the app in `window-preferences.json` in Electron's user
  data folder, not in the workspace.
- **Settings → Shortcuts** lists every command with its shortcut (⌘ on macOS, Ctrl
  elsewhere). Select one and press new keys; shortcuts need ⌘/Ctrl or Alt, and
  conflicts are marked. Keys an editor uses, such as ⌘B for bold while editing,
  stay with the editor. The search palette (⌘K) also runs every command.

**Settings → Writing** sets how much of a page the marked supplements (**보충**)
should make up, 30% by default; it applies to pages the worker and Chat write from
then on. **Rewrite** on a page (⌘⇧E) rebalances that page: choose a ratio, and Chat
rewrites it as a restorable revision that keeps everything you wrote and changes the
amount and depth of the supplements. The ratio guides the model's writing; the
service does not measure or enforce it.

### Side chat

Open **Chat** from the status bar (⌘L). It answers from your wiki and applies the
changes you ask for, following the same writing and evidence rules as the worker.

- Type `@` to mention a note. The open note is included unless you remove its chip.
  Mentioned notes are the scope of the request.
- Attach up to five UTF-8 `.md`, `.markdown`, or `.txt` files (256 KiB each) with
  the paperclip or by dropping them on the composer.
- Choose the model and reasoning effort below the message. The lists show every
  connected and ready CLI: Codex models come from the selected Codex's own catalog;
  Claude Code lists Opus, Sonnet, Haiku, and Fable with the effort levels its
  `--help` reports. Connecting a CLI also makes it the background worker's CLI.
- Requested changes are applied immediately as revisions you can restore, and the
  reply lists the notes it created or updated. A note you edited manually changes
  only when you mention it. Stopping a reply, a failure, or a service restart applies
  nothing.
- Your message and attachments are stored as `chat` sources only when a change
  cites them; they do not enter the background queue. **New conversation** keeps
  earlier conversations in the workspace.

Each reply may run for ten minutes and the chat allows 100 replies per local day,
separately from the worker's 20 runs. Both count started runs, not tokens or cost.

## Native demo limits and failure evidence

Markdown must be UTF-8, at most 256 KiB per file. Hidden entries and symlinks are
skipped during folder discovery, and a folder may hold at most 2,000 notes. The
worker searches notes and pages instead of receiving the whole corpus; an attempt
may make 60 evidence reads, ten reference reads, and eight web searches. Jobs
stop visibly when these limits are exceeded. Each attempt has a five-minute
watchdog, at most two automatic retries for temporary failures, and 200 notes
started per local calendar day per workspace (retries of a started note do not
count). A reserved start counts even if a crash occurs
immediately before spawning; these limits are not token or subscription quotas.

Markdown/wiki generation and the side chat are connected. Tasks/calendar, PDF/TXT
sources, embeddings, multi-user access, and Windows are outside this demo. The browser
preview below still simulates its backend. Generation is evidence-constrained,
but semantic accuracy and useful topic boundaries still require human review.

Dated native failures, remedies, and unresolved verification limits are retained
in the [wiki-worker failure record](../docs/lessons/wiki-worker-demo.md). Browser
observations remain separate below.

Retry reprocesses the current source snapshot; it does not force a new revision.
Check the job's result and affected documents: it can return `no_change` or use
other notes it finds by search. A protected-document proposal is pending
review, not an applied update. Changing the default skill does not automatically
rewrite every existing wiki.

Test automation and CI remain deferred. Use `npm run check`, `git diff --check`,
and narrow manual walkthroughs with disposable data. Broaden manual checks for
changes to persistence, retrieval, or UI interactions. Routine completed-work
inventories belong in Git history.

## Run the browser preview

Use Node.js 22.14 or newer and npm. From the repository root:

```sh
cd v2
npm install
npm run dev
```

Open `http://127.0.0.1:39282`. These commands also use PowerShell-compatible
syntax; that does not establish Windows/native packaging support. The port
must be free. Use `npm ci` for a clean installation from the lockfile.

For code changes, run `npm run check` (TypeScript + production build).
`npm run build` and `npm run preview` build/serve the preview separately; stop
the dev server before previewing on the same port. Test automation and CI remain
deferred by user instruction; use manual walkthroughs with disposable data.

## Trying the preview

- Use **Add sources → Try a sample note**, or select
  [examples/reading-note.md](examples/reading-note.md), to try the import flow.
- Use **Link a note** for stable ID links. Typed `[[Title]]`, `[[id]]`, and
  `[[Title|label]]` references also work; title references require a unique match
  and can break on rename. **Home** shows the workspace graph; **Explore graph**
  opens the selected note's neighborhood.
- Use a document's right-click or **⋯** menu for contextual actions.
  **Move to Trash** is recoverable; restore from Trash or the old document URL.
- Compact navigation keeps an icon rail; **Zen mode** temporarily fills the
  app with the main view and restores the previous layout on exit. It is
  separate from OS fullscreen.
- **Rewrite** and the Writing ratio are simulated: the reply states the requested
  balance and no note changes. The title bar is always knoter's own in the browser.

Detailed interaction requirements belong in the rewrite brief, not a repeated
feature inventory here. UI integration rules live in [agents.md](agents.md).

## Demo data and limits

Changes are local to this browser origin and disposable, not a durable vault,
backup, or migration format. Multiple tabs are not synchronized. Closing the
page stops simulated work; reopening resumes queued imports. Do not import
originals expecting the preview to preserve them.

PDF bytes are neither extracted nor retained; PDF previews and seeded excerpts
are illustrative. Chat uses demo text matching, not a real LLM or semantic
retrieval; its model pickers and attachments are simulated and change no notes.
The graph has only been exercised with a small preview corpus.
The Protected label is a demo manual-edit flag, not proof of backend conflict
protection. Native services, storage, extraction, and portable exports follow
the rewrite milestones; frontend state does not demonstrate those capabilities.

Library choices and tradeoffs are recorded in the rewrite brief. Vite keeps
browser development independent of Electron; the reader disables raw HTML,
and the visual editor remains behind a replaceable component boundary.

## Failure evidence and verification limits

Observations from the macOS in-app browser on 2026-09-16/17. The build
environment was Node 22.14.0 with Vite 7.3.6. Manual evidence covered demo flows
on desktop and a 390px viewport, not an installed application.

| Date / issue                                        | Evidence, remedy, or remaining limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-16 — OS file chooser blocked by tooling     | The browser-control tool lost its file-input reference: `No node found for given backend id`. A disposable sample File passed the import path; that did not verify actual chooser selection, drag/drop, or PDF selection. Those paths still needed human checks.                                                                                                                                                                                                                                                       |
| 2026-09-17 — graph wheel events scrolled the page   | Wheeling over controls moved the page 134.5px without zooming. Containing wheel handling across the canvas and controls produced zoom with page scroll at 0, including at the 45% minimum; scrolling outside the canvas still worked. Keep this regression case.                                                                                                                                                                                                                                                       |
| 2026-09-16/17 — bundle-size warning persisted       | Lazy-loading the editor did not remove Vite's warning. After Router integration, the main JavaScript was about 703 kB (previously 607 kB) and the editor 1,361 kB before gzip. Dependency trimming and packaged-renderer review remain follow-up work.                                                                                                                                                                                                                                                                 |
| 2026-09-17 — limits of deletion checks              | Delete/reload/restore of a disposable note preserved saved content, revision, favorite state, and backlinks. Windows and storage-write failure injection were not exercised; successful browser restoration does not establish failure recovery.                                                                                                                                                                                                                                                                       |
| 2026-09-17 — Router history key collision           | Direct hash navigation reused Router's fallback key and incorrectly enabled Forward. Include the URL in toolbar journal identity; unknown entries reset the toolbar boundary. In-app blockers cover Router-created history; manually changing the address hash can bypass them.                                                                                                                                                                                                                                        |
| 2026-10-16 — mention insertion moved the caret      | Text typed right after choosing an `@` mention landed before it: the caret was restored in an animation frame that the hidden browser pane delayed. A layout effect now restores it after the value renders; the retest kept the typed text in order.                                                                                                                                                                                                                                                                  |
| 2026-10-16 — Korean emphasis and TeX showed as text | `**"매주 수요일"**로` kept its asterisks (CommonMark flanking) and `$$…$$` showed as source. The reader, outline, and link graph now parse with CJK-friendly emphasis and remark-math; KaTeX renders lazily. Math is inert in link checks, so `$[[a, b]]$` is no longer an unresolved link. Main JS grew 733→750 kB; KaTeX is a separate 261 kB chunk shared with the editor (1,361→1,092 kB).                                                                                                                         |
| 2026-10-16 — editor save rewrote math and emphasis  | One edit-and-save produced `\int\_0^1 x^2,dx`, `$\[\[a, b]]$`, and `\*\*"매주 수요일"\*\*로`. Enabling the editor's LaTeX feature and CJK emphasis (parse and serialize) kept them on retest. Typed `[[…]]` links are still saved as `\[\[…]]`, which continues to resolve. Restart the dev server after adding dependencies: re-optimization during hot reload produced duplicate-React hook errors until restart.                                                                                                    |
| 2026-10-16 — Buttons ignored their text sizes       | An unlayered `button { font: inherit }` reset outranked Tailwind's layered utilities, so every Button inherited 16px text whatever its size. The reset now lives in `@layer base`; Buttons use one scale (32, 28, and 24px high). Re-check spacing where a view relied on the inherited size.                                                                                                                                                                                                                          |
| 2026-10-16 — Graph squeezed into a rectangle        | The old layout clamped every note into a fixed 960×620 box, so larger graphs became a crowded rectangle. It is now an unbounded force layout with Barnes–Hut repulsion, label-aware collision, and a fitted camera. Synthetic workspaces of 250 and 1,000 notes rendered without errors; first graph paint, including page load, took about 1.3 s and 3 s in the headless dev build. Labels hide below 55% zoom except for up to ten hubs.                                                                             |
| 2026-10-16 — Bundle size after the shell rewrite    | Main JavaScript grew from 822 kB to 866 kB before gzip (graph engine, windows, shortcut editor); the editor chunk is unchanged at 1,096 kB. Vite's chunk-size warning remains.                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-16 — 3D sphere graph                        | Drawn on a 2D canvas with its own perspective camera and an octree force layout rather than a WebGL library, which would add about 600 kB. Synthetic wikis of 6, 250, 600 (random links), and 1,000 notes rendered without errors; at 1,000 notes the idle rotation drew every frame at a median and 95th percentile of 16.7 ms in headless Chromium. Main JavaScript grew from 866 kB to 892 kB. Individual notes on the canvas are not keyboard targets: the Central notes list and the 2D view provide that access. |

The `Document actions walkthrough` and `Router migration walkthrough` samples
were left in Trash after the 2026-09-17 checks; user documents' saved contents
were unchanged. Temporary editor/chat drafts were discarded and viewport
overrides reset.

Windows/native installation and large-corpus performance remain unverified by
these records. Before new interaction work, cover the affected behavior with a
manual check, including unsaved edits, history, graph scroll containment, menu
focus, narrow layouts, and deletion/restoration where relevant. Record failures,
their resolution, and unverified paths; keep routine PASS logs and completed-work
inventories in Git history.
