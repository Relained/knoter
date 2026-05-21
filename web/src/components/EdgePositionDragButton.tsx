import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { EdgePosition, EdgePreviewModel, RectSnapshot } from "../domain/types";
import { Icon } from "../icons/Icon";
import { placementEdge, serializeRect } from "../utils/geometry";

type EdgeDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  rect: RectSnapshot;
  position: EdgePosition;
  moved: boolean;
};

type EdgePositionDragButtonProps = {
  label: string;
  size: number;
  scopeSelector: string;
  fallbackClick?: () => void;
  onCommit: (position: EdgePosition) => void;
  onPreview: (preview: EdgePreviewModel | null) => void;
};

export function EdgePositionDragButton({ label, size, scopeSelector, fallbackClick, onCommit, onPreview }: EdgePositionDragButtonProps) {
  const dragRef = useRef<EdgeDragState | null>(null);
  const suppressClickRef = useRef(false);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const scope = event.currentTarget.closest(scopeSelector);
    const rect = serializeRect(scope?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect());
    const nextPosition = placementEdge(event.clientX, event.clientY, rect);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      position: nextPosition,
      moved: false
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview({ rect, position: nextPosition });
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextPosition = placementEdge(event.clientX, event.clientY, drag.rect);
    drag.moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
    drag.position = nextPosition;
    onPreview({ rect: drag.rect, position: nextPosition });
  }

  function stopDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    onPreview(null);

    if (!drag.moved && fallbackClick) {
      fallbackClick();
      return;
    }

    onCommit(drag.position);
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    onPreview(null);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }

    fallbackClick?.();
  }

  return (
    <button
      className="icon-button edge-drag-button"
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={cancelDrag}
      onClick={handleClick}
    >
      <Icon name="layout.move" size={size} />
    </button>
  );
}
