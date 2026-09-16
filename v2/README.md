# knoter frontend prototype

An interactive frontend for the [desktop rewrite](../docs/plan/desktop-rewrite.md).
This is milestone F0: a browser preview with a replaceable service adapter.
The existing `cli/` and `web/` applications remain separate.

## Run locally

Use Node.js 22.14 or newer with npm on macOS or Windows. From the repository root:

```sh
cd v2
npm install
npm run dev
```

Open <http://127.0.0.1:39282>. The same commands work in PowerShell. Port 39282
must be available; Vite will report a conflict instead of silently changing ports.
For a clean install from the committed lockfile, use `npm ci`.

```sh
npm run check   # TypeScript checking and a production build
npm run build   # Production assets in apps/desktop/dist
npm run preview # Serve a completed build; stop the dev server first
```

No test runner, automated test suite, browser-test script, coverage tool, or CI
workflow is included. Test automation is deferred by the user's instruction.

## What you can try

- **Wiki:** browse collections, search with Cmd/Ctrl+K, pin notes, follow source
  references, create notes, edit with Milkdown, save, restore revisions, and
  download a note as Markdown. Delete notes into recoverable Trash and restore them
  from the sidebar or wiki toolbar. Saving reads the current editor document directly,
  including keystrokes made immediately before clicking Save.
- **Sources:** select/drop PDF, Markdown, or text files; inspect status and source
  previews; pause/resume simulated processing; follow a generated wiki note.
  `Add sources → Try a sample note` runs the same import path with a disposable
  browser File. `examples/reading-note.md` is also available for manual selection.
- **Chat:** ask about the current note or workspace, watch a simulated streaming
  response, stop it, follow linked notes, or start another conversation.
- **Tasks:** create tasks with a priority and due date, complete/reopen them, and
  filter open, today, or completed items. Due dates appear in the calendar.
- **Calendar:** navigate months, choose a day, and create/edit/delete local demo
  events with a time, duration, description, and category.
- **Workspace:** inspect activity, switch themes, use icon-only compact navigation,
  collapse the assistant panel, or enter Zen mode to fill the app with the main
  workspace. Narrow screens expose navigation through a menu.

## Navigation, wiki links, and panels

Every main view, collection, document, and focused graph has a hash URL. Browser
Back/Forward and the toolbar arrows follow the same history. Refreshing or opening
a document URL in another tab retains the destination. Unsaved edits are guarded;
choosing Keep editing restores the current URL and preserves the draft and forward
history. Navigation metadata is session-only and owned by `api/navigationHistory.ts`.

Use **Link a note** in the editor to insert `[Label](#/wiki/document-id)` at the
cursor. These ID links survive title changes. Typed `[[Title]]`, `[[id]]`, and
`[[Title|label]]` also work; a title must resolve uniquely, so rename-sensitive or
ambiguous references are shown as unresolved. The Markdown AST is shared by the
reader and graph index; code and existing link text do not become accidental
wiki links. Backlinks include body references and existing related-note records.

**Graph** in the sidebar shows the workspace; **Explore graph** on a note shows
that note and its immediate neighbors. Select a node to open its document, search
to highlight matches, drag nodes or the background, and use the zoom/reset
controls. Wheel/trackpad scrolling anywhere inside the graph, including its
controls, zooms the graph without scrolling the page, even at the zoom limits.
Scrolling outside the canvas still scrolls the note list. Solid lines represent
body links; dotted lines represent legacy
`relatedIds` connections. Reciprocal references share one visible line. Existing
saved documents are not rewritten to add links. The graph is designed for this
small prototype workspace, not yet tuned for a large corpus.

The top-left control switches between expanded navigation and a 64px icon rail.
The rail keeps search, primary destinations, and settings available with accessible
names and hover labels. Expand it to access pinned notes and collections. There
is no independent control to hide desktop navigation completely. Drag each
expanded sidebar's inner border to resize it; focused borders also accept
Left/Right (10px), Shift+Left/Right (40px), Home/End, and double-click to reset.
Compact mode preserves the expanded width. Widths, `leftSidebarCompact`, and the
assistant's collapsed preference are saved through `KnoterClient.updateSettings`.
The legacy `leftSidebarCollapsed` preference is read as compact mode until the
new preference is saved; existing workspace data is preserved. Bounds preserve
the central workspace. On narrow screens navigation becomes a drawer and the
assistant overlays the document.

**Zen mode** in the top-right temporarily hides both sidebars and expands the main
workspace across the app. **Exit Zen** restores the previous layout, including
compact mode and panel widths. Zen does not enter OS/browser fullscreen, change
saved layout preferences, or remount the editor/assistant. Drafts stay in place.
Asking the assistant from a note exits Zen and opens the chat. Zen itself is not
persisted across page reloads.

## Document actions and Trash

Right-click a wiki card, pinned note, reading surface, internal wiki link,
backlink, related note, graph node, or graph list entry to act on that document.
The menu names its target and offers Open, Edit, Add/remove favorite, Explore
connections, Copy note link, Export Markdown, and Move to Trash. Nested links act
on the linked note, not the surrounding article. Cards and document headers also
have a **⋯** button for keyboard and touch access. Menus support arrow keys,
typeahead, and Escape; text selection, editable fields, and external links keep
their native browser menus. Menus use the existing Radix primitives family:
[Context Menu](https://www.radix-ui.com/primitives/docs/components/context-menu)
and [Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu).

**Move to Trash** asks for confirmation and identifies the note. Deleting the note
being edited also explains that unsaved edits will be discarded; cancelling keeps
the draft. Successful deletion removes it from active views, graph, search, and
favorite lists. Deleting the current reader returns to the wiki; deleting a focused
graph's central note returns to the global graph. Old document URLs offer Restore.

Trash persists across reloads. Restoration retains the same ID, saved content,
favorite state, revision history, and relationships. Original sources and tasks
are kept. Other notes' Markdown and historic chat text are not rewritten; links to
deleted targets appear unresolved. The mock adapter retains relationship IDs in
storage and exposes only active targets in snapshot navigation metadata. Restoring
a note makes those links available again. Simulated source processing does not
recreate notes while they are in Trash. Permanent deletion is not exposed.

`KnoterClient.deleteDocument` and `restoreDocument` own these operations.
`WorkspaceSnapshot.trashedDocuments` holds recoverable notes with `deletedAt`;
older saved previews default to an empty Trash without replacing existing notes.
Delete/restore persist the next state before publishing it, so a storage-write
failure does not remove a live note. `components/DocumentMenu.tsx` shares actions
across surfaces; browser clipboard access stays in `api/clipboard.ts`.

## Service boundary

```text
apps/desktop/src/main.tsx
  → api/index.ts: choose the client implementation
  → App({ client }): compose views and present command errors
  → packages/contracts: KnoterClient + typed snapshots and commands
  → api/mockClient.ts: seeded state, persistence, simulated jobs and chat
```

| Location                                       | Responsibility                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/contracts/src/index.ts`              | UI-facing document/source/task/event/revision/message shapes and async commands            |
| `apps/desktop/src/api/index.ts`                | Client composition, browser-file conversion, disposable sample File                        |
| `apps/desktop/src/api/mockClient.ts`           | The only localStorage access; command validation, state changes, notifications, simulation |
| `apps/desktop/src/api/seed.ts`                 | Connected sample research content and relative demo dates                                  |
| `apps/desktop/src/api/export.ts`               | Browser Markdown download adapter                                                          |
| `apps/desktop/src/views/`                      | Wiki, sources, tasks, and calendar screens                                                 |
| `apps/desktop/src/components/ContextPanel.tsx` | Chat, source context, and revision history                                                 |
| `apps/desktop/src/components/Editor.tsx`       | Lazy-loaded visual Markdown editor with a plain-text fallback                              |
| `apps/desktop/src/components/ui/`              | Composable Radix primitives and button variants                                            |

Additional frontend entry points: `views/GraphView.tsx` renders the interactive
graph; `wiki/links.ts` resolves Markdown references; `api/navigationHistory.ts`
and `components/useWorkspaceHistory.ts` own URL navigation; and
`components/SidebarResizeHandle.tsx` handles pointer/keyboard resizing.

Views call `KnoterClient` methods and consume `WorkspaceSnapshot`; they do not
read localStorage or call Electron, databases, or model providers. A later agent
can implement an IPC-backed client and inject it at the composition root.
`subscribe` signals that a new snapshot is available. `saveDocument` takes a base
revision so the adapter can reject stale saves. Chat accepts an AbortSignal.

These are frontend contracts, not a finalized service protocol or database
schema. Before connecting a real service, add explicit source byte/handle
transfer, validated wire messages, stream cancellation IDs, real provenance,
and versioned storage migrations. An AbortSignal itself is not an IPC payload.
The full rewrite plan governs those backend milestones.

## UI choices

React and TypeScript provide reusable screens with typed commands. Vite keeps
the prototype independent of Electron. Tailwind v4 and shared CSS variables
provide spacing, colors, and themes. Radix Dialog supplies modal focus management;
the small button/dialog components use shadcn-style composition and remain owned
by this repository. Lucide provides consistent icons. Milkdown supplies visual
Markdown editing, while react-markdown and remark-gfm render reading content
without enabling raw HTML.

The editor is loaded only when editing starts. Its feature bundle remains large;
production builds currently report Vite's chunk-size warning. Treat dependency
trimming and renderer packaging as follow-up work before shipping a desktop app.

## Demo limits

- There is no LLM, PDF parser, SQLite database, filesystem watcher, OS background
  service, Electron shell, native installer, or connection to the legacy vault.
- All changes are local to this browser origin under `knoter.frontend-demo.v1`.
  This storage is disposable preview data, not a durable vault or migration format.
  Multiple tabs are not synchronized. Closing the page stops simulated jobs;
  queued/in-progress imports resume when the preview is reopened.
- Imports accept up to 25 MB per file. Markdown/text previews retain at most
  100,000 characters. PDF bytes are neither parsed nor retained: the demo keeps
  metadata and an explicitly labeled placeholder. Seeded PDF excerpts are
  illustrative sample content, not verified paper extractions.
- Import deduplication uses filename and size. Real content hashing and updating
  existing wiki documents from changed sources belong to the backend milestones.
- Chat assembles existing demo notes with a simple text match; it does not reason
  or perform semantic retrieval. The interface labels responses as simulated.
- Task/event state is typed demo data. Portable Markdown/JSON/iCalendar export,
  time zones, recurrence, and background updates are still planned.
- The Protected label represents a manual-edit flag in the demo. Real background
  update conflict handling is not implemented.

## Verification record — 2026-09-16

`npm run check` passed with Node 22.14.0: TypeScript reported no errors and Vite
7.3.6 produced the production build. Vite reported the documented chunk-size
warning (main JavaScript about 525 kB and the lazy editor about 1,377 kB before
gzip). `git diff --check` passed.

Performed a direct walkthrough in the macOS in-app browser, without creating an
automated test harness:

- Wiki rendering and source links; title/body editing; immediate save; reload
  persistence; restoration of a previous revision.
- Simulated chat streaming and linked document references.
- Task completion, task creation, and calendar due-date projection.
- Event creation and visible placement on the selected day.
- Sample File import through `readImports` and `importSources`, queued status,
  completion, source preview, and navigation to the new wiki document.
- Light/dark appearance and navigation at 1280px and 390px viewport widths.

The real OS file-selection walkthrough was blocked by the browser-control tool
losing its file-input reference (`No node found for given backend id`). The
sample import path passed, but actual chooser selection, drag/drop, and PDF
selection still need a manual human check. Windows/native packaging has not
been verified. Do not infer that these unverified paths passed.

Run `npm run check` and `git diff --check` after changes. Record the result of
each manual check honestly; do not add test automation unless requested.

### Follow-up verification — 2026-09-17

Direct browser walkthroughs confirmed document-link navigation, browser and
toolbar Back/Forward, forward history across refresh, and keeping/discarding an
unsaved edit. A newly created demo note was linked through the picker; its target
showed the backlink and its local graph included the new note. Typed ID/alias
wiki links resolved, and a missing target was visibly marked as unresolved.
Both sidebar borders were dragged (222 → 282px and 326 → 386px), and refresh
retained those widths. Both panels could be collapsed together, and refresh
retained the collapsed state. No automated tests were added.

The follow-up `npm run check` passed (TypeScript and Vite production build).
The existing bundle-size warning remains: about 543 kB for the main JavaScript
and 1,378 kB for the lazy editor before gzip. Narrow-window navigation was also
visually checked at 390px. The link picker waits for editor initialization before
accepting insertions.

### Compact navigation and Zen refinement — 2026-09-17

`npm run check` and `git diff --check` passed. The existing Vite chunk-size
warning remains (about 545 kB main JavaScript and 1,378 kB lazy editor before
gzip). No automated tests were added or run.

A direct macOS browser walkthrough verified:

- Before the fix, wheeling over graph controls moved the page by 134.5px without
  changing graph zoom. After the fix, the same gesture changed zoom while page
  scroll stayed at 0, including repeated scrolling at the 45% minimum. Scrolling
  the margin outside the canvas still moved the page normally.
- Compact navigation measured 64px with no visible sidebar text, persisted after
  reload, and restored the previously saved 238px expanded width. The standalone
  full-hide navigation button was absent.
- Zen filled the 1334px app width. Exiting restored expanded navigation (238px)
  and assistant (280px), and also restored the compact rail in a separate pass.
  An unsent chat draft and unsaved note title/body survived the transitions.
  Temporary walkthrough edits were discarded without saving a document revision.
- At 390px, a stored compact preference still opened a full-text mobile drawer.
  Zen's exit button stayed visible without horizontal overflow. Asking the
  assistant from a note exited Zen and opened chat. The viewport override was
  reset after the walkthrough.

### Document actions verification — 2026-09-17

Direct macOS browser checks covered card right-click menus, matching overflow
menus, nested wiki-link targeting, graph-node menu actions, favorite toggling,
copying the exact document URL, keyboard End/Escape and focus restoration, and
390px menu placement without horizontal overflow. Graph menu pointer events are
isolated from SVG dragging. Cancelling an edit and reopening it through a menu
loads the saved body instead of the abandoned draft.

A disposable `Document actions walkthrough` note was created, saved with a wiki
link, favorited, deleted, reloaded, and restored. Cancellation preserved its
unsaved title; confirmed deletion kept the saved version. Restore preserved
revision 2, content, favorite state, and its backlink. Deleting from a focused
graph returned to the global graph, removed its node/edge, and left 9 original
notes active. Its old URL showed a recovery action. The disposable note was left
in Trash after verification; existing user notes were not edited or deleted.

`npm run check` (TypeScript plus Vite build) and `git diff --check` passed. The
existing bundle-size warning remains: approximately 607 kB main JavaScript and
1,361 kB lazy editor before gzip. No browser console errors were observed and no
automated tests were added or run. The viewport override was reset. Windows and
storage-write failure injection were not exercised in this walkthrough.

## Handoff

Read `agents.md` in this directory and the English rewrite plan first. F0 is
implemented; the next backend/platform milestone remains M0. Keep all real
service integration behind the client boundary, preserve the clear demo state
until a capability is connected, and do not delete or migrate legacy data.
