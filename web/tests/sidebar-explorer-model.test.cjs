const assert = require("node:assert/strict");
const test = require("node:test");

const {
  defaultSidebarExplorerFilters,
  getSelectedSidebarExplorerLayers,
  getSidebarExplorerSections,
  normalizeSidebarExplorerFilters,
  setSidebarExplorerFilter,
  sidebarExplorerLayerKeys
} = require("../.test-build/sidebar/explorerModel.js");

test("sidebar explorer filters default to template only", () => {
  assert.deepEqual(sidebarExplorerLayerKeys, ["source", "rewritten", "template"]);
  assert.deepEqual(defaultSidebarExplorerFilters, {
    source: false,
    rewritten: false,
    template: true
  });
  assert.deepEqual(getSelectedSidebarExplorerLayers(defaultSidebarExplorerFilters), ["template"]);
});

test("sidebar explorer filters normalize invalid stored values", () => {
  assert.deepEqual(
    normalizeSidebarExplorerFilters({
      source: true,
      rewritten: "yes"
    }),
    {
      source: true,
      rewritten: false,
      template: true
    }
  );
});

test("sidebar explorer sections show selected spaces in source rewritten template order", () => {
  const sections = getSidebarExplorerSections(
    {
      source: true,
      rewritten: true,
      template: true
    },
    "",
    () => ""
  );

  assert.deepEqual(sections.map((section) => section.layer), ["source", "rewritten", "template"]);
  assert.deepEqual(sections.map((section) => section.title), ["Source", "Rewritten", "Template"]);
  assert.equal(sections[0].entries.length, 0);
  assert.equal(sections[1].entries.length, 0);
  assert.equal(sections[2].entries.some((entry) => entry.key === "Dashboard"), true);
});

test("sidebar explorer template section is searchable by template note content", () => {
  const sections = getSidebarExplorerSections(defaultSidebarExplorerFilters, "embedded-token", (noteKey) =>
    noteKey === "Dashboard" ? "embedded-token" : ""
  );

  assert.deepEqual(sections.map((section) => section.layer), ["template"]);
  assert.deepEqual(sections[0].entries.map((entry) => entry.key), ["Dashboard"]);
});

test("setSidebarExplorerFilter toggles one space without mutating the original filters", () => {
  const nextFilters = setSidebarExplorerFilter(defaultSidebarExplorerFilters, "source", true);

  assert.deepEqual(defaultSidebarExplorerFilters, {
    source: false,
    rewritten: false,
    template: true
  });
  assert.deepEqual(nextFilters, {
    source: true,
    rewritten: false,
    template: true
  });
});
