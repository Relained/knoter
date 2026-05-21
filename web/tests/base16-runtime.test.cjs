const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getActiveBase16Theme,
  importBase16Theme,
  validateBase16Theme
} = require("../.test-build/theming/runtime.js");

const validTheme = {
  scheme: "Unit Test Theme",
  mode: "light",
  base00: "151515",
  base01: "202020",
  base02: "303030",
  base03: "505050",
  base04: "b0b0b0",
  base05: "d0d0d0",
  base06: "e0e0e0",
  base07: "f5f5f5",
  base08: "ac4142",
  base09: "d28445",
  base0A: "f4bf75",
  base0B: "90a959",
  base0C: "75b5aa",
  base0D: "6a9fb5",
  base0E: "aa759f",
  base0F: "8f5536"
};

test("validates external Base16 JSON and normalizes colors", () => {
  const result = validateBase16Theme(JSON.stringify(validTheme));

  assert.equal(result.ok, true);
  assert.equal(result.scheme.id, "external-unit-test-theme");
  assert.equal(result.scheme.name, "Unit Test Theme");
  assert.equal(result.scheme.mode, "light");
  assert.equal(result.scheme.base00, "#151515");
  assert.equal(result.scheme.base0F, "#8f5536");
});

test("invalid external Base16 input does not mutate the active theme", () => {
  const before = getActiveBase16Theme();
  const result = importBase16Theme({ ...validTheme, base0F: "not-a-color" }, { persist: true });
  const after = getActiveBase16Theme();

  assert.equal(result.ok, false);
  assert.deepEqual(after, before);
  assert.equal(result.issues.some((issue) => issue.field === "base0F"), true);
});
