const assert = require("node:assert/strict");
const test = require("node:test");

const { defaultKeybindings } = require("../.test-build/keybindings/defaultKeybindings.js");
const {
  commandForKeybinding,
  createCommandLookup,
  findMatchingKeybinding,
  matchesKeybinding
} = require("../.test-build/keybindings/resolve.js");

function keyboardEvent(patch) {
  return {
    key: "k",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...patch
  };
}

test("primary keybinding matches ctrl+k and meta+k", () => {
  const binding = defaultKeybindings[0];

  assert.equal(matchesKeybinding(keyboardEvent({ ctrlKey: true }), binding), true);
  assert.equal(matchesKeybinding(keyboardEvent({ key: "K", metaKey: true }), binding), true);
});

test("primary keybinding rejects unrelated modifiers and keys", () => {
  const binding = defaultKeybindings[0];

  assert.equal(matchesKeybinding(keyboardEvent({ ctrlKey: true, shiftKey: true }), binding), false);
  assert.equal(matchesKeybinding(keyboardEvent({ ctrlKey: true, key: "n" }), binding), false);
});

test("editable targets are blocked unless the binding opts in", () => {
  const inputTarget = { tagName: "input" };
  const blockedBinding = {
    id: "blocked",
    commandId: "new-tab",
    key: "n",
    modifiers: ["primary"]
  };
  const allowedBinding = {
    ...blockedBinding,
    allowInEditable: true
  };

  assert.equal(matchesKeybinding(keyboardEvent({ key: "n", ctrlKey: true, target: inputTarget }), blockedBinding), false);
  assert.equal(matchesKeybinding(keyboardEvent({ key: "n", ctrlKey: true, target: inputTarget }), allowedBinding), true);
});

test("keybinding lookup resolves a command by command id", () => {
  const command = { id: "open-palette", label: "Open", hint: "Workbench", icon: "command.search", run: () => undefined };
  const event = keyboardEvent({ ctrlKey: true });

  assert.equal(findMatchingKeybinding(event, defaultKeybindings)?.commandId, "open-palette");
  assert.equal(createCommandLookup([command]).get("open-palette"), command);
  assert.equal(commandForKeybinding(event, defaultKeybindings, [command]), command);
});
