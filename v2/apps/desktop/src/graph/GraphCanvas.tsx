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
import { defaultForces, ForceSimulation } from './simulation';
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
const clampZoom = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));

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

  const simulation = useMemo(() => {
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
    svg.current?.style.setProperty('--zoom', String(k));
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
  // Central notes keep their labels when zoomed out, like map capitals.
  const hubs = useMemo(() => new Set(simulation.structure.hubs), [simulation]);
  const hubDocs = simulation.structure.hubs
    .map((id) => visible.find((d) => d.id === id))
    .filter((d): d is WikiDocument => !!d);
  const near = hovered ? (neighbors.get(hovered) ?? new Set<string>()) : null;

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
            setLayoutVersion((v) => v + 1);
          }}
        />
      )}
      <div className="graph-hint">Drag to pan · scroll to zoom · drag a note to arrange</div>
    </div>
  );
}
