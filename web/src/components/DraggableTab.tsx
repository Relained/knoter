import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { EdgePosition, RectSnapshot, Tab, TabPlacementPreviewModel } from "../domain/types";
import { Icon } from "../icons/Icon";
import { placementEdge, serializeRect } from "../utils/geometry";

const dragThreshold = 4;
const insertionMarkerWidth = 4;

type TabDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  sourcePaneId: string | null;
  targetPaneId: string | null;
  position: EdgePosition | null;
  targetTabId: string | null;
  tabPlacement: "before" | "after" | null;
  mode: "pane" | "tab";
  moved: boolean;
};

type DraggableTabProps = {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPlacementPreview: (preview: TabPlacementPreviewModel | null) => void;
  onSplit: (tabId: string, edge: EdgePosition, targetPaneId: string | null) => void;
  onMoveTab: (tabId: string, targetPaneId: string, targetTabId: string, placement: "before" | "after") => void;
};

export function DraggableTab({ tab, active, onSelect, onClose, onPlacementPreview, onSplit, onMoveTab }: DraggableTabProps) {
  const dragRef = useRef<TabDragState | null>(null);
  const suppressClickRef = useRef(false);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const pane = event.currentTarget.closest<HTMLElement>(".workspace-pane");
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourcePaneId: pane?.dataset.paneId ?? null,
      targetPaneId: pane?.dataset.paneId ?? null,
      position: null,
      targetTabId: null,
      tabPlacement: null,
      mode: "pane",
      moved: false
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance <= dragThreshold) return;

    drag.moved = true;
    const target = getTabDropTarget(event.clientX, event.clientY, drag.sourcePaneId, tab.id);
    drag.targetPaneId = target.paneId;
    drag.position = target.position;
    drag.targetTabId = target.targetTabId;
    drag.tabPlacement = target.tabPlacement;
    drag.mode = target.mode;
    onPlacementPreview(toPlacementPreview(tab.id, target));
  }

  function stopDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    onPlacementPreview(null);

    if (!drag.moved || !drag.position) {
      return;
    }

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (drag.mode === "tab" && drag.targetPaneId && drag.targetTabId && drag.tabPlacement) {
      onMoveTab(tab.id, drag.targetPaneId, drag.targetTabId, drag.tabPlacement);
      return;
    }

    onSplit(tab.id, drag.position, drag.targetPaneId);
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onPlacementPreview(null);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }
    onSelect();
  }

  return (
    <div className={`tab ${active ? "is-active" : ""}`} data-tab-id={tab.id}>
      <button
        className="tab-label tab-drag-handle"
        type="button"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={cancelDrag}
        onClick={handleClick}
      >
        <span>{tab.title}</span>
      </button>
      <button className="tab-close" type="button" title="Close tab" onClick={onClose}>
        <Icon name="window.close" size={13} />
      </button>
    </div>
  );
}

function getTabDropTarget(clientX: number, clientY: number, fallbackPaneId: string | null, draggedTabId: string): {
  paneId: string | null;
  rect: RectSnapshot;
  position: EdgePosition;
  targetTabId: string | null;
  tabPlacement: "before" | "after" | null;
  mode: "pane" | "tab";
} {
  const insertionTarget = getTabInsertionTarget(clientX, clientY, draggedTabId, fallbackPaneId);
  if (insertionTarget) {
    return {
      paneId: insertionTarget.paneId,
      rect: insertionTarget.rect,
      position: insertionTarget.placement === "before" ? "left" : "right",
      targetTabId: insertionTarget.targetTabId,
      tabPlacement: insertionTarget.placement,
      mode: "tab"
    };
  }

  const { targetPane, rect } = getTargetPaneRect(clientX, clientY, fallbackPaneId);

  return {
    paneId: targetPane?.dataset.paneId ?? fallbackPaneId,
    rect,
    position: placementEdge(clientX, clientY, rect),
    targetTabId: null,
    tabPlacement: null,
    mode: "pane"
  };
}

type TabInsertionBoundary = {
  x: number;
  targetTabId: string;
  placement: "before" | "after";
  rect?: RectSnapshot;
};

function getTabInsertionTarget(
  clientX: number,
  clientY: number,
  draggedTabId: string,
  fallbackPaneId: string | null
): {
  paneId: string | null;
  rect: RectSnapshot;
  targetTabId: string;
  placement: "before" | "after";
} | null {
  const tabStrip = getTargetTabStrip(clientX, clientY);
  if (!tabStrip) return null;

  const stripRect = tabStrip.getBoundingClientRect();
  if (clientY < stripRect.top || clientY > stripRect.bottom) return null;

  const tabs = Array.from(tabStrip.querySelectorAll<HTMLElement>(".tab[data-tab-id]"))
    .filter((element) => element.dataset.tabId);
  const boundaries = createTabInsertionBoundaries(tabs, draggedTabId);
  if (boundaries.length === 0) return null;
  const closestBoundary = boundaries.reduce((closest, boundary) =>
    Math.abs(boundary.x - clientX) < Math.abs(closest.x - clientX) ? boundary : closest
  );

  return {
    paneId: tabStrip.closest<HTMLElement>(".workspace-pane")?.dataset.paneId ?? fallbackPaneId,
    rect: closestBoundary.rect ?? {
      left: closestBoundary.x - insertionMarkerWidth / 2,
      top: stripRect.top,
      width: insertionMarkerWidth,
      height: stripRect.height
    },
    targetTabId: closestBoundary.targetTabId,
    placement: closestBoundary.placement
  };
}

function getTargetTabStrip(clientX: number, clientY: number) {
  return document
    .elementsFromPoint(clientX, clientY)
    .map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>(".tab-strip") : null)
    .find((element): element is HTMLElement => Boolean(element)) ?? null;
}

function createTabInsertionBoundaries(tabs: HTMLElement[], draggedTabId: string): TabInsertionBoundary[] {
  const firstTabId = tabs[0].dataset.tabId;
  const lastTabId = tabs[tabs.length - 1].dataset.tabId;
  const boundaries: TabInsertionBoundary[] = [];
  const sourceTab = tabs.find((tab) => tab.dataset.tabId === draggedTabId);

  if (sourceTab) {
    const sourceRect = serializeRect(sourceTab.getBoundingClientRect());
    boundaries.push({
      x: sourceRect.left + sourceRect.width / 2,
      targetTabId: draggedTabId,
      placement: "after",
      rect: sourceRect
    });
  }

  if (firstTabId && firstTabId !== draggedTabId) {
    boundaries.push({
      x: tabs[0].getBoundingClientRect().left,
      targetTabId: firstTabId,
      placement: "before"
    });
  }

  for (let index = 1; index < tabs.length; index += 1) {
    const targetTabId = tabs[index].dataset.tabId;
    if (!targetTabId) continue;
    const previousTabId = tabs[index - 1].dataset.tabId;
    if (targetTabId === draggedTabId || previousTabId === draggedTabId) continue;
    const previousRect = tabs[index - 1].getBoundingClientRect();
    const targetRect = tabs[index].getBoundingClientRect();
    boundaries.push({
      x: (previousRect.right + targetRect.left) / 2,
      targetTabId,
      placement: "before"
    });
  }

  if (lastTabId && lastTabId !== draggedTabId) {
    boundaries.push({
      x: tabs[tabs.length - 1].getBoundingClientRect().right,
      targetTabId: lastTabId,
      placement: "after"
    });
  }

  return boundaries;
}

function toPlacementPreview(
  sourceTabId: string,
  target: ReturnType<typeof getTabDropTarget>
): TabPlacementPreviewModel {
  if (target.mode === "tab" && target.targetTabId && target.tabPlacement) {
    return {
      mode: "tab",
      sourceTabId,
      targetPaneId: target.paneId,
      targetTabId: target.targetTabId,
      tabPlacement: target.tabPlacement,
      rect: target.rect,
      position: target.position
    };
  }

  return {
    mode: "pane",
    sourceTabId,
    targetPaneId: target.paneId,
    rect: target.rect,
    position: target.position
  };
}

function getTargetPaneRect(clientX: number, clientY: number, fallbackPaneId: string | null): {
  targetPane: HTMLElement | null;
  rect: RectSnapshot;
} {
  const pane = document
    .elementsFromPoint(clientX, clientY)
    .find((element): element is HTMLElement => element instanceof HTMLElement && element.classList.contains("workspace-pane"));
  const fallbackPane = fallbackPaneId ? document.querySelector<HTMLElement>(`[data-pane-id="${fallbackPaneId}"]`) : null;
  const targetPane = pane ?? fallbackPane;
  const rect = serializeRect(targetPane?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect());

  return {
    targetPane,
    rect
  };
}
