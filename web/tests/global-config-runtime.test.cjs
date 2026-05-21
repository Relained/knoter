const assert = require("node:assert/strict");
const test = require("node:test");

const {
  defaultGlobalSettings,
  getGlobalSettingsText,
  globalSettingsStorageKey,
  serializeGlobalSettingsRecord
} = require("../.test-build/settings/preferences.js");
const { parseJsonc } = require("../.test-build/settings/jsonc.js");
const { installGlobalConfigRuntime } = require("../.test-build/settings/runtime.js");

test("global config runtime syncs JSONC through the file bridge", async () => {
  const storage = createMemoryStorage();
  global.localStorage = storage;
  const fileText = serializeGlobalSettingsRecord({
    version: 1,
    current: { ...defaultGlobalSettings, sidebarCollapsed: true, sidebarWidth: 300 },
    previous: null,
    updatedAt: "2026-05-09T00:00:00.000Z"
  });
  let writtenText = "";
  global.window = createWindow({
    readText(fileName) {
      assert.equal(fileName, "knoter.config.jsonc");
      return fileText;
    },
    writeText(fileName, text) {
      assert.equal(fileName, "knoter.config.jsonc");
      writtenText = text;
    }
  });

  const runtime = installGlobalConfigRuntime();
  const readResult = await runtime.syncFromFile();
  assert.equal(readResult.ok, true);
  assert.equal(parseJsonc(storage.getItem(globalSettingsStorageKey)).current.sidebarCollapsed, true);

  const writeResult = await runtime.syncToFile();
  assert.equal(writeResult.ok, true);
  assert.deepEqual(parseJsonc(writtenText), parseJsonc(getGlobalSettingsText()));

  delete global.window;
  delete global.localStorage;
});

test("global config runtime applies subscribed file changes", () => {
  const storage = createMemoryStorage();
  global.localStorage = storage;
  let fileListener = null;
  global.window = createWindow({
    subscribe(fileName, listener) {
      assert.equal(fileName, "knoter.config.jsonc");
      fileListener = listener;
      return () => {
        fileListener = null;
      };
    }
  });

  installGlobalConfigRuntime();
  fileListener(serializeGlobalSettingsRecord({
    version: 1,
    current: { ...defaultGlobalSettings, sidebarWidth: 360 },
    previous: null,
    updatedAt: "2026-05-09T00:00:00.000Z"
  }));

  assert.equal(parseJsonc(storage.getItem(globalSettingsStorageKey)).current.sidebarWidth, 360);

  delete global.window;
  delete global.localStorage;
});

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    }
  };
}

function createWindow(fileBridge) {
  const listeners = new Map();

  return {
    knoterConfigFile: fileBridge,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
      return true;
    }
  };
}
