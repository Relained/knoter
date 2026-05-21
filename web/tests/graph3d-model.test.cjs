const assert = require("node:assert/strict");
const test = require("node:test");

const {
  defaultGraph3DFilters,
  getSelectedGraph3DFilters,
  graph3dFilterKeys,
  normalizeGraph3DFilters,
  normalizeGraph3DObjectState,
  setGraph3DFilter
} = require("../.test-build/graph3d/model.js");

test("graph 3d filters default to template only", () => {
  assert.deepEqual(graph3dFilterKeys, ["source", "rewritten", "artifact", "template"]);
  assert.deepEqual(defaultGraph3DFilters, {
    source: false,
    rewritten: false,
    artifact: false,
    template: true
  });
  assert.deepEqual(getSelectedGraph3DFilters(defaultGraph3DFilters), ["template"]);
});

test("graph 3d filters normalize invalid values with fallback", () => {
  const normalized = normalizeGraph3DFilters(
    {
      source: true,
      rewritten: "yes",
      artifact: "no",
      template: null
    },
    {
      source: false,
      rewritten: true,
      artifact: false,
      template: false
    }
  );

  assert.deepEqual(normalized, {
    source: true,
    rewritten: true,
    artifact: false,
    template: false
  });
});

test("graph 3d object state normalization preserves valid labels and repairs filters", () => {
  const defaultState = {
    kind: "graph3d",
    nodes: ["Default node"],
    links: ["Default link"],
    filters: defaultGraph3DFilters
  };
  const normalized = normalizeGraph3DObjectState(
    {
      kind: "graph3d",
      nodes: ["Source note"],
      links: [],
      filters: {
        source: true,
        rewritten: false
      }
    },
    defaultState,
    normalizeStringList
  );

  assert.deepEqual(normalized.nodes, ["Source note"]);
  assert.deepEqual(normalized.links, ["Default link"]);
  assert.deepEqual(normalized.filters, {
    source: true,
    rewritten: false,
    artifact: false,
    template: true
  });
});

test("setGraph3DFilter toggles one filter without mutating the original state", () => {
  const state = {
    kind: "graph3d",
    nodes: ["Node"],
    links: ["Node -> Template"],
    filters: defaultGraph3DFilters
  };
  const nextState = setGraph3DFilter(state, "source", true);

  assert.notEqual(nextState, state);
  assert.deepEqual(state.filters, {
    source: false,
    rewritten: false,
    artifact: false,
    template: true
  });
  assert.deepEqual(nextState.filters, {
    source: true,
    rewritten: false,
    artifact: false,
    template: true
  });
  assert.deepEqual(getSelectedGraph3DFilters(nextState.filters), ["source", "template"]);
});

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item) => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}
