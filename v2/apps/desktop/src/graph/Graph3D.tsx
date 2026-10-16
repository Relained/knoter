import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Focus, Minus, Orbit, Plus, SlidersHorizontal } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { DocumentContextMenu } from '../components/DocumentMenu';
import type { WikiEdge } from '../wiki/links';
import { defaultForces } from './simulation';
import { ForceSimulation3D, type Node3D, type Point3 } from './simulation3d';
import { ForcesPanel, GraphLegend, PALETTE_SIZE, useGraphData, useGraphForces } from './shared';

/** Orbit camera: it circles `target` at `distance`, turned by yaw and pitch. */
interface Camera {
  yaw: number;
  pitch: number;
  distance: number;
  target: Point3;
}
interface Drag {
  mode: 'orbit' | 'pan' | 'node';
  id?: string;
  x: number;
  y: number;
  camera: Camera;
  start?: Point3;
  moved: boolean;
  lastX: number;
  lastY: number;
}
interface Palette {
  nodes: string[];
  /** Each node color blended toward the background in FOG_LEVELS steps, near to far. */
  fogged: string[][];
  edge: string;
  highlight: string;
  label: string;
  halo: string;
}

const FOV = (45 * Math.PI) / 180;
const ROTATE_SPEED = 0.0016;
const IDLE_BEFORE_ROTATE = 6000;
const MAX_LABELS = 70;
const FOG_LEVELS = 8;

const rgb = (color: string) => {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** Blend two hex colors; other color forms return the first unchanged. */
function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const nodes = Array.from({ length: PALETTE_SIZE }, (_, i) => token(`--graph-${i}`, '#6f9a7a'));
  const fog = token('--graph-space-mid', token('--panel', '#fafbf8'));
  return {
    nodes,
    fogged: nodes.map((c) =>
      Array.from({ length: FOG_LEVELS }, (_, level) =>
        mix(c, fog, (level / (FOG_LEVELS - 1)) * 0.72),
      ),
    ),
    edge: token('--graph-edge', '#c9d1c6'),
    highlight: token('--primary', '#315c45'),
    label: token('--foreground', '#303b34'),
    halo: token('--graph-label-halo', token('--panel', '#fafbf8')),
  };
}

export function Graph3D({
  documents,
  edges: allEdges,
  focusId,
  depth = 1,
  query = '',
  forces = defaultForces,
  onForces,
  onOpen,
  className = '',
  insetTop = 0,
  rotate = true,
  onRotate,
  modeToggle,
}: {
  documents: WikiDocument[];
  edges: WikiEdge[];
  focusId?: string;
  depth?: number;
  query?: string;
  forces?: GraphForces;
  onForces?: (forces: GraphForces) => void;
  onOpen: (id: string) => void;
  className?: string;
  /** Height covered by an overlay at the top, such as the home search field. */
  insetTop?: number;
  /** Turn slowly while nobody is using the graph. */
  rotate?: boolean;
  onRotate?: (rotate: boolean) => void;
  modeToggle?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, Point3>());
  const camera = useRef<Camera>({
    yaw: 0.6,
    pitch: -0.32,
    distance: 900,
    target: { x: 0, y: 0, z: 0 },
  });
  const userMoved = useRef(false);
  const idleSince = useRef(-Infinity);
  const radius = useRef(60);
  const inertia = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const lastFrame = useRef(0);
  const lastDraw = useRef(0);
  const palette = useRef<Palette | null>(null);
  const view = useRef({ width: 1, height: 1, dpr: 1 });
  // Screen positions from the last frame, nearest first, for hit testing.
  const projected = useRef<{ id: string; x: number; y: number; r: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const [menuDoc, setMenuDoc] = useState<WikiDocument | null>(null);
  const [panel, setPanel] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [localForces, updateForces] = useGraphForces(forces, onForces);
  const appliedForces = useRef(JSON.stringify(forces));
  const rotateRef = useRef(rotate);
  rotateRef.current = rotate;
  const { visible, edges, structure, categories, matches, searching } = useGraphData(
    documents,
    allEdges,
    focusId,
    depth,
    query,
  );

  const simulation = useMemo(() => {
    const known = positions.current;
    const sim = ForceSimulation3D.create(
      visible.map((d) => d.id),
      edges,
      localForces,
      known,
      focusId,
    );
    const reused = sim.nodes.filter((n) => known.has(n.id)).length;
    if (reused > sim.nodes.length * 0.8) sim.alpha = 0.25;
    else sim.warm(300, Math.min(140, 30 + sim.nodes.length / 5));
    return sim;
    // Forces apply through setForces below; a rebuild is only for structure.
  }, [structure, focusId, layoutVersion]);

  // Everything the frame loop reads that React owns, refreshed on every render.
  const scene = useRef({
    docs: new Map<string, WikiDocument>(),
    color: new Map<string, number>(),
    neighbors: new Map<string, Set<string>>(),
    matches,
    searching,
    hubs: new Set<string>(),
    focusId,
    insetTop,
  });
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of simulation.links) {
      const a = link.source.id;
      const b = link.target.id;
      map.set(a, (map.get(a) ?? new Set()).add(b));
      map.set(b, (map.get(b) ?? new Set()).add(a));
    }
    return map;
  }, [simulation]);
  const hubs = simulation.structure.hubs;
  scene.current = {
    docs: new Map(visible.map((d) => [d.id, d])),
    color: new Map(
      visible.map((d) => [d.id, Math.max(0, categories.indexOf(d.category)) % PALETTE_SIZE]),
    ),
    neighbors,
    matches,
    searching,
    hubs: new Set(hubs),
    focusId,
    insetTop,
  };

  /** Focal length and center of the drawing area below any top overlay. */
  const lens = () => {
    const { width, height } = view.current;
    const usable = Math.max(1, height - scene.current.insetTop);
    return {
      focal: usable / 2 / Math.tan(FOV / 2),
      cx: width / 2,
      cy: scene.current.insetTop + usable / 2,
      size: Math.min(width, usable),
    };
  };
  /** Radius that holds nearly every note, ignoring a stray outlier; kept per layout step. */
  const measure = useCallback(() => {
    const radii = simulation.nodes
      .map((n) => Math.hypot(n.x, n.y, n.z) + n.radius)
      .sort((a, b) => a - b);
    // A small wiki should not fill the screen with a few huge spheres.
    radius.current = Math.max(170, radii[Math.floor((radii.length - 1) * 0.98)] ?? 170);
  }, [simulation]);
  const fitDistance = useCallback(() => {
    const { focal, size } = lens();
    const r = radius.current;
    return Math.max(r * 1.25, (r * focal) / (size * 0.44));
  }, []);

  const draw = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const colors = (palette.current ??= readPalette(element));
    const { width, height, dpr } = view.current;
    const { docs, color, matches, searching, hubs, focusId } = scene.current;
    const hoveredId = hoveredRef.current;
    const near = hoveredId ? scene.current.neighbors.get(hoveredId) : undefined;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { yaw, pitch, distance, target } = camera.current;
    const { focal, cx, cy } = lens();
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const sphere = radius.current;
    const nodes = simulation.nodes;
    const count = nodes.length;
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const sr = new Float32Array(count);
    const depthOf = new Float32Array(count);
    const fade = new Float32Array(count);
    const fog = new Float32Array(count);
    const index = new Map<Node3D, number>();
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      index.set(n, i);
      const dx = n.x - target.x;
      const dy = n.y - target.y;
      const dz = n.z - target.z;
      const x1 = cosY * dx - sinY * dz;
      const z1 = sinY * dx + cosY * dz;
      const y2 = cosP * dy - sinP * z1;
      const d = sinP * dy + cosP * z1 + distance;
      depthOf[i] = d;
      if (d < 4) {
        fade[i] = 0;
        continue;
      }
      const s = focal / d;
      sx[i] = cx + x1 * s;
      sy[i] = cy - y2 * s;
      // Keep every note visible and hubs distinctly larger, whatever the zoom.
      sr[i] = Math.max(Math.min(10, 1.8 + Math.sqrt(n.degree) * 0.9), n.radius * s);
      // Depth fog: the far side of the sphere recedes.
      const t = Math.min(1, Math.max(0, (d - (distance - sphere)) / (2 * sphere)));
      fade[i] = 1 - 0.78 * t;
      fog[i] = t;
    }
    const emphasis = (n: Node3D) => {
      if (hoveredId) return n.id === hoveredId || near?.has(n.id) ? 1 : 0.12;
      if (searching) return matches.has(n.id) ? 1 : 0.12;
      return 1;
    };

    // Links, batched by opacity so a thousand lines cost a handful of strokes.
    const buckets: Path2D[] = Array.from({ length: 10 }, () => new Path2D());
    const highlighted = new Path2D();
    for (const link of simulation.links) {
      const a = index.get(link.source)!;
      const b = index.get(link.target)!;
      if (!fade[a] || !fade[b]) continue;
      const touches = hoveredId && (link.source.id === hoveredId || link.target.id === hoveredId);
      if (touches) {
        highlighted.moveTo(sx[a], sy[a]);
        highlighted.lineTo(sx[b], sy[b]);
        continue;
      }
      let alpha = Math.min(fade[a], fade[b]) * 0.65;
      if (hoveredId) alpha *= 0.12;
      else if (searching) alpha *= 0.35;
      const bucket = Math.min(9, Math.floor(alpha * 10));
      if (bucket <= 0) continue;
      buckets[bucket].moveTo(sx[a], sy[a]);
      buckets[bucket].lineTo(sx[b], sy[b]);
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = colors.edge;
    buckets.forEach((path, bucket) => {
      if (!bucket) return;
      ctx.globalAlpha = bucket / 10;
      ctx.stroke(path);
    });
    if (hoveredId) {
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = colors.highlight;
      ctx.stroke(highlighted);
    }

    // Notes, far to near, as flat single-color circles. Fog blends the color toward the
    // background so circles stay opaque over the links behind them; only de-emphasized
    // notes become translucent.
    const order = Array.from({ length: count }, (_, i) => i)
      .filter((i) => fade[i] > 0)
      .sort((a, b) => depthOf[b] - depthOf[a]);
    for (const i of order) {
      const n = nodes[i];
      const tone = color.get(n.id) ?? 0;
      ctx.globalAlpha = emphasis(n);
      ctx.fillStyle = colors.fogged[tone][Math.round(fog[i] * (FOG_LEVELS - 1))];
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], sr[i], 0, Math.PI * 2);
      ctx.fill();
      if (n.id === hoveredId || n.id === focusId) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = colors.label;
        ctx.stroke();
      }
    }

    // Labels: central and highlighted notes first, then the nearest legible notes; a
    // label that would overlap one already placed is skipped.
    const priority = (n: Node3D) =>
      n.id === hoveredId
        ? 0
        : n.role === 'core' || n.id === focusId
          ? 1
          : near?.has(n.id) || (searching && matches.has(n.id) && matches.size <= 40)
            ? 2
            : hubs.has(n.id)
              ? 3
              : 4;
    const candidates: number[] = [];
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k];
      const n = nodes[i];
      const legible = count <= 40 ? fade[i] > 0.3 : sr[i] >= 5.5 && fade[i] > 0.5;
      if (priority(n) < 4 || (legible && emphasis(n) > 0.5)) candidates.push(i);
    }
    candidates.sort((a, b) => priority(nodes[a]) - priority(nodes[b]));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const labels: { i: number; text: string; font: string; size: number }[] = [];
    for (const i of candidates) {
      if (labels.length >= MAX_LABELS) break;
      const n = nodes[i];
      const doc = docs.get(n.id);
      if (!doc) continue;
      const strong = n.role === 'core' || n.role === 'hub' || n.id === hoveredId;
      const size = strong ? 12.5 : 11;
      const title = doc.title.split('/').at(-1)!;
      const text = title.length > 34 ? `${title.slice(0, 32)}…` : title;
      const font = `${strong ? 650 : 500} ${size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', sans-serif`;
      ctx.font = font;
      const half = ctx.measureText(text).width / 2 + 3;
      const top = sy[i] + sr[i] + 3;
      const box = { x0: sx[i] - half, y0: top, x1: sx[i] + half, y1: top + size + 3 };
      const clash = placed.some(
        (p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0,
      );
      if (clash && priority(n) > 0) continue;
      placed.push(box);
      labels.push({ i, text, font, size });
    }
    // Far labels first so nearer ones stay on top.
    labels.sort((a, b) => depthOf[b.i] - depthOf[a.i]);
    for (const { i, text, font } of labels) {
      ctx.font = font;
      ctx.globalAlpha = Math.max(0.4, fade[i] * emphasis(nodes[i]));
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = colors.halo;
      ctx.strokeText(text, sx[i], sy[i] + sr[i] + 4);
      ctx.fillStyle = colors.label;
      ctx.fillText(text, sx[i], sy[i] + sr[i] + 4);
    }
    ctx.globalAlpha = 1;
    projected.current = order
      .slice()
      .reverse()
      .map((i) => ({ id: nodes[i].id, x: sx[i], y: sy[i], r: sr[i] }));
  }, [simulation]);

  const loop = useCallback(
    (time: number) => {
      frame.current = null;
      const dt = Math.min(64, time - (lastFrame.current || time));
      lastFrame.current = time;
      let active = false;
      if (!simulation.settled) {
        // Two ticks per frame keep large graphs moving without long frames.
        simulation.tick();
        if (!simulation.settled) simulation.tick();
        for (const n of simulation.nodes) positions.current.set(n.id, { x: n.x, y: n.y, z: n.z });
        measure();
        active = true;
      }
      const cam = camera.current;
      const spin = inertia.current;
      if (Math.abs(spin.yaw) + Math.abs(spin.pitch) > 0.0004 && !drag.current) {
        cam.yaw += spin.yaw;
        cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch + spin.pitch));
        spin.yaw *= 0.93;
        spin.pitch *= 0.93;
        active = true;
      }
      const busy = active;
      let spinning = false;
      if (
        rotateRef.current &&
        !drag.current &&
        !hoveredRef.current &&
        performance.now() - idleSince.current > IDLE_BEFORE_ROTATE
      ) {
        cam.yaw += ROTATE_SPEED * (dt / 16.7);
        spinning = true;
      }
      if (!userMoved.current) {
        // Follow the sphere as it grows until someone takes the camera.
        const goal = fitDistance();
        cam.distance += (goal - cam.distance) * 0.12;
        cam.target = {
          x: cam.target.x * 0.85,
          y: cam.target.y * 0.85,
          z: cam.target.z * 0.85,
        };
        if (Math.abs(goal - cam.distance) > 1) active = true;
      }
      // The idle turn is slow; drawing it at about 30 fps halves its background cost.
      if (spinning && !busy && !active && time - lastDraw.current < 30) {
        frame.current = requestAnimationFrame(loop);
        return;
      }
      lastDraw.current = time;
      draw();
      const fit = fitDistance();
      setZoom((current) => {
        const next = fit / cam.distance;
        return Math.abs(current - next) > 0.004 ? next : current;
      });
      if (active || spinning) frame.current = requestAnimationFrame(loop);
    },
    [simulation, draw, fitDistance, measure],
  );
  const requestFrame = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(loop);
  }, [loop]);
  const touch = () => {
    idleSince.current = performance.now();
  };

  useLayoutEffect(() => {
    measure();
    requestFrame();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [measure, requestFrame]);
  useEffect(() => {
    if (rotate) requestFrame();
  }, [rotate, requestFrame]);
  useEffect(() => {
    // Re-read colors when the theme changes; hover, search, and focus need a redraw too.
    requestFrame();
  }, [hovered, structure, query, requestFrame]);
  useEffect(() => {
    const key = JSON.stringify(localForces);
    if (key === appliedForces.current) return;
    appliedForces.current = key;
    simulation.setForces(localForces);
    simulation.reheat(0.5);
    requestFrame();
  }, [localForces, simulation, requestFrame]);

  useEffect(() => {
    const box = container.current;
    const element = canvas.current;
    if (!box || !element) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = box.clientWidth;
      const height = box.clientHeight;
      view.current = { width, height, dpr };
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      if (!userMoved.current) camera.current.distance = fitDistance();
      requestFrame();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    const themes = new MutationObserver(() => {
      palette.current = null;
      requestFrame();
    });
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // Own wheel events across the canvas and its overlays so the page never scrolls.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      if (!delta) return;
      zoomBy(Math.exp(-delta * 0.0015));
    };
    box.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      observer.disconnect();
      themes.disconnect();
      box.removeEventListener('wheel', onWheel, true);
    };
    // zoomBy reads refs only.
  }, [fitDistance, requestFrame]);

  function zoomBy(factor: number) {
    const fit = fitDistance();
    const cam = camera.current;
    cam.distance = Math.max(30, Math.min(fit * 5, cam.distance / factor));
    userMoved.current = true;
    touch();
    requestFrame();
  }
  const refit = () => {
    userMoved.current = false;
    touch();
    requestFrame();
  };

  const hitTest = (clientX: number, clientY: number) => {
    const bounds = canvas.current!.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    for (const p of projected.current)
      if ((p.x - x) ** 2 + (p.y - y) ** 2 <= Math.max(p.r + 3, 7) ** 2) return p.id;
    return null;
  };
  /** Turn a screen offset at a note's depth into a world offset. */
  const screenToWorld = (dx: number, dy: number, at: Point3, cam: Camera): Point3 => {
    const { focal } = lens();
    const cosY = Math.cos(cam.yaw);
    const sinY = Math.sin(cam.yaw);
    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);
    const rx = at.x - cam.target.x;
    const ry = at.y - cam.target.y;
    const rz = at.z - cam.target.z;
    const z1 = sinY * rx + cosY * rz;
    const depthAt = sinP * ry + cosP * z1 + cam.distance;
    const k = Math.max(1, depthAt) / focal;
    const cx = dx * k;
    const cy = -dy * k;
    // Undo pitch, then yaw (camera space has no z offset for a sideways move).
    const y = cosP * cy;
    const zp = -sinP * cy;
    return { x: cosY * cx + sinY * zp, y, z: -sinY * cx + cosY * zp };
  };
  // The tooltip follows the pointer, so it shows only for hovers on the canvas itself.
  const [pointerHover, setPointerHover] = useState(false);
  const setHover = (id: string | null, fromPointer = false) => {
    setPointerHover(fromPointer && !!id);
    if (hoveredRef.current === id) return;
    hoveredRef.current = id;
    setHovered(id);
  };
  const moveTooltip = (clientX: number, clientY: number) => {
    const bounds = container.current!.getBoundingClientRect();
    tooltip.current?.style.setProperty(
      'transform',
      `translate(${clientX - bounds.left + 14}px, ${clientY - bounds.top + 14}px)`,
    );
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const id = hitTest(e.clientX, e.clientY);
    if (e.button === 2) {
      setMenuDoc(id ? (scene.current.docs.get(id) ?? null) : null);
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    touch();
    inertia.current = { yaw: 0, pitch: 0 };
    const cam = camera.current;
    const node = id ? simulation.byId.get(id) : undefined;
    drag.current = {
      mode:
        node && e.button === 0 && !e.shiftKey
          ? 'node'
          : e.shiftKey || e.button === 1
            ? 'pan'
            : 'orbit',
      id: node?.id,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      camera: { ...cam, target: { ...cam.target } },
      start: node ? { x: node.x, y: node.y, z: node.z } : undefined,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    moveTooltip(e.clientX, e.clientY);
    const d = drag.current;
    if (!d) {
      const id = hitTest(e.clientX, e.clientY);
      setHover(id, true);
      e.currentTarget.style.cursor = id ? 'pointer' : 'grab';
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true;
      if (d.mode === 'node') {
        simulation.alphaTarget = 0.2;
        simulation.reheat(0.2);
      }
    }
    if (!d.moved) return;
    touch();
    const cam = camera.current;
    if (d.mode === 'orbit') {
      cam.yaw = d.camera.yaw + dx * 0.006;
      cam.pitch = Math.max(-1.45, Math.min(1.45, d.camera.pitch + dy * 0.006));
      inertia.current = {
        yaw: (e.clientX - d.lastX) * 0.006,
        pitch: (e.clientY - d.lastY) * 0.006,
      };
    } else if (d.mode === 'pan') {
      const shift = screenToWorld(dx, dy, d.camera.target, d.camera);
      cam.target = {
        x: d.camera.target.x - shift.x,
        y: d.camera.target.y - shift.y,
        z: d.camera.target.z - shift.z,
      };
      userMoved.current = true;
    } else if (d.id && d.start) {
      const node = simulation.byId.get(d.id)!;
      if (node.id !== scene.current.focusId) {
        const shift = screenToWorld(dx, dy, d.start, cam);
        node.fx = d.start.x + shift.x;
        node.fy = d.start.y + shift.y;
        node.fz = d.start.z + shift.z;
      }
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    requestFrame();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.mode === 'node' && d.id) {
      const node = simulation.byId.get(d.id)!;
      if (node.id !== scene.current.focusId) node.fx = node.fy = node.fz = null;
      simulation.alphaTarget = 0;
      if (!d.moved) onOpen(d.id);
    }
    if (d.mode !== 'orbit' || !d.moved) inertia.current = { yaw: 0, pitch: 0 };
    requestFrame();
  };

  const hovering = hovered ? scene.current.docs.get(hovered) : undefined;
  const hoveringNode = hovered ? simulation.byId.get(hovered) : undefined;
  const hubDocs = hubs
    .map((id) => scene.current.docs.get(id))
    .filter((d): d is WikiDocument => !!d);
  const HUB_LIST = 8;
  const surface = (
    <canvas
      ref={canvas}
      tabIndex={0}
      role="img"
      aria-label={`${focusId ? 'Local' : 'Wiki'} graph in 3D: ${visible.length} notes${
        hubDocs.length ? `, around ${hubDocs.map((d) => d.title).join(', ')}` : ''
      }. Drag to turn, Shift-drag to pan, scroll to zoom, arrow keys to turn.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (drag.current?.mode === 'node') simulation.alphaTarget = 0;
        drag.current = null;
      }}
      onPointerLeave={() => {
        if (!drag.current) setHover(null);
      }}
      onDoubleClick={(e) => {
        if (!hitTest(e.clientX, e.clientY)) refit();
      }}
      onKeyDown={(e) => {
        const cam = camera.current;
        const turn: Record<string, () => void> = {
          ArrowLeft: () => (cam.yaw -= 0.12),
          ArrowRight: () => (cam.yaw += 0.12),
          ArrowUp: () => (cam.pitch = Math.max(-1.45, cam.pitch - 0.12)),
          ArrowDown: () => (cam.pitch = Math.min(1.45, cam.pitch + 0.12)),
          '+': () => zoomBy(1.2),
          '=': () => zoomBy(1.2),
          '-': () => zoomBy(1 / 1.2),
          '0': refit,
        };
        if (e.metaKey || e.ctrlKey || e.altKey || !turn[e.key]) return;
        e.preventDefault();
        touch();
        turn[e.key]();
        requestFrame();
      }}
    />
  );

  return (
    <div className={`graph-canvas graph-3d ${className}`} ref={container}>
      {/* The menu wrapper stays mounted so the canvas keeps its size and context. */}
      {visible.length ? (
        <DocumentContextMenu doc={menuDoc ?? visible[0]} disabled={!menuDoc}>
          {surface}
        </DocumentContextMenu>
      ) : (
        surface
      )}
      <div
        ref={tooltip}
        className={`graph-tooltip ${hovering && pointerHover && !drag.current ? 'visible' : ''}`}
        aria-hidden="true"
      >
        {hovering && (
          <>
            <strong>{hovering.title}</strong>
            <span>
              {hovering.category} · {hoveringNode?.degree ?? 0} link
              {hoveringNode?.degree === 1 ? '' : 's'}
              {hoveringNode?.role === 'core'
                ? ' · core'
                : hoveringNode?.role === 'hub'
                  ? ' · central note'
                  : ''}
            </span>
          </>
        )}
      </div>
      {!visible.length && <div className="graph-empty">Create a note to start your graph.</div>}
      {hubDocs.length > 0 && (
        <nav className="graph-hubs" style={{ top: insetTop + 12 }} aria-label="Central notes">
          <span>Central notes</span>
          {hubDocs.slice(0, HUB_LIST).map((doc, i) => (
            <button
              key={doc.id}
              className={i === 0 ? 'core' : ''}
              onMouseEnter={() => setHover(doc.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(doc.id)}
              onBlur={() => setHover(null)}
              onClick={() => onOpen(doc.id)}
            >
              <b className={`graph-color-${scene.current.color.get(doc.id) ?? 0}`} />
              {doc.title.split('/').at(-1)}
            </button>
          ))}
          {hubDocs.length > HUB_LIST && (
            <small>+{hubDocs.length - HUB_LIST} more central notes</small>
          )}
        </nav>
      )}
      <GraphLegend categories={categories} />
      <div className="graph-controls">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.25)}
        >
          <Minus />
        </Button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus />
        </Button>
        <span className="graph-controls-divider" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit graph to view"
          title="Fit to view"
          onClick={refit}
        >
          <Focus />
        </Button>
        <Button
          variant={rotate ? 'soft' : 'ghost'}
          size="icon-sm"
          aria-label={rotate ? 'Stop turning the graph' : 'Turn the graph slowly'}
          aria-pressed={rotate}
          title="Turn slowly while idle"
          onClick={() => {
            onRotate?.(!rotate);
            requestFrame();
          }}
        >
          <Orbit />
        </Button>
        <Button
          variant={panel ? 'soft' : 'ghost'}
          size="icon-sm"
          aria-label="Graph forces"
          aria-expanded={panel}
          title="Forces"
          onClick={() => setPanel(!panel)}
        >
          <SlidersHorizontal />
        </Button>
        {modeToggle}
      </div>
      {panel && (
        <ForcesPanel
          forces={localForces}
          onChange={updateForces}
          onClose={() => setPanel(false)}
          onRelayout={() => {
            positions.current.clear();
            userMoved.current = false;
            setLayoutVersion((v) => v + 1);
          }}
        />
      )}
      <div className="graph-hint">Drag to turn · Shift-drag to pan · scroll to zoom</div>
    </div>
  );
}
