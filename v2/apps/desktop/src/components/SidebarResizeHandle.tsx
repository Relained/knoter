import { useRef } from 'react';

export function SidebarResizeHandle({
  side,
  width,
  min,
  max,
  onChange,
  onCommit,
}: {
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; value: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, value)));
  return (
    <div
      className={`sidebar-resizer resizer-${side}`}
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${side} sidebar`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      title="Drag to resize · arrow keys to adjust · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width, value: width };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const value = clamp(
          drag.current.width + (e.clientX - drag.current.x) * (side === 'left' ? 1 : -1),
        );
        drag.current.value = value;
        onChange(value);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const value = drag.current.value;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(value);
      }}
      onPointerCancel={() => {
        if (drag.current) onChange(drag.current.width);
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => {
        const value = clamp(side === 'left' ? 222 : 326);
        onChange(value);
        onCommit(value);
      }}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const step = (e.shiftKey ? 40 : 10) * (side === 'left' ? 1 : -1);
        const value = clamp(
          e.key === 'Home'
            ? min
            : e.key === 'End'
              ? max
              : width + (e.key === 'ArrowRight' ? step : -step),
        );
        onChange(value);
        onCommit(value);
      }}
    />
  );
}
