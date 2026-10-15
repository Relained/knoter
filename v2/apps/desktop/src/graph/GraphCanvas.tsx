import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Focus, Minus, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { DocumentContextMenu } from '../components/DocumentMenu';
import { documentHref, type WikiEdge } from '../wiki/links';
import { defaultForces, ForceSimulation } from './simulation';

type Camera = { x: number; y: number; k: number };
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 4;
const LABEL_ZOOM = 0.55;
const PALETTE_SIZE = 8;
const clampZoom = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Notes within `depth` links of the focus, or every note without a focus. */
function neighborhood(ids: string[], edges: WikiEdge[], focusId?: string, depth = 1) {
  if (!focusId || !ids.includes(focusId)) return new Set(ids);
  const adjacent = new Map<string, string[]>();
  for (const e of edges) {
    adjacent.set(e.source, [...(adjacent.get(e.source) ?? []), e.target]);
    adjacent.set(e.target, [...(adjacent.get(e.target) ?? []), e.source]);
  }
  const seen = new Set([focusId]);
  let frontier = [focusId];
  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const other of adjacent.get(id) ?? [])
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
    frontier = next;
  }
  return seen;
}

const forceLabels: { key: keyof GraphForces; label: string; min: number; max: number }[] = [
  { key: 'center', label: 'Center force', min: 0, max: 3 },
  { key: 'repel', label: 'Repel force', min: 0, max: 3 },
  { key: 'link', label: 'Link force', min: 0, max: 3 },
  { key: 'distance', label: 'Link distance', min: 0.3, max: 3 },
];

interface NodeProps {
  doc: WikiDocument;
  color: number;
  radius: number;
  degree: number;
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
          <circle className="node-dot" r={radius} />
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
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const userMoved = useRef(false);
  const frame = useRef<number | null>(null);
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
  const [localForces, setLocalForces] = useState(forces);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const appliedForces = useRef(JSON.stringify(forces));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshots arrive as new objects; only a changed value replaces the local forces.
  const forcesKey = JSON.stringify(forces);
  useEffect(() => setLocalForces(JSON.parse(forcesKey)), [forcesKey]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const ids = useMemo(() => documents.map((d) => d.id), [documents]);
  const visibleIds = useMemo(
    () => neighborhood(ids, allEdges, focusId, depth),
    [ids, allEdges, focusId, depth],
  );
  const visible = useMemo(
    () => documents.filter((d) => visibleIds.has(d.id)),
    [documents, visibleIds],
  );
  // One line per pair of notes; a body link wins over a related-note hint.
  const edges = useMemo(() => {
    const paired = new Map<string, WikiEdge>();
    for (const e of allEdges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const key = pairKey(e.source, e.target);
      if (!paired.has(key) || e.kind === 'link') paired.set(key, e);
    }
    return [...paired.values()];
  }, [allEdges, visibleIds]);
  const structure = `${visible.map((d) => d.id).join(',')}|${edges.map((e) => pairKey(e.source, e.target)).join(',')}`;

  const simulation = useMemo(() => {
    const known = positions.current;
    const sim = ForceSimulation.create(
      visible.map((d) => d.id),
      edges,
      localForces,
      known,
      new Map(visible.map((d) => [d.id, d.title.split('/').at(-1)!])),
    );
    const focusNode = focusId ? sim.byId.get(focusId) : undefined;
    if (focusNode) Object.assign(focusNode, { x: 0, y: 0, fx: 0, fy: 0 });
    const reused = sim.nodes.filter((n) => known.has(n.id)).length;
    if (reused > sim.nodes.length * 0.8) sim.alpha = 0.3;
    else sim.warm(400, Math.min(160, 30 + sim.nodes.length / 4));
    return sim;
    // localForces apply through setForces below; a rebuild is only for structure.
  }, [structure, focusId, layoutVersion]);

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
    setZoom((current) => (Math.abs(current - k) > 0.004 ? k : current));
  }, []);

  const paint = useCallback(() => {
    for (const n of simulation.nodes) {
      positions.current.set(n.id, { x: n.x, y: n.y });
      nodeElements.current.get(n.id)?.setAttribute('transform', `translate(${n.x} ${n.y})`);
    }
    for (const link of simulation.links) {
      const line = edgeElements.current.get(pairKey(link.source.id, link.target.id));
      if (!line) continue;
      line.setAttribute('x1', String(link.source.x));
      line.setAttribute('y1', String(link.source.y));
      line.setAttribute('x2', String(link.target.x));
      line.setAttribute('y2', String(link.target.y));
    }
  }, [simulation]);

  const fit = useCallback(
    (animate = false) => {
      const box = container.current;
      if (!box || !simulation.nodes.length) return;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of simulation.nodes) {
        x0 = Math.min(x0, n.x - n.radius);
        x1 = Math.max(x1, n.x + n.radius);
        y0 = Math.min(y0, n.y - n.radius);
        y1 = Math.max(y1, n.y + n.radius + 22);
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
      camera.current = {
        k,
        x: width / 2 - ((x0 + x1) / 2) * k,
        y: insetTop + height / 2 - ((y0 + y1) / 2) * k,
      };
      applyCamera(animate);
    },
    [simulation, applyCamera, insetTop],
  );

  const run = useCallback(() => {
    if (frame.current !== null) return;
    const step = () => {
      // Two ticks per frame keep large graphs moving without long frames.
      simulation.tick();
      if (!simulation.settled) simulation.tick();
      paint();
      if (simulation.settled) {
        frame.current = null;
        if (!userMoved.current) fit(true);
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [simulation, paint, fit]);

  useLayoutEffect(() => {
    paint();
    if (!userMoved.current) fit();
    if (!simulation.settled) run();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [simulation, paint, fit, run]);

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
    const observer = new ResizeObserver(() => {
      if (!userMoved.current) fit();
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
  const worldPoint = (clientX: number, clientY: number) => {
    const bounds = container.current!.getBoundingClientRect();
    const { x, y, k } = camera.current;
    return { x: (clientX - bounds.left - x) / k, y: (clientY - bounds.top - y) / k };
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

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      map.set(e.source, (map.get(e.source) ?? new Set()).add(e.target));
      map.set(e.target, (map.get(e.target) ?? new Set()).add(e.source));
    }
    return map;
  }, [edges]);
  const categories = useMemo(
    () => [...new Set(documents.map((d) => d.category))].sort((a, b) => a.localeCompare(b)),
    [documents],
  );
  const needle = query.trim().toLocaleLowerCase();
  const matches = useMemo(
    () =>
      new Set(
        needle
          ? visible
              .filter((d) =>
                `${d.title} ${d.category} ${(d.tags ?? []).join(' ')}`
                  .toLocaleLowerCase()
                  .includes(needle),
              )
              .map((d) => d.id)
          : [],
      ),
    [visible, needle],
  );
  // The best-connected notes keep their labels when zoomed out, like map capitals.
  const hubs = useMemo(() => {
    const ranked = simulation.nodes.filter((n) => n.degree > 1).sort((a, b) => b.degree - a.degree);
    return new Set(
      ranked.slice(0, Math.min(10, Math.max(3, Math.ceil(ranked.length * 0.03)))).map((n) => n.id),
    );
  }, [simulation]);
  const near = hovered ? (neighbors.get(hovered) ?? new Set<string>()) : null;

  const updateForces = (next: GraphForces) => {
    setLocalForces(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onForces?.(next), 400);
  };

  return (
    <div className={`graph-canvas ${className}`} ref={container}>
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
            if (d.id) {
              simulation.alphaTarget = 0.25;
              simulation.reheat(0.25);
              run();
            }
          }
          if (!d.moved) return;
          if (d.id) {
            const node = simulation.byId.get(d.id);
            if (node && node.id !== focusId) {
              const p = worldPoint(e.clientX, e.clientY);
              node.fx = p.x;
              node.fy = p.y;
            }
          } else {
            userMoved.current = true;
            camera.current = { ...d.camera, x: d.camera.x + dx, y: d.camera.y + dy };
            applyCamera();
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          suppressClick.current = d?.moved ?? false;
          if (d?.id && d.id !== focusId) {
            const node = simulation.byId.get(d.id);
            if (node) node.fx = node.fy = null;
            simulation.alphaTarget = 0;
          }
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current?.id) simulation.alphaTarget = 0;
          drag.current = null;
          suppressClick.current = true;
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
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                ref={(element) => {
                  if (element) edgeElements.current.set(key, element);
                  else edgeElements.current.delete(key);
                }}
                className={`graph-edge ${edge.kind} ${active ? 'highlighted' : hovered ? 'faded' : ''}`}
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
              : needle
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
                x={node.x}
                y={node.y}
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
      {categories.length > 0 && (
        <div className="graph-legend" aria-label="Collections">
          {categories.slice(0, PALETTE_SIZE).map((category, i) => (
            <span key={category}>
              <b className={`graph-color-${i}`} />
              {category}
            </span>
          ))}
          {categories.length > PALETTE_SIZE && <span>+{categories.length - PALETTE_SIZE}</span>}
        </div>
      )}
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
        <div className="graph-forces" role="group" aria-label="Graph forces">
          <div className="graph-forces-heading">
            <strong>Forces</strong>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close forces"
              onClick={() => setPanel(false)}
            >
              <X />
            </Button>
          </div>
          {forceLabels.map((item) => (
            <label key={item.key}>
              <span>
                {item.label}
                <small>{localForces[item.key].toFixed(2)}</small>
              </span>
              <input
                type="range"
                min={item.min}
                max={item.max}
                step={0.05}
                value={localForces[item.key]}
                onChange={(e) =>
                  updateForces({ ...localForces, [item.key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <div className="graph-forces-actions">
            <Button variant="ghost" size="xs" onClick={() => updateForces(defaultForces)}>
              Reset forces
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                positions.current.clear();
                userMoved.current = false;
                setLayoutVersion((v) => v + 1);
              }}
            >
              <RotateCcw />
              Re-layout
            </Button>
          </div>
        </div>
      )}
      <div className="graph-hint">Drag to pan · scroll to zoom · drag a note to arrange</div>
    </div>
  );
}
