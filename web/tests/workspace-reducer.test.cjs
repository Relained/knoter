const assert = require("node:assert/strict");
const test = require("node:test");

const { getPaneIdsFromLayout } = require("../.test-build/domain/workspace.js");
const { createDefaultWorkspaceState, workspaceObjects } = require("../.test-build/domain/workspace.js");
const { workspaceReducer } = require("../.test-build/state/workspaceReducer.js");

test("splitting a dragged tab preserves menu position", () => {
  const initialState = createDefaultWorkspaceState();
  const sourcePaneId = initialState.activePaneId;
  assert.equal(typeof sourcePaneId, "string");

  const withMenuMoved = workspaceReducer(initialState, { type: "setMenuPosition", position: "left" });
  const withExtraTab = workspaceReducer(withMenuMoved, { type: "newTab", paneId: sourcePaneId });
  const sourcePane = withExtraTab.panesById[sourcePaneId];
  const movedTab = sourcePane.tabs[1];

  const nextState = workspaceReducer(withExtraTab, {
    type: "splitTabToPane",
    sourcePaneId,
    tabId: movedTab.id,
    edge: "right",
    targetPaneId: sourcePaneId
  });

  assert.equal(nextState.menuPosition, "left");
  assert.equal(getPaneIdsFromLayout(nextState.layoutTree).length, 2);
  assert.equal(nextState.panesById[sourcePaneId].tabs.length, 1);
  assert.equal(nextState.panesById[nextState.activePaneId].tabs[0].id, movedTab.id);
});

test("a pane created from a dragged tab inherits the source pane toolbar position", () => {
  const initialState = createDefaultWorkspaceState();
  const sourcePaneId = initialState.activePaneId;
  const withMovedToolbar = workspaceReducer(initialState, {
    type: "setPaneToolbarPosition",
    paneId: sourcePaneId,
    position: "left"
  });
  const withExtraTab = workspaceReducer(withMovedToolbar, { type: "newTab", paneId: sourcePaneId });
  const sourcePane = withExtraTab.panesById[sourcePaneId];
  const movedTab = sourcePane.tabs[1];

  const nextState = workspaceReducer(withExtraTab, {
    type: "splitTabToPane",
    sourcePaneId,
    tabId: movedTab.id,
    edge: "right",
    targetPaneId: sourcePaneId
  });

  assert.equal(nextState.panesById[nextState.activePaneId].toolbarPosition, "left");
  assert.equal(nextState.panesById[sourcePaneId].toolbarPosition, "left");
});

test("splitting a dragged tab ignores stale target panes outside the layout", () => {
  const initialState = createDefaultWorkspaceState();
  const sourcePaneId = initialState.activePaneId;
  const withExtraTab = workspaceReducer(initialState, { type: "newTab", paneId: sourcePaneId });
  const sourcePane = withExtraTab.panesById[sourcePaneId];
  const movedTab = sourcePane.tabs[1];
  const staleTargetPane = {
    ...sourcePane,
    id: "stale-pane",
    tabs: sourcePane.tabs.slice(0, 1),
    activeTabId: sourcePane.tabs[0].id
  };

  const nextState = workspaceReducer(
    {
      ...withExtraTab,
      panesById: {
        ...withExtraTab.panesById,
        [staleTargetPane.id]: staleTargetPane
      }
    },
    {
      type: "splitTabToPane",
      sourcePaneId,
      tabId: movedTab.id,
      edge: "right",
      targetPaneId: staleTargetPane.id
    }
  );

  assert.equal(getPaneIdsFromLayout(nextState.layoutTree).includes(staleTargetPane.id), false);
  assert.equal(getPaneIdsFromLayout(nextState.layoutTree).length, 2);
  assert.equal(nextState.panesById[sourcePaneId].tabs.length, 1);
  assert.equal(nextState.panesById[staleTargetPane.id], staleTargetPane);
});

test("moving a dragged tab beside another tab adds it as a tab instead of a pane", () => {
  const initialState = createDefaultWorkspaceState();
  const firstPaneId = initialState.activePaneId;
  const splitState = workspaceReducer(initialState, {
    type: "splitActivePane",
    targetPaneId: firstPaneId,
    direction: "horizontal"
  });
  const secondPaneId = splitState.activePaneId;
  const withExtraTab = workspaceReducer(splitState, { type: "newTab", paneId: firstPaneId });
  const movedTab = withExtraTab.panesById[firstPaneId].tabs[1];
  const targetTab = withExtraTab.panesById[secondPaneId].tabs[0];

  const nextState = workspaceReducer(withExtraTab, {
    type: "moveTabToPane",
    sourcePaneId: firstPaneId,
    tabId: movedTab.id,
    targetPaneId: secondPaneId,
    targetTabId: targetTab.id,
    placement: "after"
  });

  assert.equal(getPaneIdsFromLayout(nextState.layoutTree).length, 2);
  assert.equal(nextState.panesById[firstPaneId].tabs.some((tab) => tab.id === movedTab.id), false);
  assert.deepEqual(nextState.panesById[secondPaneId].tabs.map((tab) => tab.id), [targetTab.id, movedTab.id]);
  assert.equal(nextState.activePaneId, secondPaneId);
});

test("moving the only tab out of a pane removes the empty source pane", () => {
  const initialState = createDefaultWorkspaceState();
  const firstPaneId = initialState.activePaneId;
  const splitState = workspaceReducer(initialState, {
    type: "splitActivePane",
    targetPaneId: firstPaneId,
    direction: "horizontal"
  });
  const secondPaneId = splitState.activePaneId;
  const movedTab = splitState.panesById[secondPaneId].tabs[0];
  const targetTab = splitState.panesById[firstPaneId].tabs[0];

  const nextState = workspaceReducer(splitState, {
    type: "moveTabToPane",
    sourcePaneId: secondPaneId,
    tabId: movedTab.id,
    targetPaneId: firstPaneId,
    targetTabId: targetTab.id,
    placement: "before"
  });

  assert.deepEqual(getPaneIdsFromLayout(nextState.layoutTree), [firstPaneId]);
  assert.equal(nextState.panesById[secondPaneId], undefined);
  assert.deepEqual(nextState.panesById[firstPaneId].tabs.map((tab) => tab.id), [movedTab.id, targetTab.id]);
});

test("closing the active pane activates a remaining pane", () => {
  const initialState = createDefaultWorkspaceState();
  const firstPaneId = initialState.activePaneId;
  const splitState = workspaceReducer(initialState, {
    type: "splitActivePane",
    targetPaneId: firstPaneId,
    direction: "horizontal"
  });
  const secondPaneId = splitState.activePaneId;

  const nextState = workspaceReducer(splitState, { type: "closePane", paneId: secondPaneId });

  assert.equal(nextState.activePaneId, firstPaneId);
  assert.deepEqual(getPaneIdsFromLayout(nextState.layoutTree), [firstPaneId]);
  assert.equal(nextState.panesById[secondPaneId], undefined);
});

test("floating a pane tab removes that tab from the source pane", () => {
  const initialState = createDefaultWorkspaceState();
  const sourcePaneId = initialState.activePaneId;
  const withExtraTab = workspaceReducer(initialState, { type: "newTab", paneId: sourcePaneId });
  const sourcePane = withExtraTab.panesById[sourcePaneId];
  const floatedTabId = sourcePane.activeTabId;

  const nextState = workspaceReducer(withExtraTab, { type: "floatPane", paneId: sourcePaneId });

  assert.equal(nextState.panesById[sourcePaneId].tabs.some((tab) => tab.id === floatedTabId), false);
  assert.equal(nextState.panesById[sourcePaneId].tabs.length, 1);
  assert.equal(nextState.floatingWindows.length, withExtraTab.floatingWindows.length + 1);
  assert.equal(nextState.activeFloatingWindowId, nextState.floatingWindows.at(-1).id);
});

test("floating the only tab in a non-final pane removes the source pane", () => {
  const initialState = createDefaultWorkspaceState();
  const firstPaneId = initialState.activePaneId;
  const splitState = workspaceReducer(initialState, {
    type: "splitActivePane",
    targetPaneId: firstPaneId,
    direction: "horizontal"
  });
  const floatedPaneId = splitState.activePaneId;

  const nextState = workspaceReducer(splitState, { type: "floatPane", paneId: floatedPaneId });

  assert.equal(nextState.panesById[floatedPaneId], undefined);
  assert.deepEqual(getPaneIdsFromLayout(nextState.layoutTree), [firstPaneId]);
  assert.equal(nextState.activePaneId, firstPaneId);
  assert.equal(nextState.floatingWindows.length, splitState.floatingWindows.length + 1);
});

test("opening settings creates a floating workspace object", () => {
  const initialState = createDefaultWorkspaceState();

  const nextState = workspaceReducer(initialState, { type: "openFloatingWindow", objectKey: "Settings" });
  const settingsWindow = nextState.floatingWindows.at(-1);

  assert.equal(settingsWindow.objectKey, "Settings");
  assert.equal(workspaceObjects[settingsWindow.objectKey].kind, "settings");
  assert.equal(settingsWindow.noteKey, null);
  assert.equal(settingsWindow.title, "Settings");
  assert.equal(nextState.activeFloatingWindowId, settingsWindow.id);
});

test("opening template objects creates floating workspace objects", () => {
  const initialState = createDefaultWorkspaceState();

  for (const objectKey of ["Graph 3D", "Tasks", "Todo", "Calendar"]) {
    const nextState = workspaceReducer(initialState, { type: "openFloatingWindow", objectKey });
    const win = nextState.floatingWindows.at(-1);

    assert.equal(win.objectKey, objectKey);
    assert.equal(workspaceObjects[win.objectKey].title, objectKey);
    assert.equal(win.noteKey, null);
  }
});

test("default workspace state includes template object states", () => {
  const initialState = createDefaultWorkspaceState();

  assert.equal(initialState.objectStates.Dashboard.kind, "note");
  assert.equal(initialState.objectStates.Dashboard.content.includes("# Dashboard"), true);
  assert.equal(initialState.objectStates["Graph 3D"].kind, "graph3d");
  assert.equal(initialState.objectStates.Tasks.kind, "tasks");
  assert.equal(initialState.objectStates.Todo.kind, "todo");
  assert.equal(initialState.objectStates.Calendar.kind, "calendar");
  assert.equal(initialState.objectStates.Settings, undefined);
});

test("opening a template object restores its missing object state", () => {
  const initialState = createDefaultWorkspaceState();
  const withoutTasksState = {
    ...initialState,
    objectStates: {
      ...initialState.objectStates,
      Tasks: undefined
    }
  };

  const nextState = workspaceReducer(withoutTasksState, { type: "openFloatingWindow", objectKey: "Tasks" });

  assert.equal(nextState.objectStates.Tasks.kind, "tasks");
  assert.equal(nextState.objectStates.Tasks.lanes.length > 0, true);
});

test("object state updates are stored by object key", () => {
  const initialState = createDefaultWorkspaceState();
  const nextState = workspaceReducer(initialState, {
    type: "setObjectState",
    objectKey: "Todo",
    state: {
      kind: "todo",
      items: [{ id: "ship", text: "Ship object state", done: false }]
    }
  });

  assert.deepEqual(nextState.objectStates.Todo.items, [{ id: "ship", text: "Ship object state", done: false }]);
});

test("object state updates reject mismatched object kinds", () => {
  const initialState = createDefaultWorkspaceState();
  const nextState = workspaceReducer(initialState, {
    type: "setObjectState",
    objectKey: "Tasks",
    state: {
      kind: "todo",
      items: [{ id: "wrong", text: "Wrong object", done: false }]
    }
  });

  assert.equal(nextState, initialState);
});

test("opening an object in a pane adds it as a tab and keeps shared object state", () => {
  const initialState = createDefaultWorkspaceState();
  const paneId = initialState.activePaneId;
  const nextState = workspaceReducer(initialState, {
    type: "openObjectInPane",
    paneId,
    objectKey: "Todo"
  });
  const pane = nextState.panesById[paneId];
  const todoTab = pane.tabs.find((tab) => tab.objectKey === "Todo");

  assert.equal(Boolean(todoTab), true);
  assert.equal(pane.activeTabId, todoTab.id);
  assert.equal(nextState.objectStates.Todo, initialState.objectStates.Todo);
  assert.equal(nextState.floatingWindows.length, initialState.floatingWindows.length);
});

test("opening an object in a pane restores missing object state", () => {
  const initialState = createDefaultWorkspaceState();
  const paneId = initialState.activePaneId;
  const nextState = workspaceReducer(
    {
      ...initialState,
      objectStates: {
        ...initialState.objectStates,
        Tasks: undefined
      }
    },
    {
      type: "openObjectInPane",
      paneId,
      objectKey: "Tasks"
    }
  );

  assert.equal(nextState.objectStates.Tasks.kind, "tasks");
  assert.equal(nextState.panesById[paneId].tabs.some((tab) => tab.objectKey === "Tasks"), true);
});

test("floating window updates are constrained to the viewport", () => {
  global.window = {
    innerWidth: 900,
    innerHeight: 600
  };
  const initialState = createDefaultWorkspaceState();
  const windowId = initialState.floatingWindows[0].id;

  const nextState = workspaceReducer(initialState, {
    type: "updateFloatingWindow",
    windowId,
    patch: {
      x: 880,
      y: 590,
      width: 360,
      height: 240
    }
  });
  const win = nextState.floatingWindows[0];

  assert.equal(win.x + win.width, 900);
  assert.equal(win.y + win.height, 600);

  delete global.window;
});
