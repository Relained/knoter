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
  download a note as Markdown. Saving reads the current editor document directly,
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
- **Workspace:** inspect activity, switch between light and dark themes, and
  collapse the assistant panel. Narrow screens expose navigation through a menu.

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
controls. Solid lines represent body links; dotted lines represent legacy
`relatedIds` connections. Reciprocal references share one visible line. Existing
saved documents are not rewritten to add links. The graph is designed for this
small prototype workspace, not yet tuned for a large corpus.

The top bar contains independent navigation/assistant collapse controls. Drag
each sidebar's inner border to resize it; focused borders also accept Left/Right
(10px), Shift+Left/Right (40px), Home/End, and double-click to reset. Widths and
collapse preferences are saved through `KnoterClient.updateSettings`. Bounds
preserve the central workspace. On narrow screens navigation becomes a drawer
and the assistant overlays the document.

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

## Handoff

Read `agents.md` in this directory and the English rewrite plan first. F0 is
implemented; the next backend/platform milestone remains M0. Keep all real
service integration behind the client boundary, preserve the clear demo state
until a capability is connected, and do not delete or migrate legacy data.
