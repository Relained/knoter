# Workspace Interaction Policy

This document defines the expected drag, drop, docking, preview, and focus behavior for workspace objects.

The goal is to keep interaction rules explicit before adding more object types such as `graph3d`, `tasks`, `todo`, and `calendar`.

## Workspace Objects

All screen content is represented by a workspace object.

- `WorkspaceObjectKey` identifies a concrete object, such as `Dashboard`, `Settings`, `Tasks`, or `Calendar`.
- `WorkspaceObjectKind` selects the renderer family, such as `note`, `settings`, `tasks`, or `calendar`.
- `WorkspaceObjectState` stores editable object data by object key, independently from pane and floating window placement.
- Panes and floating windows host workspace objects through tabs or floating window models.
- Renderers are resolved through `workspaceObjectRenderers`, not by direct branching in `ScreenContent`.

New object types must follow this path:

- Add the object key and kind in `src/domain/types.ts`.
- Register the object in `workspaceObjects`.
- Add a default object state in `createDefaultObjectState` when the object is editable.
- Add a renderer and map it in `workspaceObjectRenderers`.
- Read and write object data through `objectState` and `onChangeObjectState`.
- Add commands only if the object should be user-openable from the command palette.

Current editable workspace objects:

- `Note`: Markdown editor/viewer content.
- `Todo`: checklist items.
- `Tasks`: lane-based board items.
- `Calendar`: dated events.

Markdown notes may embed workspace objects with an object block:

- `[[object:Todo]]`
- `[[object:Tasks]]`
- `[[object:Calendar]]`

The embedded object and the full-pane object read and write the same `objectStates[WorkspaceObjectKey]` entry.
Embedded object blocks expose open actions:

- Open in pane: adds or activates the object as a tab in the active pane.
- Open floating: opens the object as a floating window.

Current preview-only workspace objects:

- `Graph 3D`: placeholder until the graph rendering engine is selected.

## Tab Dragging

Tab dragging has two distinct drop modes.

`tab` mode:

- Triggered when the pointer is over a tab strip.
- The tab strip computes insertion boundaries once for the whole strip.
- Boundaries are `before first`, `between adjacent tabs`, and `after last`.
- A dragged tab's original slot is represented by exactly one self boundary.
- A self boundary uses the original tab rect as the preview shape.
- Non-self boundaries use a narrow overlay marker.
- Dropping in `tab` mode dispatches `moveTabToPane`.
- `moveTabToPane` inserts into the target pane's tab list and must not create a new pane.
- If the source pane becomes empty and another pane remains, the source pane is removed from the layout.

`pane` mode:

- Triggered when the pointer is over pane content or pane edge regions outside tab insertion boundaries.
- Preview is a pane placement preview, not an insertion marker.
- Dropping in `pane` mode dispatches `splitTabToPane`.
- `splitTabToPane` creates or replaces a pane according to the target edge.

Tab drag preview rules:

- Tab insertion preview must not move real tabs.
- Tab insertion preview must not change hit targets.
- Tab insertion preview uses overlay-only rendering.
- Pane split preview may animate pane region changes.
- Tab drag does not use the menu-bar guide line.

## Menu And Toolbar Dragging

Menu and toolbar edge dragging is separate from tab dragging.

- App menu dragging changes `WorkspaceState.menuPosition`.
- Pane toolbar dragging changes only the owning pane's `toolbarPosition`.
- Floating toolbar dragging changes only the owning floating window's `toolbarPosition`.
- Menu drag preview uses the edge guide line.
- Toolbar drag preview may use the edge guide line.
- Tab drag preview must not show the edge guide line.

## Pane Creation And Inheritance

Pane inheritance is defined in `docs/pane-inheritance.md`.

Current rules:

- Dragged tab to new pane inherits the source pane's `toolbarPosition`.
- Dragged tab movement must not mutate global `menuPosition`.
- A new tab opened in an existing pane keeps that pane's `toolbarPosition`.
- Stale target pane ids outside the layout are ignored.

## Floating Windows

Floating mode moves the active tab out of its source pane.

- Floating an active pane opens the pane's active tab as a floating window.
- The floated tab is removed from the source pane.
- If a non-final pane becomes empty after floating, the source pane is removed.
- If the only remaining pane becomes empty, the pane remains as an empty valid tile.
- Floating windows keep independent `toolbarPosition`, position, size, and z-index.

Docking a floating window:

- Creates a pane from the floating window's object key.
- Splits relative to the active pane when possible.
- Removes the floating window after docking.

## Focus Highlighting

Active pane and focused floating window highlighting must render above tabs, titlebars, and toolbars.

- Highlighting is drawn with a pointer-events-none overlay.
- Highlighting must not interfere with tab clicks, tab drag, toolbar actions, or resize handles.
- The active pane highlight and focused floating highlight should share the same layer strategy.

## Config And Runtime Settings

Global settings are separate from workspace layout state.

- Workspace layout is persisted as workspace state.
- Editable object data is persisted under workspace state as `objectStates`.
- Preferences are persisted as `knoter.config.jsonc` text in global settings storage.
- File I/O is routed through the optional `window.knoterConfigFile` bridge.
- If the bridge is absent, JSONC editing still works through local runtime storage.

Runtime settings currently include:

- Sidebar collapsed state
- Sidebar width
- Base16 theme id
- Icon theme id
- Motion scale
- Keybinding profile slot

Search is not a standalone workspace object. Search belongs to navigation surfaces:

- Sidebar search filters vault notes and workspace views.
- Command palette search matches commands, notes, object titles, and note markdown content keywords.

## Required Regression Coverage

Reducer tests should cover:

- Dragged tab beside another tab inserts as a tab, not a pane.
- Dragged tab to pane edge creates a pane.
- Moving the only tab out of a pane removes the empty source pane when another pane remains.
- Floating removes the active tab from its source pane.
- Floating a final pane preserves a valid empty pane.
- Settings and template objects open as floating workspace objects.
- Object states survive workspace save and load.
- Note markdown state survives workspace save and load.
- Command palette note commands include markdown content in search keywords.
- Embedded objects can be opened into a pane without duplicating object state.

Runtime tests should cover:

- Global config JSONC normalization and previous-state preservation.
- Config file bridge read, write, and subscribe behavior.
- Command palette entries dispatch the expected object open actions.
