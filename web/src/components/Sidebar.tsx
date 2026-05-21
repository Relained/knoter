import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { NoteKey, Pane, WorkspaceObjectKey, WorkspaceObjectStates } from "../domain/types";
import { isNoteKey, notes, workspaceObjects } from "../domain/workspace";
import { Icon } from "../icons/Icon";
import { IconButton } from "./IconButton";
import type { WorkspaceCommandActions } from "../commands/workspaceCommands";
import { sidebarWidthBounds } from "../settings/preferences";

type SidebarProps = {
  activePane?: Pane;
  openNote: (noteKey: NoteKey) => void;
  objectStates: WorkspaceObjectStates;
  onResize: (width: number) => void;
  actions: Pick<WorkspaceCommandActions, "newTab" | "openPalette" | "newFloating" | "splitSmart" | "openObject">;
};

type ResizeState = {
  pointerId: number;
  left: number;
};

const sidebarViewKeys = ["Tasks", "Todo", "Calendar", "Graph 3D"] as const satisfies readonly WorkspaceObjectKey[];

export function Sidebar({ activePane, openNote, objectStates, onResize, actions }: SidebarProps) {
  const [query, setQuery] = useState("");
  const activeTab = activePane?.tabs.find((tab) => tab.id === activePane.activeTabId);
  const resizeRef = useRef<ResizeState | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const noteKeys = useMemo(
    () =>
      Object.keys(notes)
        .filter(isNoteKey)
        .filter((noteKey) => matchesSidebarQuery(normalizedQuery, getNoteSearchText(noteKey, objectStates))),
    [normalizedQuery, objectStates]
  );
  const viewKeys = useMemo(
    () =>
      sidebarViewKeys.filter((objectKey) =>
        matchesSidebarQuery(normalizedQuery, `${workspaceObjects[objectKey].title} ${workspaceObjects[objectKey].kind}`)
      ),
    [normalizedQuery]
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
      <div className="sidebar-content">
        <section className="sidebar-search-section" aria-label="Sidebar search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search workspace"
            aria-label="Search workspace"
          />
        </section>

        <section className="sidebar-section">
          <header>
            <span>Vault</span>
            <IconButton label="New note" onClick={actions.newTab}>
              <Icon name="document.new" size={15} />
            </IconButton>
          </header>
          {noteKeys.map((noteKey) => (
            <button
              key={noteKey}
              className={`nav-item ${activeTab?.noteKey === noteKey ? "is-active" : ""}`}
              type="button"
              onClick={() => openNote(noteKey)}
            >
              {noteKey}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          <header>
            <span>Views</span>
          </header>
          <button className="nav-item" type="button" onClick={actions.openPalette}>
            Command Palette
          </button>
          {viewKeys.map((objectKey) => (
            <button className="nav-item" type="button" onClick={() => actions.openObject(objectKey)} key={objectKey}>
              {workspaceObjects[objectKey].title}
            </button>
          ))}
          <button className="nav-item" type="button" onClick={() => actions.newFloating("Dashboard")}>
            Floating Window
          </button>
          <button className="nav-item" type="button" onClick={actions.splitSmart}>
            Split Pane
          </button>
        </section>
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

function getNoteSearchText(noteKey: NoteKey, objectStates: WorkspaceObjectStates) {
  const note = notes[noteKey];
  const objectState = objectStates[noteKey];
  const content = objectState?.kind === "note" ? objectState.content : "";
  return `${note.title} ${note.summary} ${note.cards.flat().join(" ")} ${content}`;
}
