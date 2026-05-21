import { useRef } from "react";
import type { PointerEvent } from "react";
import type {
  EdgePosition,
  EdgePreviewModel,
  FloatingWindowModel,
  WorkspaceObjectKey,
  WorkspaceObjectState,
  WorkspaceObjectStates
} from "../domain/types";
import type { GlobalSettings } from "../settings/preferences";
import { constrainFloatingWindow } from "../utils/geometry";
import { Icon } from "../icons/Icon";
import { IconButton } from "./IconButton";
import { ScreenContent } from "./ScreenContent";
import { ScreenToolbar } from "./ScreenToolbar";

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  winX: number;
  winY: number;
};

type ResizeState = {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type FloatingWindowProps = {
  win: FloatingWindowModel;
  active: boolean;
  onFocus: () => void;
  onMoveToolbar: () => void;
  onSetToolbarPosition: (position: EdgePosition) => void;
  onPreviewEdge: (preview: EdgePreviewModel | null) => void;
  onDock: () => void;
  onClose: () => void;
  onChange: (patch: Partial<FloatingWindowModel>) => void;
  objectStates: WorkspaceObjectStates;
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
  onChangeObjectState: (objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) => void;
  onOpenObject: (objectKey: WorkspaceObjectKey, target: "pane" | "floating") => void;
};

export function FloatingWindow({
  win,
  active,
  onFocus,
  onMoveToolbar,
  onSetToolbarPosition,
  onPreviewEdge,
  onDock,
  onClose,
  onChange,
  objectStates,
  settings,
  onChangeSettings,
  onChangeObjectState,
  onOpenObject
}: FloatingWindowProps) {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const objectState = objectStates[win.objectKey] ?? null;

  function startDrag(event: PointerEvent<HTMLElement>) {
    const start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      winX: win.x,
      winY: win.y
    };
    dragRef.current = start;
    event.currentTarget.setPointerCapture(event.pointerId);
    onFocus();
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const start = dragRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    onChange(constrainFloatingWindow({
      ...win,
      x: start.winX + event.clientX - start.x,
      y: start.winY + event.clientY - start.y
    }));
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function startResize(event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    resizeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: win.width,
      height: win.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onFocus();
  }

  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    const start = resizeRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    onChange(constrainFloatingWindow({
      ...win,
      width: start.width + event.clientX - start.x,
      height: start.height + event.clientY - start.y
    }));
  }

  function stopResize(event: PointerEvent<HTMLSpanElement>) {
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
  }

  return (
    <section
      className={`floating-window ${active ? "is-focused" : ""}`}
      data-toolbar-position={win.toolbarPosition}
      style={{ left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }}
      onPointerDown={onFocus}
      onFocus={onFocus}
    >
      <header
        className="floating-titlebar"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span className="floating-title">{win.title}</span>
        <div className="window-actions" onPointerDown={(event) => event.stopPropagation()}>
          <IconButton label="Dock to main workspace" onClick={onDock}>
            <Icon name="window.dock" size={15} />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <Icon name="window.close" size={15} />
          </IconButton>
        </div>
      </header>
      <ScreenToolbar
        toolbarPosition={win.toolbarPosition}
        onMoveToolbar={onMoveToolbar}
        onSetToolbarPosition={onSetToolbarPosition}
        onPreviewEdge={onPreviewEdge}
        onDock={onDock}
      />
      <ScreenContent
        objectKey={win.objectKey}
        noteKey={win.noteKey}
        objectState={objectState}
        objectStates={objectStates}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onChangeObjectState={onChangeObjectState}
        onOpenObject={onOpenObject}
      />
      <span
        className="resize-handle"
        aria-hidden="true"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />
    </section>
  );
}
