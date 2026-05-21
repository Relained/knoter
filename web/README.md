# Knoter Web

React + TypeScript renderer frontend template for a dense Electron workspace application.

## Features

- Obsidian-style sidebar, main viewer, tabs, and split panes
- Pane splitting uses a tiling-window tree: leaf panes are replaced by horizontal or vertical split containers
- The single Split Pane command chooses horizontal split for wide panes and vertical split for tall panes
- Command palette first workflow with `Ctrl+K` / `Cmd+K`
- Draggable and resizable floating windows above the app surface
- Screens can be docked in the main workspace or opened as floating windows
- Drag edge-position icons to preview and snap toolbars or the app menu to top, right, bottom, or left
- Color scheme tokens are isolated in `src/styles/tokens/`
- Shared motion curves and durations are isolated in `src/styles/tokens/motion.css`
- Workspace state is restored from `localStorage`
- UI icons are routed through `src/icons/` semantic icon ids
- Interface and editor typography can be configured separately, including family choice, size, and custom family stacks
- Notes are editable Markdown objects with editor, preview, and split modes
- Todo, Tasks, and Calendar workspace objects keep editable per-object state
- Workspace objects can appear inside Markdown via object blocks such as `[[object:Todo]]`
- Graph 3D is currently a template preview object; the real graph engine is deferred
- Search is integrated into the sidebar and command palette rather than modeled as a pane object

## State Persistence

The renderer saves panes, tabs, split mode, menu position, floating windows, focused floating window, z-order, and workspace object states under `knoter.workspace-state.v1:<scope>`.

Workspace object state is keyed by `WorkspaceObjectKey`, so multiple panes or floating windows showing the same object share the same underlying state. Current editable object states include:

- `Note`: Markdown content and view mode
- `Todo`: checklist items
- `Tasks`: lane-based task board items
- `Calendar`: dated events

The default scope is `default`. Pass `?workspace=...` or `?vault=...` in the renderer URL to isolate saved state per workspace.

For a packaged Electron app, keep this contract and replace the `localStorage` calls in `src/state/persistence.ts` with an IPC-backed file store when you need cross-device sync or explicit vault-level state files.

## Structure

- `src/domain/`: workspace data and object factories
- `src/state/`: persistence and state normalization
- `src/utils/`: shared geometry helpers
- `src/components/`: renderer UI components
- `src/icons/`: semantic icon registry and renderer
- `src/styles/tokens/`: Base16, semantic, component, motion, density, and typography tokens
- `src/styles/components/`: component-level CSS modules
- `src/styles/index.css`: ordered style entrypoint

## Tiling Model

The workspace follows the core i3/tmux rule: split the focused pane, not the whole workspace. A split replaces one leaf pane with a split container whose children are panes or nested split containers.

- `horizontal`: new pane is placed next to the focused pane
- `vertical`: new pane is placed below the focused pane
- Empty panes are kept only when they are the sole remaining pane; otherwise closing the last tab removes the pane
- Closing a pane collapses single-child split containers

## Run

Install dependencies, then run the Vite dev server:

```sh
npm install
npm run dev
```

The dev and preview servers are pinned to `http://127.0.0.1:39281` with
`strictPort`, so port conflicts fail loudly instead of moving to another port.

## Verify

```sh
npm run check
npx playwright install chromium
npm test
npm run test:e2e
```

`npm run test:e2e` uses Playwright to start the Vite dev server on `39281` and
drive Chromium through a smoke path covering the workspace shell, command
palette, Settings, split pane, floating windows, and console/page error checks.
Install the Chromium browser binary once with `npx playwright install chromium`
on clean machines or CI images that do not already cache Playwright browsers.

In Electron development, point your `BrowserWindow` at the Vite dev URL:

```js
mainWindow.loadURL("http://127.0.0.1:39281");
```

For production packaging, build the renderer and load the generated file:

```js
mainWindow.loadFile("dist/index.html");
```
