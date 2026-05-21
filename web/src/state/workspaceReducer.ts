import type {
  EdgePosition,
  FloatingWindowModel,
  Pane,
  SplitDirection,
  SidebarExplorerLayerKey,
  WorkspaceObjectKey,
  WorkspaceObjectState,
  WorkspaceState
} from "../domain/types";
import {
  createDefaultObjectState,
  createFloating,
  createPane,
  createTab,
  getPaneIdsFromLayout,
  hasPaneInLayout,
  isWorkspaceObjectKey,
  menuPositions,
  removePaneFromLayout,
  replacePaneInLayout,
  splitLayoutNode,
  toolbarPositions
} from "../domain/workspace";
import { normalizeGraph3DObjectState } from "../graph3d/model";
import { setSidebarExplorerFilter } from "../sidebar/explorerModel";
import { constrainFloatingWindow } from "../utils/geometry";

export type WorkspaceAction =
  | { type: "setMenuPosition"; position: EdgePosition }
  | { type: "setSidebarExplorerFilter"; layer: SidebarExplorerLayerKey; checked: boolean }
  | { type: "cycleMenuPosition" }
  | { type: "ensureActivePane" }
  | { type: "activatePane"; paneId: string }
  | { type: "newTab"; paneId: string }
  | { type: "openNote"; paneId: string; noteKey: string }
  | { type: "openObjectInPane"; paneId: string; objectKey: string }
  | { type: "movePaneToolbar"; paneId: string }
  | { type: "setPaneToolbarPosition"; paneId: string; position: EdgePosition }
  | { type: "selectTab"; paneId: string; tabId: string }
  | { type: "closeTab"; paneId: string; tabId: string }
  | { type: "closePane"; paneId: string }
  | { type: "splitActivePane"; targetPaneId: string; direction: SplitDirection }
  | {
      type: "moveTabToPane";
      sourcePaneId: string;
      tabId: string;
      targetPaneId: string;
      targetTabId: string;
      placement: "before" | "after";
    }
  | { type: "splitTabToPane"; sourcePaneId: string; tabId: string; edge: EdgePosition; targetPaneId: string | null }
  | { type: "openFloatingWindow"; objectKey: string }
  | { type: "floatPane"; paneId: string }
  | { type: "dockFloatingWindow"; windowId: string }
  | { type: "closeFloatingWindow"; windowId: string }
  | { type: "closeTopFloatingWindow" }
  | { type: "updateFloatingWindow"; windowId: string; patch: Partial<FloatingWindowModel> }
  | { type: "constrainFloatingWindows" }
  | { type: "focusFloatingWindow"; windowId: string }
  | { type: "moveFloatingToolbar"; windowId: string }
  | { type: "setFloatingToolbarPosition"; windowId: string; position: EdgePosition }
  | { type: "setObjectState"; objectKey: WorkspaceObjectKey; state: WorkspaceObjectState };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "setMenuPosition":
      return menuPositions.includes(action.position) ? { ...state, menuPosition: action.position } : state;
    case "setSidebarExplorerFilter":
      return {
        ...state,
        sidebarExplorerFilters: setSidebarExplorerFilter(state.sidebarExplorerFilters, action.layer, action.checked)
      };
    case "cycleMenuPosition":
      return { ...state, menuPosition: nextPosition(menuPositions, state.menuPosition) };
    case "ensureActivePane":
      return ensureActivePane(state);
    case "activatePane":
      return state.panesById[action.paneId] ? { ...state, activePaneId: action.paneId } : state;
    case "newTab":
      return updatePane(state, action.paneId, (pane) => {
        const tab = createTab("Untitled");
        return { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id };
      });
    case "openNote":
      return openObjectInPane(state, action.paneId, action.noteKey);
    case "openObjectInPane":
      return openObjectInPane(state, action.paneId, action.objectKey);
    case "movePaneToolbar":
      return updatePane(state, action.paneId, (pane) => ({
        ...pane,
        toolbarPosition: nextPosition(toolbarPositions, pane.toolbarPosition)
      }));
    case "setPaneToolbarPosition":
      if (!toolbarPositions.includes(action.position)) return state;
      return updatePane(state, action.paneId, (pane) => ({ ...pane, toolbarPosition: action.position }));
    case "selectTab":
      return selectTab(state, action.paneId, action.tabId);
    case "closeTab":
      return closeTab(state, action.paneId, action.tabId);
    case "closePane":
      return closePane(state, action.paneId);
    case "splitActivePane":
      return splitActivePane(state, action.targetPaneId, action.direction);
    case "moveTabToPane":
      return moveTabToPane(state, action.sourcePaneId, action.tabId, action.targetPaneId, action.targetTabId, action.placement);
    case "splitTabToPane":
      return splitTabToPane(state, action.sourcePaneId, action.tabId, action.edge, action.targetPaneId);
    case "openFloatingWindow":
      return openFloatingWindow(state, action.objectKey);
    case "floatPane":
      return floatPane(state, action.paneId);
    case "dockFloatingWindow":
      return dockFloatingWindow(state, action.windowId);
    case "closeFloatingWindow":
      return closeFloatingWindow(state, action.windowId);
    case "closeTopFloatingWindow":
      return closeTopFloatingWindow(state);
    case "updateFloatingWindow":
      return {
        ...state,
        floatingWindows: state.floatingWindows.map((win) =>
          win.id === action.windowId ? constrainFloatingWindow({ ...win, ...action.patch }) : win
        )
      };
    case "constrainFloatingWindows":
      return {
        ...state,
        floatingWindows: state.floatingWindows.map((win) => constrainFloatingWindow(win))
      };
    case "focusFloatingWindow":
      return focusFloatingWindow(state, action.windowId);
    case "moveFloatingToolbar":
      return {
        ...state,
        floatingWindows: state.floatingWindows.map((win) =>
          win.id === action.windowId
            ? { ...win, toolbarPosition: nextPosition(toolbarPositions, win.toolbarPosition) }
            : win
        )
      };
    case "setFloatingToolbarPosition":
      if (!toolbarPositions.includes(action.position)) return state;
      return {
        ...state,
        floatingWindows: state.floatingWindows.map((win) =>
          win.id === action.windowId ? { ...win, toolbarPosition: action.position } : win
        )
      };
    case "setObjectState":
      return setObjectState(state, action.objectKey, action.state);
    default:
      return action satisfies never;
  }
}

function updatePane(state: WorkspaceState, paneId: string, updater: (pane: Pane) => Pane): WorkspaceState {
  const pane = state.panesById[paneId];
  if (!pane) return state;
  return { ...state, panesById: { ...state.panesById, [paneId]: updater(pane) } };
}

function ensureActivePane(state: WorkspaceState): WorkspaceState {
  if (state.activePaneId && state.panesById[state.activePaneId]) return state;
  const firstPaneId = getPaneIdsFromLayout(state.layoutTree).find((paneId) => state.panesById[paneId]);
  return firstPaneId ? { ...state, activePaneId: firstPaneId } : state;
}

function selectTab(state: WorkspaceState, paneId: string, tabId: string): WorkspaceState {
  const pane = state.panesById[paneId];
  if (!pane || !pane.tabs.some((tab) => tab.id === tabId)) return state;

  return {
    ...state,
    activePaneId: paneId,
    panesById: {
      ...state.panesById,
      [paneId]: { ...pane, activeTabId: tabId }
    }
  };
}

function closeTab(state: WorkspaceState, paneId: string, tabId: string): WorkspaceState {
  const pane = state.panesById[paneId];
  if (!pane) return state;

  const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
  if (tabs.length === 0 && getPaneIdsFromLayout(state.layoutTree).length > 1) {
    return closePane(state, paneId);
  }

  const activeTabId = pane.activeTabId === tabId ? tabs[0]?.id ?? null : pane.activeTabId;
  return {
    ...state,
    panesById: {
      ...state.panesById,
      [paneId]: { ...pane, tabs, activeTabId }
    }
  };
}

function closePane(state: WorkspaceState, paneId: string): WorkspaceState {
  const paneIds = getPaneIdsFromLayout(state.layoutTree);
  if (paneIds.length <= 1 || !paneIds.includes(paneId)) return state;

  const nextLayoutTree = removePaneFromLayout(state.layoutTree, paneId);
  if (!nextLayoutTree) return state;

  const nextPanesById = { ...state.panesById };
  delete nextPanesById[paneId];
  const remainingPaneIds = getPaneIdsFromLayout(nextLayoutTree);
  const activePaneId = state.activePaneId === paneId ? remainingPaneIds[0] ?? null : state.activePaneId;

  return {
    ...state,
    panesById: nextPanesById,
    layoutTree: nextLayoutTree,
    activePaneId
  };
}

function splitActivePane(state: WorkspaceState, targetPaneId: string, direction: SplitDirection): WorkspaceState {
  if (!hasPaneInLayout(state.layoutTree, targetPaneId)) return state;

  const nextPane = createPane(direction === "horizontal" ? "Research Notes" : "Project Plan");
  const nextLayoutTree = splitLayoutNode(state.layoutTree, targetPaneId, direction, nextPane.id);
  if (!nextLayoutTree) return state;

  return {
    ...state,
    panesById: { ...state.panesById, [nextPane.id]: nextPane },
    layoutTree: nextLayoutTree,
    activePaneId: nextPane.id
  };
}

function moveTabToPane(
  state: WorkspaceState,
  sourcePaneId: string,
  tabId: string,
  targetPaneId: string,
  targetTabId: string,
  placement: "before" | "after"
): WorkspaceState {
  const sourcePane = state.panesById[sourcePaneId];
  const targetPane = state.panesById[targetPaneId];
  const tab = sourcePane?.tabs.find((item) => item.id === tabId);
  if (!sourcePane || !targetPane || !tab) return state;
  if (!hasPaneInLayout(state.layoutTree, sourcePaneId) || !hasPaneInLayout(state.layoutTree, targetPaneId)) return state;
  if (!targetPane.tabs.some((item) => item.id === targetTabId)) return state;
  if (sourcePaneId === targetPaneId && tabId === targetTabId) return state;

  const nextPanesById = { ...state.panesById };
  const sourceTabs = sourcePane.tabs.filter((item) => item.id !== tabId);
  const targetBaseTabs = sourcePaneId === targetPaneId ? sourceTabs : targetPane.tabs;
  const targetIndex = targetBaseTabs.findIndex((item) => item.id === targetTabId);
  if (targetIndex < 0) return state;

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  const targetTabs = [
    ...targetBaseTabs.slice(0, insertIndex),
    tab,
    ...targetBaseTabs.slice(insertIndex)
  ];

  nextPanesById[targetPaneId] = {
    ...targetPane,
    tabs: targetTabs,
    activeTabId: tab.id
  };

  let nextLayoutTree = state.layoutTree;
  let activePaneId = targetPaneId;
  if (sourcePaneId !== targetPaneId) {
    if (sourceTabs.length === 0 && getPaneIdsFromLayout(state.layoutTree).length > 1) {
      delete nextPanesById[sourcePaneId];
      nextLayoutTree = removePaneFromLayout(state.layoutTree, sourcePaneId) ?? state.layoutTree;
    } else {
      nextPanesById[sourcePaneId] = {
        ...sourcePane,
        tabs: sourceTabs,
        activeTabId: sourcePane.activeTabId === tab.id ? sourceTabs[0]?.id ?? null : sourcePane.activeTabId
      };
    }
  }

  return {
    ...state,
    panesById: nextPanesById,
    layoutTree: nextLayoutTree,
    activePaneId
  };
}

function splitTabToPane(
  state: WorkspaceState,
  sourcePaneId: string,
  tabId: string,
  edge: EdgePosition,
  targetPaneId: string | null
): WorkspaceState {
  const sourcePane = state.panesById[sourcePaneId];
  const tab = sourcePane?.tabs.find((item) => item.id === tabId);
  if (!sourcePane || !tab) return state;
  if (!hasPaneInLayout(state.layoutTree, sourcePaneId)) return state;

  const resolvedTargetPaneId = targetPaneId && hasPaneInLayout(state.layoutTree, targetPaneId) ? targetPaneId : sourcePaneId;
  const direction = edge === "left" || edge === "right" ? "horizontal" : "vertical";
  const placement = edge === "left" || edge === "top" ? "before" : "after";
  const nextPane = createPaneFromTab(sourcePane, tab);
  const sourceTabs = sourcePane.tabs.filter((item) => item.id !== tabId);
  const nextPanesById = { ...state.panesById, [nextPane.id]: nextPane };

  if (sourceTabs.length === 0) {
    delete nextPanesById[sourcePaneId];
  } else {
    nextPanesById[sourcePaneId] = {
      ...sourcePane,
      tabs: sourceTabs,
      activeTabId: sourcePane.activeTabId === tabId ? sourceTabs[0]?.id ?? null : sourcePane.activeTabId
    };
  }

  if (sourcePane.tabs.length === 1 && resolvedTargetPaneId === sourcePaneId) {
    return {
      ...state,
      panesById: nextPanesById,
      layoutTree: replacePaneInLayout(state.layoutTree, sourcePaneId, nextPane.id) ?? state.layoutTree,
      activePaneId: nextPane.id
    };
  }

  const layoutWithoutEmptySource =
    sourcePane.tabs.length === 1 ? removePaneFromLayout(state.layoutTree, sourcePaneId) : state.layoutTree;
  const nextLayoutTree =
    splitLayoutNode(layoutWithoutEmptySource, resolvedTargetPaneId, direction, nextPane.id, placement) ?? state.layoutTree;

  return {
    ...state,
    panesById: nextPanesById,
    layoutTree: nextLayoutTree,
    activePaneId: nextPane.id
  };
}

function openObjectInPane(state: WorkspaceState, paneId: string, objectKey: string): WorkspaceState {
  if (!isWorkspaceObjectKey(objectKey)) return state;
  const withObjectState = ensureObjectState(state, objectKey);

  return updatePane(withObjectState, paneId, (pane) => {
    const existing = pane.tabs.find((tab) => tab.objectKey === objectKey);
    if (existing) return { ...pane, activeTabId: existing.id };
    const tab = createTab(objectKey);
    return { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id };
  });
}

function openFloatingWindow(state: WorkspaceState, objectKey: string): WorkspaceState {
  return addFloatingWindow(state, objectKey);
}

function floatPane(state: WorkspaceState, paneId: string): WorkspaceState {
  const pane = state.panesById[paneId];
  if (!pane || !hasPaneInLayout(state.layoutTree, paneId)) return state;

  const tab = pane.tabs.find((item) => item.id === pane.activeTabId) ?? pane.tabs[0];
  if (!tab) return state;

  const withFloatingWindow = addFloatingWindow(state, tab.objectKey ?? tab.noteKey ?? tab.title);
  const remainingTabs = pane.tabs.filter((item) => item.id !== tab.id);
  if (remainingTabs.length > 0) {
    return {
      ...withFloatingWindow,
      panesById: {
        ...withFloatingWindow.panesById,
        [paneId]: {
          ...pane,
          tabs: remainingTabs,
          activeTabId: pane.activeTabId === tab.id ? remainingTabs[0]?.id ?? null : pane.activeTabId
        }
      }
    };
  }

  const paneIds = getPaneIdsFromLayout(state.layoutTree);
  if (paneIds.length <= 1) {
    return {
      ...withFloatingWindow,
      panesById: {
        ...withFloatingWindow.panesById,
        [paneId]: {
          ...pane,
          tabs: [],
          activeTabId: null
        }
      },
      activePaneId: paneId
    };
  }

  return closePane(withFloatingWindow, paneId);
}

function addFloatingWindow(state: WorkspaceState, objectKey: string): WorkspaceState {
  const nextZIndex = Math.max(state.zIndexSeed + 1, ...state.floatingWindows.map((win) => win.zIndex + 1));
  const nextWindow = constrainFloatingWindow({
    ...createFloating(objectKey, state.floatingWindows.length),
    zIndex: nextZIndex
  });
  const withObjectState = ensureObjectState(state, nextWindow.objectKey);

  return {
    ...withObjectState,
    floatingWindows: [...withObjectState.floatingWindows, nextWindow],
    activeFloatingWindowId: nextWindow.id,
    zIndexSeed: nextZIndex
  };
}

function ensureObjectState(state: WorkspaceState, objectKey: WorkspaceObjectKey): WorkspaceState {
  if (state.objectStates[objectKey]) return state;
  const objectState = createDefaultObjectState(objectKey);
  if (!objectState) return state;
  return {
    ...state,
    objectStates: {
      ...state.objectStates,
      [objectKey]: objectState
    }
  };
}

function setObjectState(
  state: WorkspaceState,
  objectKey: WorkspaceObjectKey,
  objectState: WorkspaceObjectState
): WorkspaceState {
  if (!isWorkspaceObjectKey(objectKey)) return state;
  const defaultState = createDefaultObjectState(objectKey);
  if (!defaultState || defaultState.kind !== objectState.kind) return state;
  const nextObjectState =
    objectState.kind === "graph3d" && defaultState.kind === "graph3d"
      ? normalizeGraph3DObjectState(objectState, defaultState, normalizeStringList)
      : objectState;

  return {
    ...state,
    objectStates: {
      ...state.objectStates,
      [objectKey]: nextObjectState
    }
  };
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function createPaneFromTab(sourcePane: Pane, tab: Pane["tabs"][number]): Pane {
  return {
    ...createPane(tab.title),
    toolbarPosition: sourcePane.toolbarPosition,
    tabs: [tab],
    activeTabId: tab.id
  };
}

function dockFloatingWindow(state: WorkspaceState, windowId: string): WorkspaceState {
  const win = state.floatingWindows.find((item) => item.id === windowId);
  if (!win) return state;

  const pane = createPane(win.objectKey);
  const paneIds = getPaneIdsFromLayout(state.layoutTree);
  const targetPaneId = state.activePaneId && paneIds.includes(state.activePaneId) ? state.activePaneId : paneIds[0];
  if (!targetPaneId) return state;

  const nextLayoutTree = splitLayoutNode(state.layoutTree, targetPaneId, "horizontal", pane.id);
  if (!nextLayoutTree) return state;
  const afterClose = closeFloatingWindow(state, windowId);

  return {
    ...afterClose,
    panesById: { ...afterClose.panesById, [pane.id]: pane },
    layoutTree: nextLayoutTree,
    activePaneId: pane.id
  };
}

function closeFloatingWindow(state: WorkspaceState, windowId: string): WorkspaceState {
  const floatingWindows = state.floatingWindows.filter((item) => item.id !== windowId);
  const nextActiveWindow = topFloatingWindow(floatingWindows);

  return {
    ...state,
    floatingWindows,
    activeFloatingWindowId:
      state.activeFloatingWindowId === windowId ? nextActiveWindow?.id ?? null : state.activeFloatingWindowId
  };
}

function closeTopFloatingWindow(state: WorkspaceState): WorkspaceState {
  const topWindow = topFloatingWindow(state.floatingWindows);
  return topWindow ? closeFloatingWindow(state, topWindow.id) : state;
}

function focusFloatingWindow(state: WorkspaceState, windowId: string): WorkspaceState {
  if (!state.floatingWindows.some((win) => win.id === windowId)) return state;

  const nextZIndex = state.zIndexSeed + 1;
  return {
    ...state,
    zIndexSeed: nextZIndex,
    activeFloatingWindowId: windowId,
    floatingWindows: state.floatingWindows.map((win) =>
      win.id === windowId ? { ...win, zIndex: nextZIndex } : win
    )
  };
}

function nextPosition<T extends string>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

function topFloatingWindow(windows: FloatingWindowModel[]): FloatingWindowModel | null {
  return windows.reduce<FloatingWindowModel | null>((top, item) => (!top || item.zIndex > top.zIndex ? item : top), null);
}
