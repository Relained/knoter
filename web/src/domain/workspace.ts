import type {
  EdgePosition,
  FloatingWindowModel,
  LayoutNode,
  NoteKey,
  Pane,
  SplitDirection,
  Tab,
  WorkspaceObjectState,
  WorkspaceObjectKey,
  WorkspaceObjectKind,
  WorkspaceObjectStates,
  WorkspaceState
} from "./types";
import { defaultGraph3DFilters } from "../graph3d/model";

export const toolbarPositions = ["top", "right", "bottom", "left"] as const;
export const menuPositions = ["top", "right", "bottom", "left"] as const;
export const splitDirections = ["horizontal", "vertical"] as const;

export const notes = {
  Dashboard: {
    title: "Dashboard",
    summary:
      "Electron renderer shell for an Obsidian-like workspace. Panes can be split, converted into floating windows, and controlled from the command palette.",
    cards: [
      ["Tabs", "Every main pane can host multiple tabs."],
      ["Splits", "The workspace grid can split horizontally or vertically."],
      ["Floating", "Any view can live above the main app surface."]
    ]
  },
  "Project Plan": {
    title: "Project Plan",
    summary:
      "Use this screen as a structured editor, markdown preview, graph canvas, terminal, inspector, or custom plugin host.",
    cards: [
      ["Docking", "Floating windows can return to the main pane grid."],
      ["Tools", "Toolbars can move to any edge of a screen."],
      ["Menu", "The application menu can be placed on any outer edge."]
    ]
  },
  "Research Notes": {
    title: "Research Notes",
    summary:
      "A focused reading surface with local pane controls. Replace the body renderer with CodeMirror, Monaco, ProseMirror, or your own document engine.",
    cards: [
      ["Palette first", "Commands are discoverable through Ctrl/Cmd+K."],
      ["React state", "Workspace state lives in one shell component for easy extraction."],
      ["Electron ready", "Use the Vite dev server in development and packaged assets in production."]
    ]
  },
  "Canvas Draft": {
    title: "Canvas Draft",
    summary: "Canvas, graph, whiteboard, preview, and editor screens can all share the same shell contract.",
    cards: [
      ["Main view", "Screens can be docked into the pane grid."],
      ["Overlay", "Screens can be opened as draggable windows."],
      ["Resizable", "Floating windows expose a bottom-right resize handle."]
    ]
  }
} satisfies Record<NoteKey, { title: NoteKey; summary: string; cards: string[][] }>;

export type WorkspaceObjectDefinition = {
  key: WorkspaceObjectKey;
  kind: WorkspaceObjectKind;
  title: string;
};

export const workspaceObjects = {
  Dashboard: { key: "Dashboard", kind: "note", title: "Dashboard" },
  "Project Plan": { key: "Project Plan", kind: "note", title: "Project Plan" },
  "Research Notes": { key: "Research Notes", kind: "note", title: "Research Notes" },
  "Canvas Draft": { key: "Canvas Draft", kind: "note", title: "Canvas Draft" },
  Settings: { key: "Settings", kind: "settings", title: "Settings" },
  "Graph 3D": { key: "Graph 3D", kind: "graph3d", title: "Graph 3D" },
  Tasks: { key: "Tasks", kind: "tasks", title: "Tasks" },
  Todo: { key: "Todo", kind: "todo", title: "Todo" },
  Calendar: { key: "Calendar", kind: "calendar", title: "Calendar" },
  "Vault Document": { key: "Vault Document", kind: "note", title: "Vault Document" }
} satisfies Record<WorkspaceObjectKey, WorkspaceObjectDefinition>;

export function isNoteKey(value: string): value is NoteKey {
  return Object.prototype.hasOwnProperty.call(notes, value);
}

export function isWorkspaceObjectKey(value: string): value is WorkspaceObjectKey {
  return Object.prototype.hasOwnProperty.call(workspaceObjects, value);
}

export function getWorkspaceObjectTitle(objectKey: WorkspaceObjectKey | null, fallback = "Untitled") {
  return objectKey ? workspaceObjects[objectKey].title : fallback;
}

export function createTab(title: string = "Dashboard"): Tab {
  const objectKey = isWorkspaceObjectKey(title) ? title : null;
  return {
    id: crypto.randomUUID(),
    title,
    objectKey,
    noteKey: isNoteKey(title) ? title : null
  };
}

export function createPane(title: string = "Dashboard"): Pane {
  const tab = createTab(title);
  return {
    id: crypto.randomUUID(),
    toolbarPosition: "top",
    tabs: [tab],
    activeTabId: tab.id
  };
}

export function createLeafNode(paneId: string): LayoutNode {
  return {
    type: "leaf",
    paneId
  };
}

export function createSplitNode(direction: SplitDirection, children: LayoutNode[]): LayoutNode {
  return {
    type: "split",
    direction,
    children,
    sizes: children.map(() => 1)
  };
}

export function createFloating(objectKey: string = "Dashboard", offset = 0): FloatingWindowModel {
  const resolvedObjectKey = isWorkspaceObjectKey(objectKey) ? objectKey : "Dashboard";
  const resolvedNoteKey = isNoteKey(resolvedObjectKey) ? resolvedObjectKey : null;
  return {
    id: crypto.randomUUID(),
    objectKey: resolvedObjectKey,
    noteKey: resolvedNoteKey,
    title: getWorkspaceObjectTitle(resolvedObjectKey, "Floating View"),
    toolbarPosition: "top",
    x: 96 + offset * 28,
    y: 76 + offset * 22,
    width: 430,
    height: 310,
    zIndex: 60 + offset
  };
}

export function createDefaultObjectState(objectKey: WorkspaceObjectKey): WorkspaceObjectState | null {
  const kind = workspaceObjects[objectKey].kind;
  switch (kind) {
    case "note":
      return {
        kind,
        content: createDefaultMarkdownContent(objectKey),
        mode: "split"
      };
    case "graph3d":
      return {
        kind,
        nodes: ["Notes", "Tasks", "Events"],
        links: ["Notes -> Tasks", "Tasks -> Events", "Events -> Notes"],
        filters: { ...defaultGraph3DFilters }
      };
    case "tasks":
      return {
        kind,
        lanes: [
          { id: "backlog", title: "Backlog", items: ["Define object state"] },
          { id: "progress", title: "In Progress", items: ["Wire renderer props"] },
          { id: "review", title: "Review", items: ["Verify persistence"] }
        ]
      };
    case "todo":
      return {
        kind,
        items: [
          { id: "settings", text: "Review global settings", done: false },
          { id: "theme", text: "Validate theme runtime", done: true },
          { id: "objects", text: "Prepare object registry", done: false }
        ]
      };
    case "calendar":
      return {
        kind,
        events: [
          { id: "planning", title: "Planning", date: "2026-05-09" },
          { id: "review", title: "Review", date: "2026-05-10" },
          { id: "release", title: "Release Check", date: "2026-05-12" }
        ]
      };
    case "settings":
      return null;
  }
}

function createDefaultMarkdownContent(objectKey: WorkspaceObjectKey) {
  if (!isNoteKey(objectKey)) return "# Untitled\n\nStart writing.";
  const note = notes[objectKey];
  const cards = note.cards.map(([title, body]) => `## ${title}\n\n${body}`).join("\n\n");
  const embeds = objectKey === "Canvas Draft" ? "\n\n## Embedded object\n\n[[object:Todo]]" : "";
  return `# ${note.title}\n\n${note.summary}\n\n${cards}${embeds}`;
}

export function createDefaultObjectStates(): WorkspaceObjectStates {
  return Object.keys(workspaceObjects).reduce<WorkspaceObjectStates>((states, objectKey) => {
    if (!isWorkspaceObjectKey(objectKey)) return states;
    const objectState = createDefaultObjectState(objectKey);
    if (objectState) states[objectKey] = objectState;
    return states;
  }, {});
}

export function createDefaultWorkspaceState(): WorkspaceState {
  const pane = createPane("Dashboard");
  const panesById = { [pane.id]: pane };
  const floatingWindows = [createFloating("Project Plan", 0)];

  return {
    menuPosition: "top",
    sidebarExplorerFilters: {
      source: false,
      rewritten: false,
      template: true
    },
    panesById,
    layoutTree: createLeafNode(pane.id),
    objectStates: createDefaultObjectStates(),
    activePaneId: pane.id,
    floatingWindows,
    activeFloatingWindowId: floatingWindows[0].id,
    zIndexSeed: 70
  };
}

export function getPaneIdsFromLayout(node: LayoutNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.paneId];
  if (node.type === "split") return node.children.flatMap(getPaneIdsFromLayout);
  return [];
}

export function hasPaneInLayout(node: LayoutNode | null, paneId: string): boolean {
  if (!node) return false;
  if (node.type === "leaf") return node.paneId === paneId;
  if (node.type === "split") return node.children.some((child) => hasPaneInLayout(child, paneId));
  return false;
}

export function splitLayoutNode(
  node: LayoutNode | null,
  targetPaneId: string,
  direction: SplitDirection,
  newPaneId: string,
  placement: "before" | "after" = "after"
): LayoutNode | null {
  if (!node) return node;
  if (node.type === "leaf") {
    if (node.paneId !== targetPaneId) return node;
    const targetLeaf = createLeafNode(targetPaneId);
    const newLeaf = createLeafNode(newPaneId);
    return createSplitNode(direction, placement === "before" ? [newLeaf, targetLeaf] : [targetLeaf, newLeaf]);
  }

  return {
    ...node,
    children: node.children
      .map((child) => splitLayoutNode(child, targetPaneId, direction, newPaneId, placement))
      .filter(isLayoutNode)
  };
}

export function replacePaneInLayout(node: LayoutNode | null, targetPaneId: string, replacementPaneId: string): LayoutNode | null {
  if (!node) return node;
  if (node.type === "leaf") {
    return node.paneId === targetPaneId ? createLeafNode(replacementPaneId) : node;
  }

  return {
    ...node,
    children: node.children
      .map((child) => replacePaneInLayout(child, targetPaneId, replacementPaneId))
      .filter(isLayoutNode)
  };
}

export function removePaneFromLayout(node: LayoutNode | null, paneId: string): LayoutNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node.paneId === paneId ? null : node;

  const entries = node.children
    .map((child, index) => ({
      child: removePaneFromLayout(child, paneId),
      size: node.sizes?.[index] ?? 1
    }))
    .filter((entry): entry is { child: LayoutNode; size: number } => Boolean(entry.child));
  const children = entries.map((entry) => entry.child);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  return {
    ...node,
    children,
    sizes: entries.map((entry) => entry.size)
  };
}

function isLayoutNode(node: LayoutNode | null): node is LayoutNode {
  return Boolean(node);
}
