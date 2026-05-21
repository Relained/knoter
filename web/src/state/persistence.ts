import {
  createDefaultObjectState,
  createDefaultObjectStates,
  createDefaultWorkspaceState,
  createLeafNode,
  createSplitNode,
  createPane,
  getPaneIdsFromLayout,
  createTab,
  getWorkspaceObjectTitle,
  menuPositions,
  splitDirections,
  toolbarPositions,
  isNoteKey,
  isWorkspaceObjectKey,
  workspaceObjects
} from "../domain/workspace";
import type {
  CalendarEventState,
  EdgePosition,
  FloatingWindowModel,
  LayoutNode,
  NoteKey,
  NoteObjectState,
  Pane,
  Tab,
  TaskLaneState,
  TodoItemState,
  WorkspaceObjectKey,
  WorkspaceObjectState,
  WorkspaceObjectStates,
  WorkspaceState
} from "../domain/types";
import { normalizeGraph3DObjectState } from "../graph3d/model";
import { normalizeSidebarExplorerFilters } from "../sidebar/explorerModel";
import { clampNumber, constrainFloatingWindow } from "../utils/geometry";

const workspaceStorageVersion = 1;

export function loadWorkspaceState(): WorkspaceState {
  try {
    const rawState = localStorage.getItem(getWorkspaceStorageKey());
    if (!rawState) return normalizeWorkspaceState({ version: workspaceStorageVersion, ...createDefaultWorkspaceState() });
    return normalizeWorkspaceState(JSON.parse(rawState));
  } catch (error) {
    console.warn("Failed to load workspace state. Falling back to defaults.", error);
    return normalizeWorkspaceState({ version: workspaceStorageVersion, ...createDefaultWorkspaceState() });
  }
}

export function saveWorkspaceState(snapshot: WorkspaceState) {
  try {
    localStorage.setItem(
      getWorkspaceStorageKey(),
      JSON.stringify({
        version: workspaceStorageVersion,
        ...snapshot
      })
    );
    return true;
  } catch (error) {
    console.warn("Failed to save workspace state.", error);
    return false;
  }
}

function getWorkspaceStorageKey() {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("workspace") || params.get("vault") || "default";
  return `knoter.workspace-state.v${workspaceStorageVersion}:${scope}`;
}

function normalizeWorkspaceState(savedState: any): WorkspaceState {
  if (!savedState || savedState.version !== workspaceStorageVersion) return createDefaultWorkspaceState();

  const panesById = normalizePanesById(savedState);
  const usedPaneIds = new Set<string>();
  const layoutTree = normalizeLayoutTree(savedState.layoutTree, panesById, usedPaneIds) ?? createFlatLayoutTree(Object.keys(panesById));
  const layoutPaneIds = new Set(getPaneIdsFromLayout(layoutTree));
  const normalizedPanesById = Object.fromEntries(Object.entries(panesById).filter(([paneId]) => layoutPaneIds.has(paneId))) as Record<string, Pane>;
  const floatingWindows: FloatingWindowModel[] = Array.isArray(savedState.floatingWindows)
    ? (savedState.floatingWindows as any[]).map((win: any) => normalizeFloatingWindow(win)).filter(isFloatingWindowModel)
    : [];
  const firstPaneId = getPaneIdsFromLayout(layoutTree)[0];
  const activePaneId = typeof savedState.activePaneId === "string" && normalizedPanesById[savedState.activePaneId]
    ? savedState.activePaneId
    : firstPaneId;
  const highestFloatingWindow = topFloatingWindow(floatingWindows);
  const activeFloatingWindowId = floatingWindows.some((win: FloatingWindowModel) => win.id === savedState.activeFloatingWindowId)
    ? savedState.activeFloatingWindowId
    : highestFloatingWindow?.id ?? null;
  const highestZIndex = floatingWindows.reduce((highest: number, win: FloatingWindowModel) => Math.max(highest, win.zIndex), 70);

  return {
    menuPosition: menuPositions.includes(savedState.menuPosition) ? savedState.menuPosition as EdgePosition : "top",
    sidebarExplorerFilters: normalizeSidebarExplorerFilters(savedState.sidebarExplorerFilters),
    panesById: normalizedPanesById,
    layoutTree,
    objectStates: normalizeObjectStates(savedState.objectStates),
    activePaneId,
    floatingWindows,
    activeFloatingWindowId,
    zIndexSeed: Math.max(Number(savedState.zIndexSeed) || 70, highestZIndex)
  };
}

function normalizeObjectStates(savedStates: any): WorkspaceObjectStates {
  const source = savedStates && typeof savedStates === "object" ? savedStates : {};

  return Object.keys(workspaceObjects).reduce<WorkspaceObjectStates>((states, objectKey) => {
    if (!isWorkspaceObjectKey(objectKey)) return states;
    const objectState = normalizeObjectState(objectKey, source[objectKey]);
    if (objectState) states[objectKey] = objectState;
    return states;
  }, createDefaultObjectStates());
}

function normalizeObjectState(objectKey: WorkspaceObjectKey, savedState: any): WorkspaceObjectState | null {
  const defaultState = createDefaultObjectState(objectKey);
  if (!defaultState) return null;
  if (!savedState || typeof savedState !== "object" || savedState.kind !== defaultState.kind) return defaultState;

  switch (defaultState.kind) {
    case "note":
      return {
        kind: "note",
        content:
          typeof savedState.content === "string" && savedState.content.trim()
            ? savedState.content
            : defaultState.content,
        mode: normalizeNoteMode(savedState.mode, defaultState.mode),
        ...(typeof savedState.title === "string" && savedState.title.trim() ? { title: savedState.title } : {}),
        ...(typeof savedState.path === "string" && savedState.path.trim() ? { path: savedState.path } : {})
      };
    case "graph3d":
      return normalizeGraph3DObjectState(savedState, defaultState, normalizeStringList);
    case "tasks":
      return {
        kind: "tasks",
        lanes: normalizeTaskLanes(savedState.lanes, defaultState.lanes)
      };
    case "todo":
      return {
        kind: "todo",
        items: normalizeTodoItems(savedState.items, defaultState.items)
      };
    case "calendar":
      return {
        kind: "calendar",
        events: normalizeCalendarEvents(savedState.events, defaultState.events)
      };
  }
}

function normalizeNoteMode(value: any, fallback: NoteObjectState["mode"]): NoteObjectState["mode"] {
  return value === "edit" || value === "preview" || value === "split" ? value : fallback;
}

function normalizeStringList(value: any, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function normalizeTaskLanes(value: any, fallback: TaskLaneState[]): TaskLaneState[] {
  if (!Array.isArray(value)) return fallback;
  const lanes = value
    .map((lane: any): TaskLaneState | null => {
      if (!lane || typeof lane !== "object") return null;
      const id = typeof lane.id === "string" && lane.id.trim() ? lane.id : crypto.randomUUID();
      const title = typeof lane.title === "string" && lane.title.trim() ? lane.title : "Lane";
      return {
        id,
        title,
        items: normalizeStringList(lane.items, [])
      };
    })
    .filter(isTaskLaneState);
  return lanes.length > 0 ? lanes : fallback;
}

function normalizeTodoItems(value: any, fallback: TodoItemState[]): TodoItemState[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item: any): TodoItemState | null => {
      if (!item || typeof item !== "object") return null;
      const text = typeof item.text === "string" && item.text.trim() ? item.text : null;
      if (!text) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID(),
        text,
        done: Boolean(item.done)
      };
    })
    .filter(isTodoItemState);
  return items.length > 0 ? items : fallback;
}

function normalizeCalendarEvents(value: any, fallback: CalendarEventState[]): CalendarEventState[] {
  if (!Array.isArray(value)) return fallback;
  const events = value
    .map((event: any): CalendarEventState | null => {
      if (!event || typeof event !== "object") return null;
      const title = typeof event.title === "string" && event.title.trim() ? event.title : null;
      const date = typeof event.date === "string" && event.date.trim() ? event.date : null;
      if (!title || !date) return null;
      return {
        id: typeof event.id === "string" && event.id.trim() ? event.id : crypto.randomUUID(),
        title,
        date
      };
    })
    .filter(isCalendarEventState);
  return events.length > 0 ? events : fallback;
}

function normalizePanesById(savedState: any): Record<string, Pane> {
  const sourcePanes = savedState.panesById && typeof savedState.panesById === "object"
    ? Object.values(savedState.panesById)
    : Array.isArray(savedState.panes)
      ? savedState.panes
      : [];
  const panes = sourcePanes.map(normalizePane).filter(isPane);
  if (panes.length === 0) {
    const pane = createPane("Dashboard");
    return { [pane.id]: pane };
  }

  return Object.fromEntries(panes.map((pane: Pane) => [pane.id, pane]));
}

function createFlatLayoutTree(paneIds: string[]): LayoutNode {
  const leaves = paneIds.map(createLeafNode);
  if (leaves.length === 0) {
    const pane = createPane("Dashboard");
    return createLeafNode(pane.id);
  }
  if (leaves.length === 1) return leaves[0];
  return createSplitNode("horizontal", leaves);
}

function normalizeLayoutTree(node: any, panesById: Record<string, Pane>, usedPaneIds: Set<string>): LayoutNode | null {
  if (!node || typeof node !== "object") return null;

  if (node.type === "leaf") {
    if (!panesById[node.paneId] || usedPaneIds.has(node.paneId)) return null;
    usedPaneIds.add(node.paneId);
    return { type: "leaf", paneId: node.paneId };
  }

  if (node.type !== "split" || !splitDirections.includes(node.direction) || !Array.isArray(node.children)) return null;

  const childrenSource = node.children as any[];
  const entries = childrenSource
    .map((child: any, index: number) => ({
      child: normalizeLayoutTree(child, panesById, usedPaneIds),
      size: Number(node.sizes?.[index]) || 1
    }))
    .filter((entry): entry is { child: LayoutNode; size: number } => Boolean(entry.child));
  const children = entries.map((entry) => entry.child);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  return {
    type: "split",
    direction: node.direction as LayoutNode extends { type: "split"; direction: infer D } ? D : never,
    children,
    sizes: entries.map((entry) => entry.size)
  };
}

function normalizePane(pane: any): Pane | null {
  if (!pane || typeof pane !== "object") return null;
  const tabs = Array.isArray(pane.tabs) ? (pane.tabs as any[]).map((tab: any) => normalizeTab(tab)).filter(isTab) : [];
  const activeTabId = tabs.some((tab: Tab) => tab.id === pane.activeTabId)
    ? pane.activeTabId
    : tabs[0]?.id ?? null;

  return {
    id: typeof pane.id === "string" ? pane.id : crypto.randomUUID(),
    toolbarPosition: toolbarPositions.includes(pane.toolbarPosition) ? pane.toolbarPosition as EdgePosition : "top",
    tabs,
    activeTabId
  };
}

function normalizeTab(tab: any): Tab | null {
  if (!tab || typeof tab !== "object") return null;
  const savedObjectKey = typeof tab.objectKey === "string" && isWorkspaceObjectKey(tab.objectKey) ? tab.objectKey : null;
  const savedViewKey = typeof tab.viewKey === "string" && isWorkspaceObjectKey(tab.viewKey) ? tab.viewKey : null;
  const savedNoteKey = typeof tab.noteKey === "string" && isNoteKey(tab.noteKey) ? tab.noteKey : null;
  const objectKey = savedObjectKey ?? savedViewKey ?? savedNoteKey;
  const noteKey = objectKey && isNoteKey(objectKey) ? objectKey : null;
  const title = typeof tab.title === "string" && tab.title.trim() ? tab.title : getWorkspaceObjectTitle(objectKey, "Untitled");

  return {
    id: typeof tab.id === "string" ? tab.id : crypto.randomUUID(),
    title,
    objectKey,
    noteKey
  };
}

function normalizeFloatingWindow(win: any): FloatingWindowModel | null {
  if (!win || typeof win !== "object") return null;
  const savedObjectKey = typeof win.objectKey === "string" && isWorkspaceObjectKey(win.objectKey) ? win.objectKey : null;
  const savedViewKey = typeof win.viewKey === "string" && isWorkspaceObjectKey(win.viewKey) ? win.viewKey : null;
  const savedNoteKey = typeof win.noteKey === "string" && isNoteKey(win.noteKey) ? win.noteKey : null;
  const objectKey: WorkspaceObjectKey = savedObjectKey ?? savedViewKey ?? savedNoteKey ?? "Dashboard";
  const noteKey: NoteKey | null = isNoteKey(objectKey) ? objectKey : null;

  return constrainFloatingWindow({
    id: typeof win.id === "string" ? win.id : crypto.randomUUID(),
    objectKey,
    noteKey,
    title: typeof win.title === "string" && win.title.trim() ? win.title : getWorkspaceObjectTitle(objectKey, "Floating View"),
    toolbarPosition: toolbarPositions.includes(win.toolbarPosition) ? win.toolbarPosition as EdgePosition : "top",
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
    zIndex: clampNumber(win.zIndex, 1, 100000, 60)
  });
}

function topFloatingWindow(windows: FloatingWindowModel[]): FloatingWindowModel | null {
  return windows.reduce<FloatingWindowModel | null>((top, item) => (!top || item.zIndex > top.zIndex ? item : top), null);
}

function isPane(pane: Pane | null): pane is Pane {
  return Boolean(pane);
}

function isTab(tab: Tab | null): tab is Tab {
  return Boolean(tab);
}

function isTaskLaneState(lane: TaskLaneState | null): lane is TaskLaneState {
  return Boolean(lane);
}

function isTodoItemState(item: TodoItemState | null): item is TodoItemState {
  return Boolean(item);
}

function isCalendarEventState(event: CalendarEventState | null): event is CalendarEventState {
  return Boolean(event);
}

function isFloatingWindowModel(win: FloatingWindowModel | null): win is FloatingWindowModel {
  return Boolean(win);
}
