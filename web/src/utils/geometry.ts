import type { EdgePosition, FloatingWindowModel, RectSnapshot } from "../domain/types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

export function placementEdge(x: number, y: number, rect: RectSnapshot): EdgePosition {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const relativeX = clamp((x - rect.left) / width, 0, 1);
  const relativeY = clamp((y - rect.top) / height, 0, 1);
  const distances: Array<[EdgePosition, number]> = [
    ["top", relativeY],
    ["right", 1 - relativeX],
    ["bottom", 1 - relativeY],
    ["left", relativeX]
  ];

  return distances.reduce((closest, edge) => (edge[1] < closest[1] ? edge : closest))[0];
}

export function serializeRect(rect: DOMRect | RectSnapshot): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

export function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return {
    width: Math.max(window.innerWidth, 320),
    height: Math.max(window.innerHeight, 240)
  };
}

export function constrainFloatingWindow<T extends Partial<FloatingWindowModel>>(win: T): T & Pick<FloatingWindowModel, "x" | "y" | "width" | "height"> {
  const viewport = getViewportSize();
  const width = clampNumber(win.width, 280, Math.max(280, viewport.width - 24), 430);
  const height = clampNumber(win.height, 200, Math.max(200, viewport.height - 24), 310);
  const x = clampNumber(win.x, 0, Math.max(0, viewport.width - width), 96);
  const y = clampNumber(win.y, 0, Math.max(0, viewport.height - height), 76);

  return {
    ...win,
    x,
    y,
    width,
    height
  };
}
