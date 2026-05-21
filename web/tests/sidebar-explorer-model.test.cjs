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
  assert.deepEqual(sidebarExplorerLayerKeys, ["source", "rewritten", "artifact", "template"]);
  assert.deepEqual(defaultSidebarExplorerFilters, {
    source: false,
    rewritten: false,
    artifact: false,
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
      artifact: false,
      template: true
    }
  );
});

test("sidebar explorer sections show selected spaces in source rewritten artifact template order", () => {
  const sections = getSidebarExplorerSections(
    {
      source: true,
      rewritten: true,
      artifact: true,
      template: true
    },
    "",
    () => ""
  );

  assert.deepEqual(sections.map((section) => section.layer), ["source", "rewritten", "artifact", "template"]);
  assert.deepEqual(sections.map((section) => section.title), ["Source", "Rewritten", "Artifact", "Template"]);
  assert.equal(sections[0].entries.length, 0);
  assert.equal(sections[1].entries.length, 0);
  assert.equal(sections[2].entries.length, 0);
  assert.equal(sections[3].entries.some((entry) => entry.key === "Dashboard"), true);
});

test("sidebar explorer template section is searchable by template note content", () => {
  const sections = getSidebarExplorerSections(defaultSidebarExplorerFilters, "embedded-token", (noteKey) =>
    noteKey === "Dashboard" ? "embedded-token" : ""
  );

  assert.deepEqual(sections.map((section) => section.layer), ["template"]);
  assert.deepEqual(sections[0].entries.map((entry) => entry.key), ["Dashboard"]);
});

test("sidebar explorer sections use API explorer items when present", () => {
  const sections = getSidebarExplorerSections(
    {
      source: true,
      rewritten: true,
      artifact: true,
      template: false
    },
    "meeting",
    () => "",
    [
      {
        id: "source:sources/2026-05-22/meeting.md",
        layer: "source",
        title: "meeting",
        path: "sources/2026-05-22/meeting.md",
        kind: null,
        docDate: "2026-05-22",
        updatedAt: null,
        graphNodeId: "source:sources/2026-05-22/meeting.md"
      },
      {
        id: "rewritten:rewritten/2026-05-22/daily.md",
        layer: "rewritten",
        title: "daily",
        path: "rewritten/2026-05-22/daily.md",
        kind: null,
        docDate: "2026-05-22",
        updatedAt: null,
        graphNodeId: "rewritten:rewritten/2026-05-22/daily.md"
      },
      {
        id: "artifact:artifacts/2026-05-22/daily.md",
        layer: "artifact",
        title: "daily",
        path: "artifacts/2026-05-22/daily.md",
        kind: null,
        docDate: "2026-05-22",
        updatedAt: null,
        graphNodeId: "artifact:artifacts/2026-05-22/daily.md"
      }
    ]
  );

  assert.deepEqual(sections.map((section) => section.layer), ["source", "rewritten", "artifact"]);
  assert.deepEqual(sections[0].entries.map((entry) => entry.title), ["meeting"]);
  assert.deepEqual(sections[1].entries, []);
  assert.deepEqual(sections[2].entries, []);
});

test("setSidebarExplorerFilter toggles one space without mutating the original filters", () => {
  const nextFilters = setSidebarExplorerFilter(defaultSidebarExplorerFilters, "source", true);

  assert.deepEqual(defaultSidebarExplorerFilters, {
    source: false,
    rewritten: false,
    artifact: false,
    template: true
  });
  assert.deepEqual(nextFilters, {
    source: true,
    rewritten: false,
    artifact: false,
    template: true
  });
});
