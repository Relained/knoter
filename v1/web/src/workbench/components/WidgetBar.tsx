import { Fragment, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { widgetBarWidthBounds } from "../../core/settings/preferences";
import { Icon } from "../../shared/icons/Icon";
import type { HtmlTab, WorkbenchWidget } from "../types";
import { HtmlPageView } from "./HtmlPageView";

const minWidgetHeightPx = 96;

type DividerDrag = {
  index: number;
  startY: number;
  firstStartRatio: number;
  pairRatio: number;
  stackHeight: number;
  minRatio: number;
};

type WidthDrag = {
  startX: number;
  startWidth: number;
};

export function WidgetBar({
  widgets,
  width,
  dailyNote,
  simpleNote,
  onDailyNote,
  onSimpleNote,
  onOpenAsTab,
  onUnpin,
  onResizeRatios,
  onResizeWidth,
}: {
  widgets: WorkbenchWidget[];
  width: number;
  dailyNote: string;
  simpleNote: string;
  onDailyNote: (value: string) => void;
  onSimpleNote: (value: string) => void;
  onOpenAsTab: (view: HtmlTab) => void;
  onUnpin: (widgetId: string) => void;
  onResizeRatios: (index: number, firstRatio: number, secondRatio: number) => void;
  onResizeWidth: (width: number) => void;
}) {
  const stackRef = useRef<HTMLDivElement | null>(null);
  const dividerDrag = useRef<DividerDrag | null>(null);
  const widthDrag = useRef<WidthDrag | null>(null);

  if (widgets.length === 0) return null;

  function startDividerDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    index: number,
  ) {
    const stackHeight = stackRef.current?.getBoundingClientRect().height ?? 0;
    const first = widgets[index];
    const second = widgets[index + 1];
    if (!first || !second || stackHeight <= 0) return;
    event.preventDefault();
    const pairRatio = first.ratio + second.ratio;
    dividerDrag.current = {
      index,
      startY: event.clientY,
      firstStartRatio: first.ratio,
      pairRatio,
      stackHeight,
      minRatio: Math.min(minWidgetHeightPx / stackHeight, pairRatio / 2),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDividerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dividerDrag.current;
    if (!drag) return;
    const deltaRatio = (event.clientY - drag.startY) / drag.stackHeight;
    const firstRatio = clamp(
      drag.firstStartRatio + deltaRatio,
      drag.minRatio,
      drag.pairRatio - drag.minRatio,
    );
    onResizeRatios(drag.index, firstRatio, drag.pairRatio - firstRatio);
  }

  function startWidthDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    widthDrag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveWidthDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = widthDrag.current;
    if (!drag) return;
    onResizeWidth(
      clamp(
        drag.startWidth + (drag.startX - event.clientX),
        widgetBarWidthBounds.min,
        widgetBarWidthBounds.max,
      ),
    );
  }

  return (
    <aside className="widget-bar" style={{ width }} aria-label="Pinned widgets">
      <div
        className="widget-bar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize widget bar"
        onPointerDown={startWidthDrag}
        onPointerMove={moveWidthDrag}
        onPointerUp={() => (widthDrag.current = null)}
        onPointerCancel={() => (widthDrag.current = null)}
      />
      <div className="widget-stack" ref={stackRef}>
        {widgets.map((widget, index) => (
          <Fragment key={widget.id}>
            {index > 0 && (
              <div
                className="widget-divider"
                role="separator"
                aria-orientation="horizontal"
                aria-label={`Resize ${widget.view.title}`}
                onPointerDown={(event) => startDividerDrag(event, index - 1)}
                onPointerMove={moveDividerDrag}
                onPointerUp={() => (dividerDrag.current = null)}
                onPointerCancel={() => (dividerDrag.current = null)}
              />
            )}
            <section
              className="widget-pane"
              style={{ flexGrow: widget.ratio }}
              aria-label={widget.view.title}
            >
              <header className="widget-pane-header">
                <span className="widget-pane-title">
                  <span className="widget-pane-label">{widget.view.label}</span>
                  {widget.view.title}
                </span>
                <span className="widget-pane-actions">
                  <button
                    type="button"
                    aria-label={`Open ${widget.view.title} as tab`}
                    title="Open as tab"
                    onClick={() => onOpenAsTab(widget.view)}
                  >
                    <Icon name="window.dock" size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Unpin ${widget.view.title}`}
                    title="Unpin"
                    onClick={() => onUnpin(widget.id)}
                  >
                    <Icon name="widget.unpin" size={13} />
                  </button>
                </span>
              </header>
              <div className="widget-pane-body">
                <HtmlPageView
                  tab={widget.view}
                  variant="widget"
                  dailyNote={dailyNote}
                  simpleNote={simpleNote}
                  onDailyNote={onDailyNote}
                  onSimpleNote={onSimpleNote}
                />
              </div>
            </section>
          </Fragment>
        ))}
      </div>
    </aside>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
