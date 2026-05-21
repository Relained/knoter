const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyGlobalSettingsText,
  defaultGlobalSettings,
  getGlobalSettingsText,
  globalSettingsStorageKey,
  normalizeGlobalSettingsRecord,
  normalizeGlobalSettings,
  saveGlobalSettings,
  serializeGlobalSettingsRecord,
  sidebarWidthBounds
} = require("../.test-build/settings/preferences.js");
const { parseJsonc } = require("../.test-build/settings/jsonc.js");

test("global settings normalization clamps sidebar width", () => {
  assert.deepEqual(
    normalizeGlobalSettings({ sidebarCollapsed: true, sidebarWidth: 999 }),
    makeSettings({ sidebarCollapsed: true, sidebarWidth: sidebarWidthBounds.max })
  );
  assert.deepEqual(
    normalizeGlobalSettings({ sidebarCollapsed: "yes", sidebarWidth: "wide" }),
    defaultGlobalSettings
  );
});

test("global settings normalization clamps font sizes and font families", () => {
  assert.deepEqual(
    normalizeGlobalSettings({
      uiFontFamily: "serif",
      uiFontSize: 99,
      editorFontFamily: "monospace",
      editorFontSize: 1,
      fontStacks: {
        "sans-serif": "Custom Sans, sans-serif",
        serif: "Custom Serif, serif",
        monospace: "Custom Mono, monospace"
      }
    }),
    makeSettings({
      uiFontFamily: "serif",
      uiFontSize: 20,
      editorFontFamily: "monospace",
      editorFontSize: 12,
      fontStacks: {
        "sans-serif": "Custom Sans, sans-serif",
        serif: "Custom Serif, serif",
        monospace: "Custom Mono, monospace"
      }
    })
  );

  assert.deepEqual(
    normalizeGlobalSettings({
      uiFontFamily: "display",
      editorFontFamily: "",
      uiFontSize: "large",
      editorFontSize: "small",
      fontStacks: {
        "sans-serif": "",
        serif: "x".repeat(241),
        monospace: null
      }
    }),
    defaultGlobalSettings
  );
});

test("global settings record keeps the previous state", () => {
  const record = normalizeGlobalSettingsRecord({
    version: 1,
    current: makeSettings({ sidebarCollapsed: true, sidebarWidth: 320 }),
    previous: makeSettings({ sidebarCollapsed: false, sidebarWidth: 248 }),
    updatedAt: "2026-05-09T00:00:00.000Z"
  });

  assert.deepEqual(record.current, makeSettings({ sidebarCollapsed: true, sidebarWidth: 320 }));
  assert.deepEqual(record.previous, makeSettings({ sidebarCollapsed: false, sidebarWidth: 248 }));
});

test("saving global settings writes the old current value as previous", () => {
  const storage = createMemoryStorage();
  global.localStorage = storage;

  assert.equal(saveGlobalSettings(makeSettings({ sidebarCollapsed: true, sidebarWidth: 300 })), true);
  assert.equal(saveGlobalSettings(makeSettings({ sidebarCollapsed: false, sidebarWidth: 220 })), true);

  const record = parseJsonc(storage.getItem(globalSettingsStorageKey));
  assert.deepEqual(record.current, makeSettings({ sidebarCollapsed: false, sidebarWidth: 220 }));
  assert.deepEqual(record.previous, makeSettings({ sidebarCollapsed: true, sidebarWidth: 300 }));

  delete global.localStorage;
});

test("saving global settings can replace a corrupt existing record", () => {
  const storage = createMemoryStorage();
  storage.setItem(globalSettingsStorageKey, "{");
  global.localStorage = storage;

  assert.equal(saveGlobalSettings(makeSettings({ sidebarCollapsed: true, sidebarWidth: 280 })), true);

  const record = parseJsonc(storage.getItem(globalSettingsStorageKey));
  assert.deepEqual(record.current, makeSettings({ sidebarCollapsed: true, sidebarWidth: 280 }));
  assert.equal(record.previous, null);

  delete global.localStorage;
});

test("global settings storage is saved as JSONC text", () => {
  const text = serializeGlobalSettingsRecord({
    version: 1,
    current: makeSettings({ sidebarCollapsed: true, sidebarWidth: 300 }),
    previous: null,
    updatedAt: "2026-05-09T00:00:00.000Z"
  });
  const parsed = normalizeGlobalSettingsRecord(parseJsonc(text));

  assert.match(text, /Knoter global config/);
  assert.deepEqual(parsed.current, makeSettings({ sidebarCollapsed: true, sidebarWidth: 300 }));
});

test("applying JSONC text stores previous current settings", () => {
  const storage = createMemoryStorage();
  global.localStorage = storage;

  assert.equal(saveGlobalSettings(makeSettings({ sidebarCollapsed: false, sidebarWidth: 248 })), true);
  const result = applyGlobalSettingsText(`{
    // User-edited config text.
    "version": 1,
    "current": {
      "sidebarCollapsed": true,
      "sidebarWidth": 320,
      "uiFontFamily": "serif",
      "uiFontSize": 16,
      "editorFontFamily": "monospace",
      "editorFontSize": 18,
      "fontStacks": {
        "sans-serif": "Inter, sans-serif",
        "serif": "Literata, serif",
        "monospace": "JetBrains Mono, monospace",
      },
    },
    "previous": null,
    "updatedAt": "",
  }`);

  const record = parseJsonc(getGlobalSettingsText());
  assert.equal(result.ok, true);
  assert.deepEqual(record.current, makeSettings({
    sidebarCollapsed: true,
    sidebarWidth: 320,
    uiFontFamily: "serif",
    uiFontSize: 16,
    editorFontFamily: "monospace",
    editorFontSize: 18,
    fontStacks: {
      "sans-serif": "Inter, sans-serif",
      serif: "Literata, serif",
      monospace: "JetBrains Mono, monospace"
    }
  }));
  assert.deepEqual(record.previous, makeSettings({ sidebarCollapsed: false, sidebarWidth: 248 }));

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

function makeSettings(patch) {
  return {
    ...defaultGlobalSettings,
    ...patch
  };
}
