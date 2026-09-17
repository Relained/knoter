# knoter frontend prototype

Browser preview of the [desktop rewrite](../docs/plan/desktop-rewrite.md).
Use it with disposable demo data; it is separate from the legacy vault.

## Run locally

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
  and can break on rename. **Graph** opens the workspace graph;
  **Explore graph** opens the selected note's neighborhood.
- Use a document's right-click or **⋯** menu for contextual actions.
  **Move to Trash** is recoverable; restore from Trash or the old document URL.
- Compact navigation keeps an icon rail; **Zen mode** temporarily fills the
  app with the main view and restores the previous layout on exit. It is
  separate from OS fullscreen.

Detailed interaction requirements belong in the rewrite brief, not a repeated
feature inventory here. UI integration rules live in [agents.md](agents.md).

## Demo data and limits

Changes are local to this browser origin and disposable, not a durable vault,
backup, or migration format. Multiple tabs are not synchronized. Closing the
page stops simulated work; reopening resumes queued imports. Do not import
originals expecting the preview to preserve them.

PDF bytes are neither extracted nor retained; PDF previews and seeded excerpts
are illustrative. Chat uses demo text matching, not a real LLM or semantic
retrieval. The graph has only been exercised with a small preview corpus.
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

| Date / issue | Evidence, remedy, or remaining limit |
| --- | --- |
| 2026-09-16 — OS file chooser blocked by tooling | The browser-control tool lost its file-input reference: `No node found for given backend id`. A disposable sample File passed the import path; that did not verify actual chooser selection, drag/drop, or PDF selection. Those paths still needed human checks. |
| 2026-09-17 — graph wheel events scrolled the page | Wheeling over controls moved the page 134.5px without zooming. Containing wheel handling across the canvas and controls produced zoom with page scroll at 0, including at the 45% minimum; scrolling outside the canvas still worked. Keep this regression case. |
| 2026-09-16/17 — bundle-size warning persisted | Lazy-loading the editor did not remove Vite's warning. After Router integration, the main JavaScript was about 703 kB (previously 607 kB) and the editor 1,361 kB before gzip. Dependency trimming and packaged-renderer review remain follow-up work. |
| 2026-09-17 — limits of deletion checks | Delete/reload/restore of a disposable note preserved saved content, revision, favorite state, and backlinks. Windows and storage-write failure injection were not exercised; successful browser restoration does not establish failure recovery. |
| 2026-09-17 — Router history key collision | Direct hash navigation reused Router's fallback key and incorrectly enabled Forward. Include the URL in toolbar journal identity; unknown entries reset the toolbar boundary. In-app blockers cover Router-created history; manually changing the address hash can bypass them. |

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
