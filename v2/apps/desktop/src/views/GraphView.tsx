import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Focus, Minus, Network, Plus, Search } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { documentHref, type WikiLinks } from '../wiki/links';
import { DocumentContextMenu } from '../components/DocumentMenu';

type Point = { x: number; y: number };
type Camera = Point & { scale: number };
function zoomCamera(camera: Camera, value: number): Camera {
  const scale = Math.max(0.45, Math.min(2.5, value));
  return {
    scale,
    x: 480 - ((480 - camera.x) * scale) / camera.scale,
    y: 310 - ((310 - camera.y) * scale) / camera.scale,
  };
}

function layout(documents: WikiDocument[], links: WikiLinks['edges'], focusId?: string) {
  const points = new Map<string, Point>();
  const center =
    focusId ??
    [...documents].sort(
      (a, b) =>
        links.filter((e) => e.source === b.id || e.target === b.id).length -
        links.filter((e) => e.source === a.id || e.target === a.id).length,
    )[0]?.id;
  const outer = documents.filter((d) => d.id !== center);
  if (center) points.set(center, { x: 480, y: 310 });
  outer.forEach((doc, i) =>
    points.set(doc.id, {
      x: 480 + Math.cos((i / outer.length) * Math.PI * 2 - Math.PI / 2) * 325,
      y: 310 + Math.sin((i / outer.length) * Math.PI * 2 - Math.PI / 2) * 220,
    }),
  );
  // A bounded deterministic layout keeps a small local workspace stable between visits.
  for (let iteration = 0; iteration < 100; iteration++) {
    const forces = new Map(documents.map((d) => [d.id, { x: 0, y: 0 }]));
    for (let i = 0; i < documents.length; i++)
      for (let j = i + 1; j < documents.length; j++) {
        const a = points.get(documents[i].id)!;
        const b = points.get(documents[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(20, Math.hypot(dx, dy));
        const strength = 15000 / (distance * distance);
        const fa = forces.get(documents[i].id)!;
        const fb = forces.get(documents[j].id)!;
        fa.x += (dx / distance) * strength;
        fa.y += (dy / distance) * strength;
        fb.x -= (dx / distance) * strength;
        fb.y -= (dy / distance) * strength;
      }
    for (const edge of links) {
      const a = points.get(edge.source);
      const b = points.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 210) * 0.003;
      forces.get(edge.source)!.x += (dx / distance) * strength;
      forces.get(edge.source)!.y += (dy / distance) * strength;
      forces.get(edge.target)!.x -= (dx / distance) * strength;
      forces.get(edge.target)!.y -= (dy / distance) * strength;
    }
    for (const doc of documents) {
      if (doc.id === center) continue;
      const p = points.get(doc.id)!;
      const f = forces.get(doc.id)!;
      p.x = Math.max(115, Math.min(845, p.x + f.x + (480 - p.x) * 0.0005));
      p.y = Math.max(70, Math.min(535, p.y + f.y + (300 - p.y) * 0.0005));
    }
  }
  return points;
}

export function GraphView({
  documents,
  links,
  focusId,
  onOpen,
  onGlobal,
}: {
  documents: WikiDocument[];
  links: WikiLinks;
  focusId?: string;
  onOpen: (id: string) => void;
  onGlobal: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [moved, setMoved] = useState<Record<string, Point>>({});
  const canvas = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id?: string; x: number; y: number; initial: Point; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  useEffect(() => {
    const element = canvas.current;
    const onWheel = (event: WheelEvent) => {
      // Own the entire canvas, including overlays and zoom limits. React's
      // delegated wheel listener is passive and cannot stop page scrolling.
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      if (delta)
        setCamera((current) => zoomCamera(current, current.scale * Math.exp(-delta * 0.002)));
    };
    element?.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => element?.removeEventListener('wheel', onWheel, true);
  }, []);
  const focus = documents.find((d) => d.id === focusId);
  const neighbors = new Set(
    focus
      ? [
          focus.id,
          ...links.edges
            .filter((e) => e.source === focus.id || e.target === focus.id)
            .flatMap((e) => [e.source, e.target]),
        ]
      : documents.map((d) => d.id),
  );
  const visible = documents.filter((d) => neighbors.has(d.id));
  const edges = links.edges.filter((e) => neighbors.has(e.source) && neighbors.has(e.target));
  const paired = new Map<string, WikiLinks['edges'][number]>();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(':');
    if (!paired.has(key) || edge.kind === 'link') paired.set(key, edge);
  }
  const displayEdges = [...paired.values()];
  const coordinates = useMemo(() => layout(visible, edges, focus?.id), [documents, links, focusId]);
  const point = (id: string) => moved[id] || coordinates.get(id)!;
  const categories = [...new Set(documents.map((d) => d.category))];
  const matches = visible.filter((d) =>
    `${d.title} ${d.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const nearHovered = new Set([
    hovered,
    ...edges
      .filter((e) => e.source === hovered || e.target === hovered)
      .flatMap((e) => [e.source, e.target]),
  ]);
  const zoom = (value: number) => setCamera((current) => zoomCamera(current, value));
  const position = (clientX: number, clientY: number) => {
    const bounds = svg.current!.getBoundingClientRect();
    const scale = Math.min(bounds.width / 960, bounds.height / 620);
    return {
      x: (clientX - bounds.left - (bounds.width - 960 * scale) / 2) / scale,
      y: (clientY - bounds.top - (bounds.height - 620 * scale) / 2) / scale,
    };
  };
  return (
    <div className="graph-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">KNOWLEDGE IS A NETWORK</div>
          <h1>{focus ? 'Around this note' : 'The connections'}</h1>
          <p>{focus ? focus.title : 'Follow a link. Find a new way into your knowledge.'}</p>
        </div>
        {focus && (
          <Button variant="outline" onClick={onGlobal}>
            <Network />
            All notes
          </Button>
        )}
      </div>
      <div className="graph-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Find in graph"
            placeholder="Find a note in the graph…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span>
          {visible.length} notes · {displayEdges.length} connections
        </span>
      </div>
      <div className="graph-canvas" ref={canvas}>
        <svg
          ref={svg}
          viewBox="0 0 960 620"
          role="group"
          aria-label="Wiki document graph"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const p = position(e.clientX, e.clientY);
            drag.current = { ...p, initial: camera, moved: false };
            suppressClick.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = position(e.clientX, e.clientY);
            const dx = p.x - d.x;
            const dy = p.y - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            if (d.id)
              setMoved((current) => ({
                ...current,
                [d.id!]: { x: d.initial.x + dx / camera.scale, y: d.initial.y + dy / camera.scale },
              }));
            else setCamera((c) => ({ ...c, x: d.initial.x + dx, y: d.initial.y + dy }));
          }}
          onPointerUp={(e) => {
            suppressClick.current = drag.current?.moved ?? false;
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            suppressClick.current = true;
          }}
        >
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            {displayEdges.map((edge) => {
              const a = point(edge.source);
              const b = point(edge.target);
              return (
                <line
                  key={`${edge.source}:${edge.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`graph-edge ${edge.kind} ${hovered && (edge.source === hovered || edge.target === hovered) ? 'highlighted' : ''}`}
                />
              );
            })}
            {visible.map((doc) => {
              const p = point(doc.id);
              const count = edges.filter((e) => e.source === doc.id || e.target === doc.id).length;
              const dim = query ? !matches.includes(doc) : hovered && !nearHovered.has(doc.id);
              return (
                <g
                  key={doc.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className={`graph-node graph-color-${categories.indexOf(doc.category) % 4} ${dim ? 'dimmed' : ''} ${focus?.id === doc.id ? 'focused' : ''}`}
                >
                  <DocumentContextMenu doc={doc}>
                    <a
                      href={documentHref(doc.id)}
                      aria-label={`Open ${doc.title}`}
                      onClick={(e) => {
                        if (suppressClick.current) {
                          e.preventDefault();
                          suppressClick.current = false;
                          return;
                        }
                        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                          e.preventDefault();
                          onOpen(doc.id);
                        }
                      }}
                      onFocus={() => setHovered(doc.id)}
                      onBlur={() => setHovered(null)}
                      onMouseEnter={() => setHovered(doc.id)}
                      onMouseLeave={() => setHovered(null)}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        const start = position(e.clientX, e.clientY);
                        drag.current = { ...start, id: doc.id, initial: p, moved: false };
                        suppressClick.current = false;
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                    >
                      <title>
                        {doc.title} · {count} connections. Click to open; drag to arrange.
                      </title>
                      <circle className="node-halo" r={29 + Math.min(10, count)} />
                      <circle r={12 + Math.min(7, count)} />
                      <text y={43} textAnchor="middle">
                        {doc.title.length > 31 ? `${doc.title.slice(0, 29)}…` : doc.title}
                      </text>
                      <text y={60} textAnchor="middle" className="node-category">
                        {doc.category}
                      </text>
                    </a>
                  </DocumentContextMenu>
                </g>
              );
            })}
          </g>
        </svg>
        {!visible.length && <div className="graph-empty">Create a note to start your graph.</div>}
        <div className="graph-controls">
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() => zoom(camera.scale / 1.2)}
          >
            <Minus />
          </Button>
          <span>{Math.round(camera.scale * 100)}%</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() => zoom(camera.scale * 1.2)}
          >
            <Plus />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Reset graph view"
            onClick={() => {
              setCamera({ x: 0, y: 0, scale: 1 });
              setMoved({});
            }}
          >
            <Focus />
          </Button>
        </div>
        <div className="graph-hint">Drag to explore · scroll to zoom · select a note to open</div>
      </div>
      <div className="graph-legend">
        <span>
          <i />
          Body link
        </span>
        <span>
          <i className="dashed" />
          Related note
        </span>
        {categories.map((category, i) => (
          <span key={category}>
            <b className={`graph-color-${i % 4}`} />
            {category}
          </span>
        ))}
      </div>
      <div className="graph-note-list">
        <div className="section-heading">
          <h2>{query ? 'Matching notes' : 'Explore the notes'}</h2>
          <span>{matches.length}</span>
        </div>
        {!matches.length && <p className="muted">No notes match this search.</p>}
        {matches.map((doc) => (
          <DocumentContextMenu doc={doc} key={doc.id}>
            <a
              key={doc.id}
              href={documentHref(doc.id)}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  onOpen(doc.id);
                }
              }}
            >
              <span>{doc.title}</span>
              <small>{doc.category}</small>
              <ArrowUpRight size={14} />
            </a>
          </DocumentContextMenu>
        ))}
      </div>
    </div>
  );
}
