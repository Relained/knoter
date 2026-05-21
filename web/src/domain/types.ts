export type EdgePosition = "top" | "right" | "bottom" | "left";
export type SplitDirection = "horizontal" | "vertical";

export type NoteKey = "Dashboard" | "Project Plan" | "Research Notes" | "Canvas Draft";
export type SystemObjectKey = "Settings" | "Graph 3D" | "Tasks" | "Todo" | "Calendar";
export type WorkspaceObjectKey = NoteKey | SystemObjectKey;
export type WorkspaceObjectKind = "note" | "settings" | "graph3d" | "tasks" | "todo" | "calendar";

export type Graph3DFilterKey = "source" | "rewritten" | "template";
export type Graph3DFilters = Record<Graph3DFilterKey, boolean>;
export type SidebarExplorerLayerKey = "source" | "rewritten" | "template";
export type SidebarExplorerFilters = Record<SidebarExplorerLayerKey, boolean>;

export type NoteObjectState = {
  kind: "note";
  content: string;
  mode: "edit" | "preview" | "split";
};

export type Graph3DObjectState = {
  kind: "graph3d";
  nodes: string[];
  links: string[];
  filters: Graph3DFilters;
};

export type TaskLaneState = {
  id: string;
  title: string;
  items: string[];
};

export type TasksObjectState = {
  kind: "tasks";
  lanes: TaskLaneState[];
};

export type TodoItemState = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoObjectState = {
  kind: "todo";
  items: TodoItemState[];
};

export type CalendarEventState = {
  id: string;
  title: string;
  date: string;
};

export type CalendarObjectState = {
  kind: "calendar";
  events: CalendarEventState[];
};

export type WorkspaceObjectState =
  | NoteObjectState
  | Graph3DObjectState
  | TasksObjectState
  | TodoObjectState
  | CalendarObjectState;

export type WorkspaceObjectStates = Partial<Record<WorkspaceObjectKey, WorkspaceObjectState>>;

export type Tab = {
  id: string;
  title: string;
  objectKey: WorkspaceObjectKey | null;
  noteKey: NoteKey | null;
};

export type Pane = {
  id: string;
  toolbarPosition: EdgePosition;
  tabs: Tab[];
  activeTabId: string | null;
};

export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; direction: SplitDirection; children: LayoutNode[]; sizes: number[] };

export type FloatingWindowModel = {
  id: string;
  objectKey: WorkspaceObjectKey;
  noteKey: NoteKey | null;
  title: string;
  toolbarPosition: EdgePosition;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type WorkspaceState = {
  menuPosition: EdgePosition;
  sidebarExplorerFilters: SidebarExplorerFilters;
  panesById: Record<string, Pane>;
  layoutTree: LayoutNode;
  objectStates: WorkspaceObjectStates;
  activePaneId: string | null;
  floatingWindows: FloatingWindowModel[];
  activeFloatingWindowId: string | null;
  zIndexSeed: number;
};

export type RectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type EdgePreviewModel = {
  rect: RectSnapshot;
  position: EdgePosition;
};

export type TabPlacementPreviewModel = EdgePreviewModel & (
  | {
      mode: "pane";
      sourceTabId: string;
      targetPaneId: string | null;
    }
  | {
      mode: "tab";
      sourceTabId: string;
      targetPaneId: string | null;
      targetTabId: string;
      tabPlacement: "before" | "after";
    }
);
