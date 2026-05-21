import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { NoteKey, Pane, SidebarExplorerLayerKey, SidebarExplorerFilters, WorkspaceObjectKey, WorkspaceObjectStates } from "../domain/types";
import type { ExplorerItem } from "../api/types";
import { workspaceObjects } from "../domain/workspace";
import type { WorkspaceCommandActions } from "../commands/workspaceCommands";
import { sidebarWidthBounds } from "../settings/preferences";
import type { SidebarSurfaceKey } from "../sidebar/types";
import type { SidebarExplorerEntry } from "../sidebar/explorerModel";
import { sidebarSurfaceKeys, sidebarSurfaceLabels } from "../sidebar/types";
import { ExplorerSurface, PlaceholderSurface } from "./SidebarSurfaces";

type SidebarProps = {
  activePane?: Pane;
  openNote: (noteKey: NoteKey) => void;
  openExplorerItem: (entry: SidebarExplorerEntry) => void;
  explorerFilters: SidebarExplorerFilters;
  explorerItems?: ExplorerItem[];
  explorerLoading?: boolean;
  objectStates: WorkspaceObjectStates;
  onResize: (width: number) => void;
  onChangeExplorerFilter: (layer: SidebarExplorerLayerKey, checked: boolean) => void;
  actions: Pick<WorkspaceCommandActions, "newTab" | "openPalette" | "newFloating" | "splitSmart" | "openObject">;
};

type ResizeState = {
  pointerId: number;
  left: number;
};

const sidebarViewKeys = ["Tasks", "Todo", "Calendar", "Graph 3D"] as const satisfies readonly WorkspaceObjectKey[];

export function Sidebar({
  activePane,
  openNote,
  openExplorerItem,
  explorerFilters,
  explorerItems,
  explorerLoading,
  objectStates,
  onResize,
  onChangeExplorerFilter,
  actions
}: SidebarProps) {
  const [activeSurface, setActiveSurface] = useState<SidebarSurfaceKey>("explorer");
  const [explorerQuery, setExplorerQuery] = useState("");
  const [viewQuery, setViewQuery] = useState("");
  const resizeRef = useRef<ResizeState | null>(null);
  const normalizedViewQuery = viewQuery.trim().toLowerCase();
  const viewKeys = useMemo(
    () =>
      sidebarViewKeys.filter((objectKey) =>
        matchesSidebarQuery(normalizedViewQuery, `${workspaceObjects[objectKey].title} ${workspaceObjects[objectKey].kind}`)
      ),
    [normalizedViewQuery]
  );

  function startResize(event: PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.closest<HTMLElement>(".workspace-sidebar")?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    resizeRef.current = {
      pointerId: event.pointerId,
      left: rect.left
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    onResize(clampSidebarWidth(event.clientX - resize.left));
  }

  function stopResize(event: PointerEvent<HTMLSpanElement>) {
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
  }

  return (
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <nav className="sidebar-rail" aria-label="Sidebar surfaces">
        {sidebarSurfaceKeys.map((surface) => (
          <button
            key={surface}
            className={`sidebar-rail-button ${activeSurface === surface ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveSurface(surface)}
            aria-label={sidebarSurfaceLabels[surface]}
            title={sidebarSurfaceLabels[surface]}
          >
            {sidebarSurfaceLabels[surface].slice(0, 1)}
          </button>
        ))}
      </nav>
      <div className="sidebar-content" data-sidebar-surface={activeSurface}>
        {activeSurface === "explorer" && (
          <ExplorerSurface
            activePane={activePane}
            filters={explorerFilters}
            query={explorerQuery}
            explorerItems={explorerItems}
            loading={explorerLoading}
            objectStates={objectStates}
            onQueryChange={setExplorerQuery}
            onChangeFilter={onChangeExplorerFilter}
            onOpenNote={openNote}
            onOpenExplorerItem={openExplorerItem}
            onNewNote={actions.newTab}
          />
        )}
        {activeSurface === "search" && (
          <section className="sidebar-section">
            <header>
              <span>Search</span>
            </header>
            <input
              className="sidebar-inline-input"
              type="search"
              value={viewQuery}
              onChange={(event) => setViewQuery(event.currentTarget.value)}
              placeholder="Search workspace"
              aria-label="Search workspace"
            />
            <button className="nav-item" type="button" onClick={actions.openPalette}>
              Command Palette
            </button>
            {viewKeys.map((objectKey) => (
              <button className="nav-item" type="button" onClick={() => actions.openObject(objectKey)} key={objectKey}>
                {workspaceObjects[objectKey].title}
              </button>
            ))}
          </section>
        )}
        {activeSurface === "graph" && (
          <PlaceholderSurface title="Graph" description="Graph controls are wired to the API contract before renderer work resumes." />
        )}
        {activeSurface === "tasks" && (
          <section className="sidebar-section">
            <header>
              <span>Tasks</span>
            </header>
            <button className="nav-item" type="button" onClick={() => actions.openObject("Tasks")}>
              Tasks
            </button>
            <button className="nav-item" type="button" onClick={() => actions.openObject("Todo")}>
              Todo
            </button>
            <button className="nav-item" type="button" onClick={() => actions.openObject("Calendar")}>
              Calendar
            </button>
          </section>
        )}
        {activeSurface === "settings" && (
          <section className="sidebar-section">
            <header>
              <span>Workspace</span>
            </header>
            <button className="nav-item" type="button" onClick={() => actions.newFloating("Dashboard")}>
              Floating Window
            </button>
            <button className="nav-item" type="button" onClick={actions.splitSmart}>
              Split Pane
            </button>
          </section>
        )}
      </div>
      <span
        className="sidebar-resize-handle"
        aria-hidden="true"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />
    </aside>
  );
}

function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, sidebarWidthBounds.min), sidebarWidthBounds.max);
}

function matchesSidebarQuery(query: string, searchText: string) {
  return !query || searchText.toLowerCase().includes(query);
}
