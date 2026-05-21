const assert = require("node:assert/strict");
const test = require("node:test");

const { createDefaultWorkspaceState } = require("../.test-build/domain/workspace.js");
const { loadWorkspaceState, saveWorkspaceState } = require("../.test-build/state/persistence.js");

test("workspace persistence round-trips object states", () => {
  installBrowserStorage("?workspace=object-state-round-trip");
  const initialState = createDefaultWorkspaceState();
  const savedState = {
    ...initialState,
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
      }
    }
  };

  assert.equal(saveWorkspaceState(savedState), true);

  const loadedState = loadWorkspaceState();

  assert.deepEqual(loadedState.objectStates.Todo.items, [
    { id: "persisted", text: "Persist object state", done: true }
  ]);
  assert.equal(loadedState.objectStates.Dashboard.mode, "preview");
  assert.equal(loadedState.objectStates.Dashboard.content.includes("[[object:Todo]]"), true);
  assert.equal(loadedState.objectStates.Tasks.kind, "tasks");
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
