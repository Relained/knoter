const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkspaceCommands } = require("../.test-build/commands/workspaceCommands.js");

test("workspace commands include Open Settings", () => {
  let openedSettings = false;
  const openedObjects = [];
  const commands = createWorkspaceCommands({
    openPalette() {},
    newTab() {},
    splitSmart() {},
    closePane() {},
    newFloating() {},
    openSettings() {
      openedSettings = true;
    },
    openObject(objectKey) {
      openedObjects.push(objectKey);
    },
    closeTopFloatingWindow() {},
    floatActivePane() {},
    moveActivePaneToolbar() {},
    cycleMenu() {},
    cycleTheme() {},
    openNote() {}
  });
  const command = commands.find((item) => item.id === "open-settings");

  assert.equal(command.label, "설정 열기");
  command.run();
  assert.equal(openedSettings, true);

  commands.find((item) => item.id === "open-graph-3d").run();
  commands.find((item) => item.id === "open-tasks").run();
  commands.find((item) => item.id === "open-todo").run();
  commands.find((item) => item.id === "open-calendar").run();
  assert.deepEqual(openedObjects, ["Graph 3D", "Tasks", "Todo", "Calendar"]);
});

test("workspace commands include note markdown content as search keywords", () => {
  const commands = createWorkspaceCommands(
    {
      openPalette() {},
      newTab() {},
      splitSmart() {},
      closePane() {},
      newFloating() {},
      openSettings() {},
      openObject() {},
      closeTopFloatingWindow() {},
      floatActivePane() {},
      moveActivePaneToolbar() {},
      cycleMenu() {},
      cycleTheme() {},
      openNote() {}
    },
    {
      Dashboard: {
        kind: "note",
        content: "# Dashboard\n\nunique-search-token",
        mode: "split"
      }
    }
  );
  const command = commands.find((item) => item.id === "open-note-dashboard");

  assert.equal(command.keywords.some((keyword) => keyword.includes("unique-search-token")), true);
});
