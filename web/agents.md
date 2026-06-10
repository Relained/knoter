# knoter Web Agent Guide

Last updated: 2026-06-10
Project: `Documents/knoter/web`
Language for this file: English

This is the single active agent instruction file for the `web/` package. The
previous GPT harness document and `web/docs/*` design notes were removed; root
`docs/` is the only shared documentation location.

## Project Snapshot

- Stack: React 18, TypeScript, Vite 5, Electron development shell.
- Dev/preview URL: `http://127.0.0.1:39281` with `strictPort`.
- The renderer is an HTML-first workbench: documents open as HTML page tabs
  (`HtmlTab`) driven by a command palette and overlay bars. The earlier
  pane/tab/floating-window workspace, sidebar surface host, renderer registry,
  keybinding system, workspace reducer, and Graph 3D preview were removed. Do
  not resurrect those modules or reference their docs.
- A right-side widget bar pins any view as an always-visible widget
  (equal-ratio vertical split, drag resize); status messages surface through a
  bell icon in the overlay menu bar plus a 4s transient toast. Design notes:
  `docs/design/widget-bar.md`.
- There is no web unit-test or Playwright harness. `npm run check`
  (TypeScript + Vite build) is the only automated verification. Do not claim
  test coverage that does not exist.
- The workbench is wired to `window.knoterApi` (CLI-backed Electron IPC):
  vault documents load on mount and surface as dynamic "Open:" palette
  commands; builtin fixture views (`src/workbench/fixtures.ts`) remain as
  demo tabs/widgets. All actions run through the command registry
  (`src/workbench/commands/registry.ts`) — every UI button calls
  `executeCommand(id)`, the same path as the command palette. Commands with
  options open a second palette stage (option form). Design notes:
  `docs/design/web-commands.md`.

## Code Map

| Path | Role |
| --- | --- |
| `src/main.tsx` | Renderer mount; installs theme, icon, and global-config runtimes. |
| `src/workbench/App.tsx` | Workbench shell state: tabs, pinned widgets, tools, palette, modals, notification history, transient toast. |
| `src/workbench/components/*` | Overlay menu/tab bars, widget bar, notification menu, command palette overlay, HTML page view, settings page, source modal, tool menu. |
| `src/workbench/components/WidgetBar.tsx` | Right-side pinned widget stack: ratio-based vertical split, divider drag resize, bar width drag resize. |
| `src/workbench/components/NotificationMenu.tsx` | Bell popup listing the status message history (dismiss/clear). |
| `src/workbench/fixtures.ts` | Initial tabs, builtin view registry (`builtinViews`), tool items, source draft fixture data. |
| `src/workbench/types.ts` | Workbench types: `HtmlTab`, `WorkbenchWidget`, `WorkbenchCommand`, `CommandOption`, `SourceRecord`, `ToastMessage`, tool keys. |
| `src/workbench/commands/registry.ts` | Single command source: declarative UI + backend commands with option schemas, dynamic open/pin/document commands, result-tab HTML builders. |
| `src/workbench/commands/keybindings.ts` | Chord→command keybinding store: defaults (`Mod+K` palette, `Mod+S` note save, tab cycling), platform `Mod` expansion, conflict-resolving assignment, localStorage persistence. |
| `src/workbench/utils/widgets.ts` | Widget pin/unpin/resize state helpers and localStorage layout persistence. |
| `src/workbench/utils/markdown.ts` | `marked`-based markdown→HTML conversion and frontmatter stripping for vault documents. |
| `src/workbench/utils/html.ts` | `sourceToHtml`, sandbox document builder (page/compact), HTML escaping. |
| `src/core/api/*` | Typed renderer API contract (`KnotenApiClient`). |
| `src/core/ipc/contracts.ts` | IPC channel/request/response contracts. |
| `src/core/preload/knoterApi.ts` | Preload adapter shape shared with `electron/preload.cjs`. |
| `src/core/settings/*` | Global settings: JSONC text model, normalization, localStorage persistence, optional config-file bridge. |
| `src/shared/icons/*` | Semantic icon registry and runtime (lucide-based). |
| `src/shared/theming/*` | Base16 theme runtime. |
| `src/shared/styles/*` | Token CSS plus `components/html-workbench.css`, the active layout/interaction styles. |
| `electron/main.mjs` | Electron shell, CLI-backed IPC handlers, external HTML window. |
| `electron/preload.cjs` | `window.knoterApi` context bridge. |
| `electron/cli-contract.mjs` | CLI argument building and input validation shared by handlers. |
| `scripts/dev-electron.mjs` | `npm run dev` orchestration: test vault bootstrap, Vite, Electron. |

## IPC And Backend Boundary

- Renderer code stays behind `window.knoterApi`. Never import Node or Electron
  APIs inside `src/`; Electron-side changes belong in `electron/` and the
  contracts in `src/core/`.
- Current IPC surface (preload + main handlers):
  - `vault.getActive`, `vault.switch`, `vault.list`, `vault.status`
  - `explorer.list`, `explorer.read`, `explorer.refresh`
  - `graph.get`, `graph.refresh` (lightweight Explorer projection; edges are
    currently empty)
  - `search.query`, `sync.run`
  - `source.addFromPicker` (native dialog → `kn add`), `note.save`
    (temp file → `kn add`)
  - `template.get`, `template.list`, `tag.list`, `tag.update`
  - `report.context`, `llm.rewrite` (codex|claude)
  - `html.openWindow` (optional `theme` snapshot; the main process validates
    hex colors and the font-family charset before interpolating styles)
- Electron main handlers shell out to the CLI as
  `bun <repo>/cli/src/cli.ts --format json ...`. Override with
  `KNOTER_CLI_ENTRY`, `KNOTER_CLI_RUNNER`, `KNOTER_CLI_TIMEOUT_MS`.
  Indexing calls (add/sync/report) use a 120s timeout, `llm.rewrite` 300s;
  transient SQLite `database is locked` errors are retried twice.
- Explorer items combine the effective template (`kn template get`) with the
  active vault's `sources/**/*.md`, legacy `rewritten/**/*.md`, and
  `artifacts/**/*.md`. This is an interim CLI-backed bridge, not a packaged
  daemon; the renderer never owns SQLite or vault files directly.
- The settings runtime accepts an optional `window.knoterConfigFile` JSONC
  file bridge. The current preload does not expose it, so global settings
  persist through renderer `localStorage` only.

## HTML Safety Rules

Agent/artifact HTML is untrusted input:

- In-app rendering must go through the sandboxed iframe in
  `src/workbench/components/HtmlPageView.tsx` (`sandbox=""`, no scripts).
  Vault markdown is converted with `marked`
  (`src/workbench/utils/markdown.ts`) and then flows through the same
  sandbox/sanitize path — never render converted markdown outside it.
- Detached windows must go through `html:openWindow` in `electron/main.mjs`,
  which strips script/iframe/object/embed/link/meta tags, inline event
  handlers, and external/`javascript:`/`data:` URLs, then applies a deny-all
  CSP in a sandboxed window.
- Keep both paths intact when changing HTML rendering. Never render raw agent
  HTML with `dangerouslySetInnerHTML` outside these wrappers.

## UI Conventions

- Keep the dense workbench design: no landing-page sections, marketing blocks,
  nested cards, or decorative backgrounds.
- Use the semantic icon registry (`src/shared/icons/registry.tsx`) instead of
  one-off SVGs.
- Style through the token CSS under `src/shared/styles/tokens/` and component
  CSS under `src/shared/styles/components/`; avoid inline style sprawl.
- New functionality goes through `src/workbench/commands/registry.ts` as a
  `WorkbenchCommand` (with option schemas when it takes parameters). Buttons
  must call `executeCommand(id)` instead of bespoke handlers so every action
  stays reachable and identical from the command palette.
- Overlay placement: the menu bar, tab bar, and transient toast are
  absolute-positioned inside `.workbench-main` (the main HTML view area), so
  they never overlap the widget bar. Tool-menu/notification popups are
  fixed-positioned from the open slot's rect because `.overlay-bar` clips its
  contents (`overflow: hidden`) — do not switch them back to absolute.
  Fixed-size icon buttons need explicit `padding: 0`, or the UA button padding
  shifts grid-centered icons. Tab surfaces show no hover color; the circular
  close button is the only per-tab hover affordance.
- Sandboxed and external HTML documents take colors and font from
  `getSandboxTheme()` in `src/workbench/utils/html.ts` (active base16 scheme +
  UI font stack) — do not hardcode palette values in generated documents.
- Dialogs (settings, source modal, command palette) dismiss through the
  shared `useDialogDismiss` hook (Escape + backdrop pointer-down). Palette
  results are MRU-ordered (`src/workbench/commands/mru.ts`); ↑/↓ move the
  selection and hover syncs it.
- Long-running backend commands wrap their work in
  `beginOperation`/`endOperation` (command context) so the bell spinner and
  the notification popup show progress; the bottom-right `StatusChip` shows
  the active vault, document count, and connection warnings.
- Keyboard shortcuts bind chords to command ids through
  `src/workbench/commands/keybindings.ts`; the dispatcher lives in `App.tsx`.
  Escape is reserved for dismissal — never bind it or use it to open surfaces.
  Avoid default chords that the Electron default menu owns (`Mod+W`, `Mod+R`,
  `Mod+M`, `Mod+Q`, `Mod+Shift+R`). Users edit bindings in Settings →
  Keyboard Shortcuts.
- Known design-defect backlog and fix sequencing live in
  `docs/plan/web-fix-plan.md` — consult it before reworking
  layout/interaction.

## Commands

Use npm (not bun) inside `web/`:

```bash
cd web
npm install
npm run check   # tsc --noEmit && vite build — verification baseline
npm run dev     # test vault bootstrap + Vite on 127.0.0.1:39281 + Electron shell
```

`npm run dev` runs `cli/scripts/test-env.sh ensure` first and points `KN_HOME`
at `cli/.test-kn-home` so the IPC bridge sees the test vault. Set
`KNOTER_DEV_TEST_VAULT=0` to skip the bootstrap, or `KNOTER_DEV_TEST_VAULT=1`
to make bootstrap failure stop dev startup.

## Verification Baseline

Before web-affecting commits:

```bash
cd web
npm run check
git diff --check
```

There is no automated behavior harness. For interaction changes, run
`npm run dev`, exercise the affected flow manually, and report exactly what was
verified (and what was not).
