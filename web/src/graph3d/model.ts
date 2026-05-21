import type { Graph3DFilterKey, Graph3DFilters, Graph3DObjectState } from "../domain/types";

export const graph3dFilterKeys = ["source", "rewritten", "artifact", "template"] as const satisfies readonly Graph3DFilterKey[];

export const defaultGraph3DFilters: Graph3DFilters = {
  source: false,
  rewritten: false,
  artifact: false,
  template: true
};

export const graph3dFilterLabels: Record<Graph3DFilterKey, string> = {
  source: "Source",
  rewritten: "Rewritten",
  artifact: "Artifact",
  template: "Template"
};

export function normalizeGraph3DFilters(value: unknown, fallback: Graph3DFilters = defaultGraph3DFilters): Graph3DFilters {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<Graph3DFilterKey, unknown>>
    : {};

  return {
    source: typeof source.source === "boolean" ? source.source : fallback.source,
    rewritten: typeof source.rewritten === "boolean" ? source.rewritten : fallback.rewritten,
    artifact: typeof source.artifact === "boolean" ? source.artifact : fallback.artifact,
    template: typeof source.template === "boolean" ? source.template : fallback.template
  };
}

export function normalizeGraph3DObjectState(
  savedState: unknown,
  defaultState: Graph3DObjectState,
  normalizeStringList: (value: unknown, fallback: string[]) => string[]
): Graph3DObjectState {
  const source = savedState && typeof savedState === "object"
    ? savedState as Partial<Graph3DObjectState>
    : {};

  return {
    kind: "graph3d",
    nodes: normalizeStringList(source.nodes, defaultState.nodes),
    links: normalizeStringList(source.links, defaultState.links),
    filters: normalizeGraph3DFilters(source.filters, defaultState.filters)
  };
}

export function setGraph3DFilter(
  state: Graph3DObjectState,
  filterKey: Graph3DFilterKey,
  checked: boolean
): Graph3DObjectState {
  return {
    ...state,
    filters: {
      ...normalizeGraph3DFilters(state.filters),
      [filterKey]: checked
    }
  };
}

export function getSelectedGraph3DFilters(filters: Graph3DFilters): Graph3DFilterKey[] {
  const normalizedFilters = normalizeGraph3DFilters(filters);
  return graph3dFilterKeys.filter((filterKey) => normalizedFilters[filterKey]);
}
