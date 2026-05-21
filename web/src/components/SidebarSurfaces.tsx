import type { NoteKey, Pane, SidebarExplorerFilters, SidebarExplorerLayerKey, WorkspaceObjectStates } from "../domain/types";
import { Icon } from "../icons/Icon";
import { IconButton } from "./IconButton";
import {
  getSidebarExplorerSections,
  normalizeSidebarExplorerFilters,
  sidebarExplorerLayerKeys,
  sidebarExplorerLayerLabels,
  setSidebarExplorerFilter
} from "../sidebar/explorerModel";

export type ExplorerSurfaceProps = {
  activePane?: Pane;
  filters: SidebarExplorerFilters;
  query: string;
  objectStates: WorkspaceObjectStates;
  onQueryChange: (query: string) => void;
  onChangeFilter: (layer: SidebarExplorerLayerKey, checked: boolean) => void;
  onOpenNote: (noteKey: NoteKey) => void;
  onNewNote: () => void;
};

export function ExplorerSurface({
  activePane,
  filters,
  query,
  objectStates,
  onQueryChange,
  onChangeFilter,
  onOpenNote,
  onNewNote
}: ExplorerSurfaceProps) {
  const activeTab = activePane?.tabs.find((tab) => tab.id === activePane.activeTabId);
  const normalizedFilters = normalizeSidebarExplorerFilters(filters);
  const explorerSections = getSidebarExplorerSections(
    normalizedFilters,
    query,
    (noteKey) => {
      const objectState = objectStates[noteKey];
      return objectState?.kind === "note" ? objectState.content : "";
    }
  );

  return (
    <>
      <section className="sidebar-search-section" aria-label="Explorer search">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search files"
          aria-label="Search files"
        />
      </section>

      <section className="sidebar-space-section" aria-label="Explorer spaces">
        {sidebarExplorerLayerKeys.map((layer) => (
          <label className="sidebar-space-option" key={layer}>
            <input
              type="checkbox"
              checked={normalizedFilters[layer]}
              onChange={(event) => {
                onChangeFilter(
                  layer,
                  setSidebarExplorerFilter(normalizedFilters, layer, event.currentTarget.checked)[layer]
                );
              }}
            />
            <span>{sidebarExplorerLayerLabels[layer]}</span>
          </label>
        ))}
      </section>

      <section className="sidebar-section">
        <header>
          <span>Files</span>
          <IconButton label="New note" onClick={onNewNote}>
            <Icon name="document.new" size={15} />
          </IconButton>
        </header>
        {explorerSections.map((section) => (
          <div className="sidebar-explorer-section" key={section.layer}>
            <div className="sidebar-explorer-heading">{section.title}</div>
            {section.entries.length > 0 ? (
              section.entries.map((entry) => (
                <button
                  key={entry.key}
                  className={`nav-item ${activeTab?.noteKey === entry.key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => onOpenNote(entry.key)}
                >
                  {entry.title}
                </button>
              ))
            ) : (
              <div className="sidebar-empty-row">No items</div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

export type PlaceholderSurfaceProps = {
  title: string;
  description: string;
};

export function PlaceholderSurface({ title, description }: PlaceholderSurfaceProps) {
  return (
    <section className="sidebar-section sidebar-placeholder-surface">
      <header>
        <span>{title}</span>
      </header>
      <p>{description}</p>
    </section>
  );
}
