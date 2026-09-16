# Decisions and lessons

Consolidated 2026-09-17. These records concern the legacy `cli/` and `web/`
unless stated otherwise. The [desktop rewrite](plan/desktop-rewrite.md)
intentionally changes their architecture; do not apply its storage or service
rules to legacy maintenance. Implementation instructions live in the
[CLI guide](../cli/agents.md) and [web guide](../web/agents.md).

## Legacy decisions

The June 2026 architecture chose a plain-directory vault and external-agent
maintenance. Preserve these boundaries until a separately assigned migration:

- **Originals and generated artifacts have different owners.** Sources are user
  evidence; the agent maintains artifacts under the vault's own workflow
  contract. Task/workout/area/metric extraction belongs to that agent. The CLI
  stores, indexes, and queues work; it does not generate prose through an LLM API.
- **Semantic retrieval is wiki-scoped.** Only `llm-wiki` artifacts are embedded;
  sources and other artifacts use keyword retrieval. Do not restore tags or the
  discarded `rewritten` layer as an alternative retrieval model.
- **HTML is a legacy presentation format, not indexed evidence.** Paired
  Markdown/HTML artifacts allow different document types to supply their own
  views. Untrusted HTML must remain behind the sandboxed iframe or sanitized
  external-window path. Renderers never open the filesystem or database directly.
  Legacy search-result HTML intentionally does not navigate within its sandbox;
  documents open through app commands. This restriction is separate from the
  rewrite's navigable wiki links.
- **Configuration belongs in files.** Global settings register vaults and supply
  defaults; per-vault settings override them. The old `KN_*` environment-based
  configuration is retired. This does not remove the dev shell's explicit
  process-launch overrides.
- **Embedding infrastructure stays external to the CLI.** Do not restore
  CLI-owned Docker/Podman TEI lifecycle management. Packaged-app service UX is a
  separate design task.
- **Buttons, shortcuts, and the palette execute the same commands.** A single
  registry keeps behavior, errors, and option forms consistent regardless of
  entry point; browser-only backend failures must be visible.
- **Pinned views are independent of active tabs.** Any artifact type can remain
  beside the current document as a dashboard. Notification history moved to the
  left menu to avoid competing with the right widget bar. Persist view identity
  and layout, not generated HTML snapshots.

Earlier `ask`, built-in LLM/rewrite, `add/get/report/template/tag` CLI surfaces,
the old MCP server, and the old pane/floating-window/sidebar/3D-graph workbench
are retired directions. Their old command tables and smoke recipes are not
implementation requirements. MCP/skills may be redesigned later; PageIndex is
only a proposed experiment. Cluster analysis was reserved for a future frontend
with direct vector access, not another CLI command. Do not resurrect deleted
implementations simply because they appear in Git history.

## UI failures and remedies

These are the 2026-06-10 legacy workbench findings, including subsequent user
corrections. They retain the cause and remedy, not a completed implementation
checklist. Build checks were recorded, but the full GUI walkthrough was not
performed at that time.

| Failure or user correction | Cause / remedy worth retaining |
| --- | --- |
| Source modal broke the page layout | Missing modal CSS let it participate in the main flex row; use a fixed backdrop and a self-contained dialog layout. |
| Empty pill remained after closing the last tab | The zero-tab render guard had been disabled; empty overlay containers need an explicit empty-state decision. |
| Tool popup was invisible or covered by a toast | An ancestor's `overflow: hidden` clipped it, and its layer was below the toast. Anchor the popup to the trigger rect using fixed positioning, above toasts and below the palette. |
| Settings advertised nonfunctional features | The keybinding-profile control had no implementation; sidebar width/collapse settings survived the sidebar removal. Replace an inert control with working behavior or remove it, rather than persisting a misleading preference. |
| Escape opened the palette | This conflicted with dismissal conventions. Reserve Escape for closing/cancelling; use `Mod+K` for the palette and avoid shortcuts owned by Electron's menu. |
| Palette lacked keyboard selection and had a dead sort footer | Add arrow navigation, Enter on the selected result, and hover synchronization; MRU ordering replaced the inactive sorting control. |
| Clicking a menu button appeared to do nothing | Hover opened it before click toggled it closed. Open by click; use hover only to switch an already-open menu. Outside pointerdown, Escape, and window blur handle dismissal, including iframe focus. |
| Dialogs dismissed inconsistently | Use shared Escape/backdrop behavior; in the palette, leave an option form before closing the whole dialog. |
| Sandboxed documents ignored theme/font changes | Hardcoded document styles diverged from the app. Pass a validated runtime theme snapshot to iframe and external-window rendering, and refresh it on theme changes. |
| Overlays and corner radii drifted visually | Literal colors, decoration, and unrelated radius values bypassed tokens. Reuse the overlay token and the small shared radius scale. |
| Long-running operations appeared stalled | Start/end toasts alone cannot represent a long job. Keep ongoing work visible in notification history and the bell's activity indicator. |
| Vault connection state disappeared with its toast | Give vault identity/connection state a persistent status surface with a status action. |
| Unread badge counted messages already seen, or cleared on close | A fully displayed/dismissed toast and messages shown in an open history are seen; a toast interrupted by another message is unread. Clear on opening history, not on every toggle. |
| Switching tabs lost document scroll | Recreating iframes lost their internal state. Keep per-tab scroll containers and a bounded cache of eight recent document iframes; the bound is a memory tradeoff. |
| Keyboard focus could not be located | Global outline removal hid focus; restore the existing focus-ring token instead of adding another one. |
| Dialog focus escaped or disappeared on close | Trap Tab/Shift+Tab, enter at the intended control, and restore the trigger on dismissal. |
| Menu/tab semantics were incomplete | Menus need arrow/Home/End movement and focus restoration; tabs need selected-state semantics. Notification history is a dialog, not a menu. |
| User rejected hover coloring on entire tabs | Keep the tab surface/title neutral; highlight only the round close button. |
| Close icons sat off-center despite grid centering | User-agent button padding reduced the content box below the icon width; fixed-size icon buttons need explicit zero padding. |
| Centered tab overlays overlapped pinned widgets | Viewport centering ignored the widget bar. Scope tab/menu/toast overlays to the main content area; only escaping popups use viewport positioning. |

## Verification evidence and operational cautions

- **2026-06-10:** workbench builds and Electron syntax checks passed; dev-shell
  startup/vault connection was observed. These did not establish that widget,
  popup, shortcut, theme, focus, or other GUI flows worked end to end.
- **2026-06-11:** the manual CLI run exercised vault seeding, source indexing,
  queued changes, keyword search, and wiki hybrid search with TEI. The agent
  completion path used a **noop backend**, so it did not validate real-agent
  document/HTML quality or instruction compliance.
- **Embedding endpoint outage, 2026-06-11:** source/general-artifact indexing,
  keyword retrieval, and queueing still worked. Wiki embedding failed visibly
  in sync errors and remained retryable. Preserve this degraded-mode boundary;
  a failed derived index must not be mistaken for lost source content.
- **SQLite lock contention:** the old dev bootstrap could compete with IPC
  commands and produce `database is locked`. Bounded retries (two retries,
  600 ms apart) addressed that case; do not hide persistent failures with
  unlimited retries.
- **Apparently stale reads:** implicit indexing has a ten-second debounce.
  An immediate repeat search/status call may not discover a just-edited file;
  distinguish this delay from indexing failure during manual verification.
- **Manual runs use real machine configuration.** A smoke vault can change the
  global registry/active vault. Record the prior active vault, use a fresh
  disposable location, and restore that selection afterward. Vault deletion
  unregisters it and removes only its index directory; user files remain.
  Never reuse the old hardcoded `/tmp/kn-smoke` cleanup recipe blindly.
- **Environment limits:** keyword/queue checks need no embedding endpoint;
  wiki semantic checks do. macOS Metal TEI was run independently of the CLI.
  Do not register a login service merely to check source ingestion.
- **Historical coverage is limited.** The old CLI/web suites and web bootstrap
  environment were removed. Typechecks/builds are not interaction coverage.
  The user's 2026-09-16 instruction defers new test automation and CI; old
  roadmap requests to recreate harnesses are not authorization to do so.

Use package guides for exact check commands and [the prototype README](../v2/README.md)
for F0 walkthrough evidence, including the file-chooser tooling limitation.
For a legacy manual pass, use disposable data and cover source import → queued
sync → keyword search without TEI → wiki retrieval with TEI → real-agent
output/re-indexing, including endpoint-down behavior. In the desktop shell,
cover vault creation/switching, source import, note save, template browsing,
equivalent button/palette actions, widget resizing/restoration, notification
read state, both tab docks, and keyboard focus/dismissal. A planned walkthrough
is not a recorded success.

## Unresolved legacy work

Carried forward from the 2026-06-11 roadmap, not revalidated or newly scheduled
by this consolidation. Check applicability before resuming legacy work; the
rewrite has its own milestones.

| Original priority | Open decision or acceptance gap |
| --- | --- |
| P0 — agent loop | Validate a real codex/claude run and artifact/HTML quality against the vault contract. Decide stdout/result capture and a durable per-run summary rather than relying on inherited logs. |
| P0 — source semantics | Decide and persist `media_type`, `privacy`, `time_scope`, `wiki_policy`, and `extraction_status`; UI drafts alone do not enforce policy. Design PDF/OCR/text/image-caption projections with confidence and page/region provenance. |
| P0 — workbench | Complete the actual dev-shell walkthrough against the new vault layout. Decide whether to expose the JSONC config bridge or deliberately keep settings in localStorage; retain only a rebuildable web cache with CLI metadata authoritative. |
| P1 — packaging | Normalize package naming, `bin.kn`, check scripts, TypeScript pinning, and build layout. A stable executable matters for agents and launchd independently of repository paths. |
| P1 — retrieval | Evaluate CJK trigram/preprocessing and define the PageIndex experiment. |
| P1 — graph | Connect real `document_graph_edges` before reviving the legacy 2D/3D graph renderer; an edge-less Explorer projection is not graph evidence. This deferral does not apply to the separate F0 wiki graph. |
| P1/P2 — platform | Consider Linux/systemd and packaged-app local TEI start/stop/status, including macOS defaults; CLI-owned container lifecycle remains excluded. |
| P2 — integrations | Redesign MCP/skill exposure when assigned; do not restore the discarded server wholesale. |
