import { builtinViews, initialTabs } from "../fixtures";
import type { HtmlTab, WorkbenchWidget } from "../types";

const widgetStorageKey = "knoter.workbench.widgets";

export function loadStoredWidgets(): WorkbenchWidget[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(widgetStorageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const views = knownViews();
    const widgets: WorkbenchWidget[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { id, ratio } = entry as { id?: unknown; ratio?: unknown };
      if (typeof id !== "string") continue;
      const view = views.get(id);
      if (!view || widgets.some((widget) => widget.id === id)) continue;
      widgets.push({
        id,
        view,
        ratio:
          typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
            ? ratio
            : 1,
      });
    }
    return normalizeWidgetRatios(widgets);
  } catch {
    return [];
  }
}

export function saveStoredWidgets(widgets: WorkbenchWidget[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      widgetStorageKey,
      JSON.stringify(widgets.map(({ id, ratio }) => ({ id, ratio }))),
    );
  } catch {
    // Persistence is best-effort; quota failures must not break the UI.
  }
}

export function pinWidget(
  widgets: WorkbenchWidget[],
  view: HtmlTab,
): WorkbenchWidget[] {
  if (widgets.some((widget) => widget.id === view.id)) return widgets;
  const count = widgets.length;
  const scaled = widgets.map((widget) => ({
    ...widget,
    ratio: widget.ratio * (count / (count + 1)),
  }));
  return [...scaled, { id: view.id, view, ratio: 1 / (count + 1) }];
}

export function unpinWidget(
  widgets: WorkbenchWidget[],
  widgetId: string,
): WorkbenchWidget[] {
  return normalizeWidgetRatios(
    widgets.filter((widget) => widget.id !== widgetId),
  );
}

export function resizeWidgetPair(
  widgets: WorkbenchWidget[],
  index: number,
  firstRatio: number,
  secondRatio: number,
): WorkbenchWidget[] {
  return widgets.map((widget, widgetIndex) => {
    if (widgetIndex === index) return { ...widget, ratio: firstRatio };
    if (widgetIndex === index + 1) return { ...widget, ratio: secondRatio };
    return widget;
  });
}

export function normalizeWidgetRatios(
  widgets: WorkbenchWidget[],
): WorkbenchWidget[] {
  if (widgets.length === 0) return widgets;
  const total = widgets.reduce((sum, widget) => sum + widget.ratio, 0);
  if (total <= 0) {
    return widgets.map((widget) => ({ ...widget, ratio: 1 / widgets.length }));
  }
  return widgets.map((widget) => ({ ...widget, ratio: widget.ratio / total }));
}

function knownViews(): Map<string, HtmlTab> {
  const views = new Map<string, HtmlTab>();
  for (const view of Object.values(builtinViews)) views.set(view.id, view);
  for (const tab of initialTabs) views.set(tab.id, tab);
  return views;
}
