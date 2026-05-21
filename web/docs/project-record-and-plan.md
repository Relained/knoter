# Project Record And Plan

Last updated: 2026-05-09

## Current Baseline

- Branch: `dev`
- Current head: `3d11fac Allow floating windows to touch viewport edges`
- Frontend stack: React, TypeScript, Vite
- Verification command: `npm test`
- Development URL used during this phase: `http://127.0.0.1:39281/`

## Trace Log

This section records the implementation history in a form that can be followed from git history.

### Workspace Interaction And Drag UX

- `0bab38d` Move dragged tabs beside target tabs
  - Added rule that dragging a tab beside another tab inserts it as a tab instead of creating a pane.
- `9a9c4d0` Animate tab insertion preview
  - Added tab placement preview animation.
- `8714676` Render active window highlight above tabs
  - Fixed active pane/floating highlight layering above tabs and toolbars.
- `b19f128` Use overlay-only tab insertion preview
  - Removed layout-shifting gap approach for tab insertion preview.
- `94826c8` Calculate tab insertion points per strip
  - Changed insertion point calculation from per-tab points to strip-level boundaries.
- `b71a4d1` Size self tab insertion preview to tab
  - Made self-tab preview match the original tab shape.
- `8ef8b1f` Collapse self tab insertion boundary
  - Removed duplicate self insertion point behavior.
- `86ca5d5` Match self tab preview shape
  - Finalized self-tab indicator sizing and shape.
- `b3c94cc` Document workspace interaction policy
  - Captured tab drag, menu drag, floating, focus, and config rules.
- `9d98ccc` Constrain floating windows to viewport
  - Applied unified viewport constraints during floating drag, resize, reducer updates, and viewport resize.
- `3d11fac` Allow floating windows to touch viewport edges
  - Removed right/bottom forced padding so floating windows can touch all viewport edges symmetrically.

### Settings, Theme, Icons, And Runtime Config

- `b2aab0e` Expand global settings controls
  - Added global settings controls in the settings view.
- `80e4818` Add global config file bridge
  - Added JSONC global config bridge and file sync path.
- `80f12cd` Add configurable typography settings
  - Split typography settings into interface and editor font family/size.
- `7e7fde5` Add configurable font family stacks
  - Added custom CSS font-family stacks for `sans-serif`, `serif`, and `monospace`.

### Workspace Object System

- `575efbc` Extract workspace object renderers
  - Moved object rendering behind a renderer registry.
- `0dfb90b` Add template workspace objects
  - Added initial object keys and commands for Settings, Graph 3D, Tasks, Todo, and Calendar.
- `5ef7dd5` Add settings workspace object
  - Added Settings as a floating workspace object opened by command.
- `8373b1a` Add workspace object state store
  - Added `objectStates` to `WorkspaceState`.
  - Added object state reducer and persistence paths.
- `f944d59` Implement editable todo workspace object
  - Implemented Todo as an editable object state view.
- `1f9cb81` Implement editable tasks workspace object
  - Implemented Tasks as an editable lane board.
- `7ee0ddf` Implement editable calendar workspace object
  - Implemented Calendar as an editable dated event list.
- `9cd273c` Document editable workspace object state
  - Documented object-state persistence and editable object behavior.
- `a5e49ea` Unify notes as markdown object hosts
  - Converted notes into Markdown editor/viewer objects.
  - Added Markdown object embed syntax such as `[[object:Todo]]`.
- `5ceca16` Open embedded objects as workspace views
  - Added embed actions to open embedded objects as pane tabs or floating windows.
  - Added project record document.

## Current Architecture

### State Layers

- `WorkspaceState`
  - pane layout
  - tabs
  - floating windows
  - active pane/window
  - `objectStates`
- `GlobalSettings`
  - sidebar state
  - Base16 theme id
  - icon theme id
  - interface/editor typography
  - motion scale
  - keybinding profile
- Workspace persistence
  - stored under `knoter.workspace-state.v1:<scope>`
  - normalized in `src/state/persistence.ts`
- Global settings persistence
  - stored as JSONC text under `knoter.global-settings.v1`
  - intended file name: `knoter.config.jsonc`

### Object Model

- `WorkspaceObjectKey` identifies the current concrete singleton object.
- `WorkspaceObjectKind` selects the renderer family.
- `WorkspaceObjectState` stores editable data.
- Current editable object states:
  - `Note`: Markdown content and mode
  - `Todo`: checklist items
  - `Tasks`: lane-based task items
  - `Calendar`: dated events
- Current preview-only object:
  - `Graph 3D`, deferred until renderer/state model is chosen.

### Markdown Host Model

- Notes are Markdown object hosts.
- Markdown supports object embeds:
  - `[[object:Todo]]`
  - `[[object:Tasks]]`
  - `[[object:Calendar]]`
  - `[[object:Graph 3D]]`
- Embedded objects and full-pane/floating objects share the same `objectStates[WorkspaceObjectKey]`.
- Embed controls:
  - open in active pane as a tab
  - open as floating window

### Search Model

- Search is not modeled as a standalone pane object.
- Sidebar search filters notes and workspace views.
- Command palette search matches:
  - command id
  - label
  - hint
  - note Markdown keyword content

### Typography Settings

- Interface typography and editor typography are separate.
- Each side chooses one family category:
  - `sans-serif`
  - `serif`
  - `monospace`
- Each category has a configurable CSS font-family stack in `fontStacks`.
- Runtime CSS variables:
  - `--font-sans`
  - `--font-serif`
  - `--font-monospace`
  - `--font-ui`
  - `--font-editor`
  - `--font-size-ui`
  - `--font-size-editor`

## Decisions

- Graph 3D is deferred until the graph renderer and state model are chosen.
- Search is not a standalone pane object. Search belongs to navigation surfaces:
  - sidebar filtering
  - command palette matching
- Notes are Markdown workspace objects, not static placeholder pages.
- Workspace objects can be mounted in two places:
  - as a full pane or floating window
  - embedded inside Markdown with object blocks such as `[[object:Todo]]`
- Embedded objects and full-pane objects share the same `objectStates[WorkspaceObjectKey]` entry.
- Current `WorkspaceObjectKey` state is singleton-style. Multiple instances of the same kind require a future `objectId` model.
- Floating windows must remain fully inside the viewport during drag, resize, restoration, and viewport resize.
- Floating windows may touch all four viewport edges.

## Implemented

- Base16 theme runtime and global settings JSONC flow.
- Runtime icon theme extension point with semantic icon ids.
- Separate interface/editor typography settings:
  - font family: `sans-serif`, `serif`, `monospace`
  - font size: UI and editor controlled independently
  - custom font-family stacks for each family category
- Movable menu and pane toolbar edge previews.
- Tab drag split and tab insertion behavior.
- Sidebar collapse and resize.
- Workspace reducer, persistence, and unit test harness.
- Editable object states:
  - `Note`: Markdown content and mode
  - `Todo`: checklist items
  - `Tasks`: lane items
  - `Calendar`: dated events
- Markdown object embeds:
  - `[[object:Todo]]`
  - `[[object:Tasks]]`
  - `[[object:Calendar]]`
  - `[[object:Graph 3D]]` as preview-only until Graph 3D is implemented

## Current Phase

The current phase is closed at `3d11fac`.

Completed closure items:

1. Embedded object open actions are implemented.
2. Markdown host behavior is documented.
3. Typography settings are split and configurable.
4. Floating window viewport constraints are symmetric and tested.
5. Project record is consolidated in this document.

## Next Plan

1. Add object instance model.
   - Introduce `objectId` separately from `WorkspaceObjectKind`.
   - Keep `WorkspaceObjectKey` compatibility for current singleton objects.
   - Allow multiple documents, task boards, todo lists, calendars, and canvases.

2. Improve Markdown editor quality.
   - Replace simple textarea/parser with a proper editor and Markdown pipeline.
   - Candidate editor: CodeMirror for pragmatic Markdown editing.
   - Keep object embeds as first-class blocks.

3. Add embed insertion UX.
   - Slash command or toolbar menu for inserting object blocks.
   - Object picker should use existing command/search infrastructure.

4. Expand search.
   - Search across note Markdown content and object states.
   - Show grouped results in sidebar and command palette.
   - Add result jump/open actions.

5. Define Graph 3D separately.
   - Decide renderer: likely Three.js.
   - Define graph state from existing object links instead of isolated mock data.
   - Keep it compatible with full-pane and embedded mounting.

6. Continue tokenizing configurable UI constants.
   - Promote frequently changed component spacing, radius, and density values to semantic CSS variables.
   - Keep user-facing settings coarse enough to avoid unstable per-component configuration.

7. Add floating window polish.
   - Optional snap zones.
   - Optional remembered per-object floating bounds.
   - Keyboard accessible window movement.

8. Add settings export/import affordances.
   - Preserve JSONC as the editable source.
   - Validate font stack strings and theme ids before applying.

## Regression Checks

Before merging each phase:

- `npm test` passes.
- Tab drag preview keeps tab and pane modes separated.
- Menu drag guide line remains separate from tab drag preview.
- Sidebar collapse and resize still work.
- Markdown embeds and full-pane objects share object state.
- Opening an embed into a pane activates a tab without creating a floating window.
- Opening an embed as floating does not mutate pane layout.
- Floating windows stay fully inside viewport bounds.
- Floating windows can touch left, top, right, and bottom edges.
- Global font settings survive JSONC save/load and clamp invalid sizes.
