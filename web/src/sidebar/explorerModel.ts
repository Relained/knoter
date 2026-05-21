import type { NoteKey, SidebarExplorerFilters } from "../domain/types";
import { isNoteKey, notes } from "../domain/workspace";

export const sidebarExplorerLayerKeys = ["source", "rewritten", "template"] as const;

export const defaultSidebarExplorerFilters: SidebarExplorerFilters = {
  source: false,
  rewritten: false,
  template: true
};

export const sidebarExplorerLayerLabels: Record<keyof SidebarExplorerFilters, string> = {
  source: "Source",
  rewritten: "Rewritten",
  template: "Template"
};

export type SidebarExplorerEntry = {
  key: NoteKey;
  title: string;
  searchText: string;
};

export type SidebarExplorerSection = {
  layer: keyof SidebarExplorerFilters;
  title: string;
  entries: SidebarExplorerEntry[];
};

export function normalizeSidebarExplorerFilters(
  value: unknown,
  fallback: SidebarExplorerFilters = defaultSidebarExplorerFilters
): SidebarExplorerFilters {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<keyof SidebarExplorerFilters, unknown>>
    : {};

  return {
    source: typeof source.source === "boolean" ? source.source : fallback.source,
    rewritten: typeof source.rewritten === "boolean" ? source.rewritten : fallback.rewritten,
    template: typeof source.template === "boolean" ? source.template : fallback.template
  };
}

export function setSidebarExplorerFilter(
  filters: SidebarExplorerFilters,
  layer: keyof SidebarExplorerFilters,
  checked: boolean
): SidebarExplorerFilters {
  return {
    ...normalizeSidebarExplorerFilters(filters),
    [layer]: checked
  };
}

export function getSelectedSidebarExplorerLayers(filters: SidebarExplorerFilters): Array<keyof SidebarExplorerFilters> {
  const normalized = normalizeSidebarExplorerFilters(filters);
  return sidebarExplorerLayerKeys.filter((layer) => normalized[layer]);
}

export function getSidebarExplorerSections(
  filters: SidebarExplorerFilters,
  query: string,
  getNoteContent: (noteKey: NoteKey) => string = () => ""
): SidebarExplorerSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  return getSelectedSidebarExplorerLayers(filters).map((layer) => ({
    layer,
    title: sidebarExplorerLayerLabels[layer],
    entries: layer === "template"
      ? getTemplateEntries(normalizedQuery, getNoteContent)
      : []
  }));
}

function getTemplateEntries(query: string, getNoteContent: (noteKey: NoteKey) => string): SidebarExplorerEntry[] {
  return Object.keys(notes)
    .filter(isNoteKey)
    .map((noteKey) => ({
      key: noteKey,
      title: noteKey,
      searchText: getTemplateSearchText(noteKey, getNoteContent(noteKey))
    }))
    .filter((entry) => !query || entry.searchText.toLowerCase().includes(query));
}

function getTemplateSearchText(noteKey: NoteKey, content: string) {
  const note = notes[noteKey];
  return `${note.title} ${note.summary} ${note.cards.flat().join(" ")} ${content}`;
}
