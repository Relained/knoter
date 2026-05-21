const assert = require("node:assert/strict");
const test = require("node:test");

const { createDefaultWorkspaceState } = require("../.test-build/domain/workspace.js");
const { loadWorkspaceState, saveWorkspaceState } = require("../.test-build/state/persistence.js");

test("workspace persistence round-trips object states", () => {
  installBrowserStorage("?workspace=object-state-round-trip");
  const initialState = createDefaultWorkspaceState();
  const savedState = {
    ...initialState,
    sidebarExplorerFilters: {
      source: true,
      rewritten: true,
      artifact: false,
      template: false
    },
    objectStates: {
      ...initialState.objectStates,
      Dashboard: {
        kind: "note",
        content: "# Dashboard\n\n[[object:Todo]]",
        mode: "preview"
      },
      Todo: {
        kind: "todo",
        items: [{ id: "persisted", text: "Persist object state", done: true }]
      },
      "Graph 3D": {
        kind: "graph3d",
        nodes: ["Persisted"],
        links: ["Persisted -> Template"],
        filters: {
          source: true,
          rewritten: false,
          template: false
        }
      }
    }
  };

  assert.equal(saveWorkspaceState(savedState), true);

  const loadedState = loadWorkspaceState();

  assert.deepEqual(loadedState.sidebarExplorerFilters, {
    source: true,
    rewritten: true,
    artifact: false,
    template: false
  });
  assert.deepEqual(loadedState.objectStates.Todo.items, [
    { id: "persisted", text: "Persist object state", done: true }
  ]);
  assert.equal(loadedState.objectStates.Dashboard.mode, "preview");
  assert.equal(loadedState.objectStates.Dashboard.content.includes("[[object:Todo]]"), true);
  assert.deepEqual(loadedState.objectStates["Graph 3D"].filters, {
    source: true,
    rewritten: false,
    artifact: false,
    template: false
  });
  assert.equal(loadedState.objectStates.Tasks.kind, "tasks");
});

test("workspace persistence defaults missing sidebar explorer filters to template only", () => {
  installBrowserStorage("?workspace=sidebar-explorer-filter-normalization");
  const initialState = createDefaultWorkspaceState();
  const { sidebarExplorerFilters, ...legacyState } = initialState;

  assert.equal(saveWorkspaceState(legacyState), true);

  const loadedState = loadWorkspaceState();

  assert.deepEqual(loadedState.sidebarExplorerFilters, {
    source: false,
    rewritten: false,
    artifact: false,
    template: true
  });
  assert.equal(sidebarExplorerFilters.template, true);
});

test("workspace persistence defaults missing graph 3d filters to template only", () => {
  installBrowserStorage("?workspace=graph-filter-normalization");
  const initialState = createDefaultWorkspaceState();
  const savedState = {
    ...initialState,
    objectStates: {
      ...initialState.objectStates,
      "Graph 3D": {
        kind: "graph3d",
        nodes: ["Legacy"],
        links: ["Legacy -> Graph"]
      }
    }
  };

  assert.equal(saveWorkspaceState(savedState), true);

  const loadedState = loadWorkspaceState();

  assert.deepEqual(loadedState.objectStates["Graph 3D"].filters, {
    source: false,
    rewritten: false,
    artifact: false,
    template: true
  });
});

function installBrowserStorage(search) {
  const values = new Map();
  global.window = {
    location: { search }
  };
  global.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}
