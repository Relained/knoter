# Pane Inheritance Policy

Pane creation has two separate state classes:

- Workspace chrome: `WorkspaceState.menuPosition`
- Pane chrome: `Pane.toolbarPosition`

`menuPosition` is global workspace state. It is not copied into panes and must stay unchanged when tabs move or panes are split.

`toolbarPosition` is pane-local state. When a dragged tab creates a new pane, the new pane inherits `toolbarPosition` from the source pane that owned the tab.

Current rules:

- New tab in an existing pane keeps that pane's existing `toolbarPosition`.
- Dragged tab to new pane inherits the source pane's `toolbarPosition`.
- Dragged tab movement does not mutate global `menuPosition`.
- Stale target pane ids outside the layout are ignored; the split falls back to the source pane.
- Floating windows keep their own `toolbarPosition` model.
