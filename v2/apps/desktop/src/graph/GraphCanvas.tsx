import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Focus, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { DocumentContextMenu } from '../components/DocumentMenu';
import { documentHref, type WikiEdge } from '../wiki/links';
import { defaultForces, ForceSimulation, type SimNode } from './simulation';
import {
  CentralNotes,
  ForcesPanel,
  GraphLegend,
  PALETTE_SIZE,
  pairKey,
  useGraphData,
  useGraphForces,
} from './shared';

type Camera = { x: number; y: number; k: number };
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 4;
const LABEL_ZOOM = 0.55;
/** A new layout unfolds from this share of its size to full size over `UNFOLD_MS`. */
const UNFOLD_FROM = 0.2;
const UNFOLD_MS = 1100;
/** A new layout counts as built, and the camera frames it, once it has cooled this far. */
const BUILT_ALPHA = 0.04;
const clampZoom = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** When a note appears in a new layout: the central notes first, then ring by ring. */
function enterDelay(node: SimNode) {
  if (node.role === 'core') return 0;
  if (node.role === 'hub') return 90;
  if (node.role === 'member') return Math.min(560, 90 + node.hops * 120);
  return 660;
}

/**
 * Layouts and cameras outlive the view, so a graph the user returns to is shown as it was
 * left instead of being built again: one entry for the whole wiki and one per focus note.
 */
interface SavedLayout {
  positions: Map<string, { x: number; y: number }>;
  camera: Camera;
  userMoved: boolean;
  /** The structure the positions settled for, if they did. */
  settled: string | null;
  /** Notes that joined and were still settling in, which a remount keeps settling. */
  settling: string[];
}
const savedLayouts = new Map<string, SavedLayout>();
const MAX_SAVED_LAYOUTS = 12;

interface NodeProps {
  doc: WikiDocument;
  color: number;
  radius: number;
  degree: number;
  /** Delay before the note appears while a new layout is built, in milliseconds. */
  enter: number;
  state: '' | 'dimmed' | 'near' | 'active';
  focused: boolean;
  pinned: boolean;
  x: number;
  y: number;
  register: (id: string, element: SVGGElement | null) => void;
  onPointerDown: (id: string, event: PointerEvent) => void;
  onHover: (id: string | null) => void;
  onActivate: (id: string, event: MouseEvent) => void;
}
const GraphNode = memo(function GraphNode({
  doc,
  color,
  radius,
  degree,
  enter,
  state,
  focused,
  pinned,
  x,
  y,
  register,
  onPointerDown,
  onHover,
  onActivate,
}: NodeProps) {
  const label = doc.title.split('/').at(-1)!;
  return (
    <g
      ref={(element) => register(doc.id, element)}
      transform={`translate(${x} ${y})`}
      className={`graph-node graph-color-${color} ${state} ${focused ? 'focused' : ''} ${pinned ? 'pinned' : ''}`}
      style={{ '--enter': `${enter}ms` } as CSSProperties}
    >
      <DocumentContextMenu doc={doc}>
        <a
          href={documentHref(doc.id)}
          aria-label={`Open ${doc.title}`}
          onClick={(e) => onActivate(doc.id, e)}
          onFocus={() => onHover(doc.id)}
          onBlur={() => onHover(null)}
          onMouseEnter={() => onHover(doc.id)}
          onMouseLeave={() => onHover(null)}
          onPointerDown={(e) => onPointerDown(doc.id, e)}
        >
          <title>
            {doc.title} · {degree} connection{degree === 1 ? '' : 's'}. Click to open; drag to
            arrange.
          </title>
          <circle className="node-halo" r={radius + 6} />
          <circle
            className="node-dot"
            r={radius}
            style={
              {
                '--node-r': `${radius}px`,
                // On screen a note never shrinks below this, central notes most of all.
                '--node-min': `${Math.min(10, 1.8 + Math.sqrt(degree) * 0.9)}px`,
              } as CSSProperties
            }
          />
          <text y={radius + 4} textAnchor="middle" dominantBaseline="hanging">
            {label.length > 34 ? `${label.slice(0, 32)}…` : label}
          </text>
        </a>
      </DocumentContextMenu>
    </g>
  );
});

export function GraphCanvas({
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
}) {
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const nodeElements = useRef(new Map<string, SVGGElement>());
  const edgeElements = useRef(new Map<string, SVGLineElement>());
  const layoutKey = focusId ?? '';
  const [saved] = useState(() => savedLayouts.get(layoutKey));
  const positions = useRef(saved?.positions ?? new Map<string, { x: number; y: number }>());
  const camera = useRef<Camera>(saved?.camera ?? { x: 0, y: 0, k: 1 });
  const userMoved = useRef(saved?.userMoved ?? false);
  const settledFor = useRef(saved?.settled ?? null);
  const settling = useRef(saved?.settling ?? []);
  const frame = useRef<number | null>(null);
  /** Drawn size of the layout while a new one unfolds (1 otherwise), and when it began. */
  const spread = useRef(1);
  const unfoldStart = useRef<number | null>(null);
  /** A new layout is still forming; the camera frames it once it has. */
  const building = useRef(false);
  const [entering, setEntering] = useState(false);
  const drag = useRef<{
    id?: string;
    pointerX: number;
    pointerY: number;
    camera: Camera;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [localForces, updateForces] = useGraphForces(forces, onForces);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const appliedForces = useRef(JSON.stringify(forces));
  const { visible, edges, structure, categories, matches, searching } = useGraphData(
    documents,
    allEdges,
    focusId,
    depth,
    query,
  );

  /**
   * `build` lays out a new graph, `update` adjusts a known one to added or removed notes,
   * and `restore` shows a graph as it was when the view was left.
   */
  const layout = useMemo(() => {
    const known = positions.current;
    const sim = ForceSimulation.create(
      visible.map((d) => d.id),
      edges,
      localForces,
      known,
      new Map(visible.map((d) => [d.id, d.title.split('/').at(-1)!])),
      focusId,
    );
    const reused = sim.nodes.filter((n) => known.has(n.id)).length;
    if (sim.nodes.length && reused === sim.nodes.length && settledFor.current === structure) {
      sim.alpha = 0;
      return { simulation: sim, mode: 'restore' as const };
    }
    if (reused > sim.nodes.length * 0.8) {
      sim.alpha = 0.3;
      // New notes settle in around their links; other changes let the whole layout adjust.
      const added = sim.nodes.filter((n) => !known.has(n.id) || settling.current.includes(n.id));
      if (added.length) sim.settleAround(added);
      return { simulation: sim, mode: 'update' as const, settling: added.map((n) => n.id) };
    }
    // Without motion the layout is computed before it is shown, as one still picture.
    // Otherwise a few unseen ticks grow the seed to about its final size, so the frame
    // chosen before the layout unfolds already fits it closely.
    if (reducedMotion()) sim.warm(400, Math.min(160, 30 + sim.nodes.length / 4));
    else sim.warm(30, 40);
    return { simulation: sim, mode: 'build' as const };
    // localForces apply through setForces below; a rebuild is only for structure.
  }, [structure, focusId, layoutVersion]);
  const simulation = layout.simulation;

  const applyCamera = useCallback((animate = false) => {
    const { x, y, k } = camera.current;
    const group = world.current;
    if (group) {
      group.style.transition = animate ? 'transform 0.35s ease' : '';
      group.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    }
    svg.current?.classList.toggle('labels-hidden', k < LABEL_ZOOM);
    // Pinned labels keep a readable size on screen while zoomed out.
    svg.current?.style.setProperty('--label-size', `${Math.max(11, 10 / k)}px`);
    svg.current?.style.setProperty('--zoom', String(k));
    setZoom((current) => (Math.abs(current - k) > 0.004 ? k : current));
  }, []);

  const paint = useCallback(() => {
    const s = spread.current;
    for (const n of simulation.nodes) {
      positions.current.set(n.id, { x: n.x, y: n.y });
      nodeElements.current.get(n.id)?.setAttribute('transform', `translate(${n.x * s} ${n.y * s})`);
    }
    for (const link of simulation.links) {
      const line = edgeElements.current.get(pairKey(link.source.id, link.target.id));
      if (!line) continue;
      line.setAttribute('x1', String(link.source.x * s));
      line.setAttribute('y1', String(link.source.y * s));
      line.setAttribute('x2', String(link.target.x * s));
      line.setAttribute('y2', String(link.target.y * s));
    }
  }, [simulation]);

  /**
   * Frame the layout as drawn. With `onlyIfChanged`, a camera already close to the frame
   * stays, so a layout that only settled a little further does not nudge the view.
   */
  const fit = useCallback(
    (animate = false, onlyIfChanged = false) => {
      const box = container.current;
      if (!box || !simulation.nodes.length) return;
      const s = spread.current;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of simulation.nodes) {
        x0 = Math.min(x0, n.x * s - n.radius);
        x1 = Math.max(x1, n.x * s + n.radius);
        y0 = Math.min(y0, n.y * s - n.radius);
        y1 = Math.max(y1, n.y * s + n.radius + 22);
      }
      const width = box.clientWidth;
      const height = box.clientHeight - insetTop;
      const margin = 48;
      const k = clampZoom(
        Math.min(
          1.2,
          (width - margin * 2) / Math.max(1, x1 - x0),
          (height - margin * 2) / Math.max(1, y1 - y0),
        ),
      );
      const next = {
        k,
        x: width / 2 - ((x0 + x1) / 2) * k,
        y: insetTop + height / 2 - ((y0 + y1) / 2) * k,
      };
      const current = camera.current;
      if (
        onlyIfChanged &&
        Math.abs(next.k / current.k - 1) < 0.06 &&
        Math.hypot(next.x - current.x, next.y - current.y) < Math.min(width, height) * 0.04
      )
        return;
      camera.current = next;
      applyCamera(animate);
    },
    [simulation, applyCamera, insetTop],
  );

  const finishBuild = useCallback(() => {
    if (!building.current) return;
    building.current = false;
    setEntering(false);
  }, []);

  const run = useCallback(() => {
    if (frame.current !== null) return;
    const step = (now: number) => {
      // Two ticks per frame keep large graphs moving without long frames.
      simulation.tick();
      if (!simulation.settled) simulation.tick();
      if (unfoldStart.current !== null) {
        const t = Math.min(1, (now - unfoldStart.current) / UNFOLD_MS);
        spread.current = UNFOLD_FROM + (1 - UNFOLD_FROM) * easeOut(t);
        if (t === 1) unfoldStart.current = null;
      }
      paint();
      // Build the graph first, then set the view: the camera frames a new layout only
      // once it has unfolded and cooled, not while its notes are still finding places.
      const unfolding = unfoldStart.current !== null;
      if (building.current && !unfolding && simulation.alpha < BUILT_ALPHA) {
        finishBuild();
        if (!userMoved.current) fit(true);
      }
      if (simulation.settled && !unfolding) {
        frame.current = null;
        finishBuild();
        settledFor.current = structure;
        settling.current = [];
        if (!userMoved.current) fit(true, true);
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [simulation, paint, fit, finishBuild, structure]);

  useLayoutEffect(() => {
    const unfold = layout.mode === 'build' && simulation.nodes.length > 1 && !reducedMotion();
    building.current = layout.mode === 'build';
    settledFor.current = layout.mode === 'restore' ? structure : null;
    settling.current = layout.mode === 'update' ? layout.settling : [];
    // A new layout is framed as seeded, at full size, and then unfolds into that frame;
    // a known one keeps the camera it had.
    spread.current = 1;
    if (layout.mode === 'build' && !userMoved.current) fit();
    else applyCamera();
    spread.current = unfold ? UNFOLD_FROM : 1;
    unfoldStart.current = unfold ? performance.now() : null;
    setEntering(unfold);
    paint();
    if (!simulation.settled || unfold) run();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [layout]);

  useEffect(
    () => () => {
      savedLayouts.delete(layoutKey);
      savedLayouts.set(layoutKey, {
        positions: positions.current,
        camera: camera.current,
        userMoved: userMoved.current,
        settled: settledFor.current,
        settling: settling.current,
      });
      if (savedLayouts.size > MAX_SAVED_LAYOUTS)
        savedLayouts.delete(savedLayouts.keys().next().value!);
    },
    [layoutKey],
  );

  useEffect(() => {
    const key = JSON.stringify(localForces);
    if (key === appliedForces.current) return;
    appliedForces.current = key;
    simulation.setForces(localForces);
    simulation.reheat(0.5);
    run();
  }, [localForces, simulation, run]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // Refit when the canvas changes size, not on the observer's first call, and not while a
    // new layout forms: it is framed once built.
    let size = `${element.clientWidth}x${element.clientHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${element.clientWidth}x${element.clientHeight}`;
      if (next === size) return;
      size = next;
      if (!userMoved.current && !building.current) fit();
    });
    observer.observe(element);
    // Own wheel events across the canvas and its overlays: React's delegated wheel
    // listener is passive and cannot stop the page from scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      if (!delta) return;
      const bounds = element.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      const { x, y, k } = camera.current;
      const next = clampZoom(k * Math.exp(-delta * 0.002));
      camera.current = { k: next, x: px - ((px - x) * next) / k, y: py - ((py - y) * next) / k };
      userMoved.current = true;
      applyCamera();
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', onWheel, true);
    };
  }, [fit, applyCamera]);

  const zoomBy = (factor: number) => {
    const box = container.current!;
    const px = box.clientWidth / 2;
    const py = box.clientHeight / 2;
    const { x, y, k } = camera.current;
    const next = clampZoom(k * factor);
    camera.current = { k: next, x: px - ((px - x) * next) / k, y: py - ((py - y) * next) / k };
    userMoved.current = true;
    applyCamera(true);
  };
  /** The layout point under the pointer, allowing for a layout that is still unfolding. */
  const worldPoint = (clientX: number, clientY: number) => {
    const bounds = container.current!.getBoundingClientRect();
    const { x, y, k } = camera.current;
    const s = spread.current;
    return { x: (clientX - bounds.left - x) / k / s, y: (clientY - bounds.top - y) / k / s };
  };

  const register = useCallback((id: string, element: SVGGElement | null) => {
    if (element) nodeElements.current.set(id, element);
    else nodeElements.current.delete(id);
  }, []);
  const onNodePointerDown = useCallback((id: string, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = {
      id,
      pointerX: e.clientX,
      pointerY: e.clientY,
      camera: camera.current,
      moved: false,
    };
    suppressClick.current = false;
    // Capture on the link so the click still reaches it; moves bubble to the canvas.
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);
  const onActivate = useCallback(
    (id: string, e: MouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        suppressClick.current = false;
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpen(id);
      }
    },
    [onOpen],
  );
  const onHover = useCallback((id: string | null) => {
    if (!drag.current?.id) setHovered(id);
  }, []);
  /** Let go of a dragged note; the focus of a local graph stays where it was dropped. */
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    const node = d?.id && d.moved ? simulation.byId.get(d.id) : undefined;
    if (node) simulation.drop(node, node.id === focusId);
  };

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      map.set(e.source, (map.get(e.source) ?? new Set()).add(e.target));
      map.set(e.target, (map.get(e.target) ?? new Set()).add(e.source));
    }
    return map;
  }, [edges]);
  // Central notes keep their labels when zoomed out, like map capitals.
  const hubs = useMemo(() => new Set(simulation.structure.hubs), [simulation]);
  const hubDocs = simulation.structure.hubs
    .map((id) => visible.find((d) => d.id === id))
    .filter((d): d is WikiDocument => !!d);
  const near = hovered ? (neighbors.get(hovered) ?? new Set<string>()) : null;
  // Rendering draws the layout as currently scaled; animation frames update it directly.
  const s = spread.current;

  return (
    <div
      className={`graph-canvas ${entering ? 'graph-entering' : ''} ${className}`}
      ref={container}
    >
      <svg
        ref={svg}
        role="group"
        aria-label={focusId ? 'Local graph of this note' : 'Wiki graph'}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            camera: camera.current,
            moved: false,
          };
          suppressClick.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.pointerX;
          const dy = e.clientY - d.pointerY;
          if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
            d.moved = true;
            // Arranging notes makes the view the user's: no automatic framing after it.
            if (d.id) {
              userMoved.current = true;
              finishBuild();
            }
          }
          if (!d.moved) return;
          if (d.id) {
            const node = simulation.byId.get(d.id);
            if (node) {
              const p = worldPoint(e.clientX, e.clientY);
              simulation.grab(node, p.x, p.y);
              run();
            }
          } else {
            userMoved.current = true;
            camera.current = { ...d.camera, x: d.camera.x + dx, y: d.camera.y + dy };
            applyCamera();
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          endDrag();
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          // Only a dragged note swallows the click that follows; a pan lands on the canvas.
          suppressClick.current = !!(d?.id && d.moved);
        }}
        onPointerCancel={() => {
          const d = drag.current;
          endDrag();
          suppressClick.current = !!(d?.id && d.moved);
        }}
      >
        <g ref={world} className="graph-world">
          {edges.map((edge) => {
            const key = pairKey(edge.source, edge.target);
            const active = hovered && (edge.source === hovered || edge.target === hovered);
            const a = simulation.byId.get(edge.source)!;
            const b = simulation.byId.get(edge.target)!;
            return (
              <line
                key={key}
                x1={a.x * s}
                y1={a.y * s}
                x2={b.x * s}
                y2={b.y * s}
                ref={(element) => {
                  if (element) edgeElements.current.set(key, element);
                  else edgeElements.current.delete(key);
                }}
                className={`graph-edge ${edge.kind} ${active ? 'highlighted' : hovered ? 'faded' : ''}`}
                // A link appears once both of its notes have.
                style={
                  { '--enter': `${Math.max(enterDelay(a), enterDelay(b)) + 80}ms` } as CSSProperties
                }
              />
            );
          })}
          {visible.map((doc) => {
            const node = simulation.byId.get(doc.id)!;
            const isMatch = matches.has(doc.id);
            const state = hovered
              ? doc.id === hovered
                ? 'active'
                : near?.has(doc.id)
                  ? 'near'
                  : 'dimmed'
              : searching
                ? isMatch
                  ? 'active'
                  : 'dimmed'
                : '';
            return (
              <GraphNode
                key={doc.id}
                doc={doc}
                color={Math.max(0, categories.indexOf(doc.category)) % PALETTE_SIZE}
                radius={node.radius}
                degree={node.degree}
                enter={enterDelay(node)}
                x={node.x * s}
                y={node.y * s}
                state={state}
                focused={doc.id === focusId}
                pinned={
                  hubs.has(doc.id) || doc.id === focusId || state === 'active' || state === 'near'
                }
                register={register}
                onPointerDown={onNodePointerDown}
                onHover={onHover}
                onActivate={onActivate}
              />
            );
          })}
        </g>
      </svg>
      {!visible.length && <div className="graph-empty">Create a note to start your graph.</div>}
      <CentralNotes
        notes={hubDocs}
        colorOf={(doc) => Math.max(0, categories.indexOf(doc.category)) % PALETTE_SIZE}
        top={insetTop + 12}
        onHover={setHovered}
        onOpen={onOpen}
      />
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
          onClick={() => {
            userMoved.current = false;
            fit(true);
          }}
        >
          <Focus />
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
      </div>
      {panel && (
        <ForcesPanel
          forces={localForces}
          onChange={updateForces}
          onClose={() => setPanel(false)}
          onRelayout={() => {
            positions.current.clear();
            userMoved.current = false;
            settledFor.current = null;
            setLayoutVersion((v) => v + 1);
          }}
        />
      )}
      <div className="graph-hint">Drag to pan · scroll to zoom · drag a note to arrange</div>
    </div>
  );
}
