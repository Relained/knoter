import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces, GraphLinks } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import type { WikiEdge } from '../wiki/links';
import { defaultForces } from './simulation';

export const PALETTE_SIZE = 8;
const LEGEND_SIZE = 12;
/**
 * A collection's color: the eight theme colors first, then evenly spaced hues at the
 * theme's lightness, so further collections stay distinguishable.
 */
export const graphColor = (index: number) =>
  index < PALETTE_SIZE
    ? `var(--graph-${index})`
    : `oklch(var(--graph-extra-l) 0.09 ${Math.round((index * 137.5 + 25) % 360)})`;
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const allLinkKinds: GraphLinks = { semantic: true, word: true };

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

/**
 * The notes and links a graph view draws, plus a key that changes only when that
 * structure does: snapshots replace every object every few seconds. A link kind that is
 * switched off is left out before anything else, so it neither shapes the layout nor
 * counts toward a focus note's neighborhood.
 */
export function useGraphData(
  documents: WikiDocument[],
  everyEdge: WikiEdge[],
  focusId?: string,
  depth = 1,
  query = '',
  kinds: GraphLinks = allLinkKinds,
) {
  const ids = useMemo(() => documents.map((d) => d.id), [documents]);
  const allEdges = useMemo(
    () =>
      kinds.semantic && kinds.word
        ? everyEdge
        : everyEdge.filter((e) => (e.kind === 'word' ? kinds.word : kinds.semantic)),
    [everyEdge, kinds.semantic, kinds.word],
  );
  const visibleIds = useMemo(
    () => neighborhood(ids, allEdges, focusId, depth),
    [ids, allEdges, focusId, depth],
  );
  const visible = useMemo(
    () => documents.filter((d) => visibleIds.has(d.id)),
    [documents, visibleIds],
  );
  // One line per pair of notes; a semantic link in either direction wins over a word link.
  const edges = useMemo(() => {
    const paired = new Map<string, WikiEdge>();
    for (const e of allEdges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const key = pairKey(e.source, e.target);
      if (!paired.has(key) || e.kind === 'semantic') paired.set(key, e);
    }
    return [...paired.values()];
  }, [allEdges, visibleIds]);
  // Sorted, so notes or links that merely changed order (a note saved moves up the list)
  // do not count as a new structure and restart the layout.
  const structure = useMemo(
    () =>
      `${visible
        .map((d) => d.id)
        .sort()
        .join(',')}|${edges
        .map((e) => pairKey(e.source, e.target))
        .sort()
        .join(',')}`,
    [visible, edges],
  );
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
  return { visible, edges, structure, categories, matches, searching: !!needle };
}

/** The link kinds shown, switched at once and saved; a saved change from elsewhere replaces them. */
export function useGraphLinkKinds(
  saved: GraphLinks = allLinkKinds,
  onSave?: (kinds: GraphLinks) => void,
) {
  const [local, setLocal] = useState(saved);
  useEffect(
    () => setLocal({ semantic: saved.semantic, word: saved.word }),
    [saved.semantic, saved.word],
  );
  const update = (next: GraphLinks) => {
    setLocal(next);
    onSave?.(next);
  };
  return [local, update] as const;
}

/** Local force values that follow saved settings and persist after a pause. */
export function useGraphForces(forces: GraphForces, onForces?: (forces: GraphForces) => void) {
  const [local, setLocal] = useState(forces);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshots arrive as new objects; only a changed value replaces the local forces.
  const key = JSON.stringify(forces);
  useEffect(() => setLocal(JSON.parse(key)), [key]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  const update = (next: GraphForces) => {
    setLocal(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onForces?.(next), 400);
  };
  return [local, update] as const;
}

const forceLabels: { key: keyof GraphForces; label: string; min: number; max: number }[] = [
  { key: 'center', label: 'Center force', min: 0, max: 3 },
  { key: 'repel', label: 'Repel force', min: 0, max: 3 },
  { key: 'link', label: 'Link force', min: 0, max: 3 },
  { key: 'distance', label: 'Link distance', min: 0.3, max: 3 },
];

export function ForcesPanel({
  forces,
  onChange,
  onClose,
  onRelayout,
  children,
}: {
  forces: GraphForces;
  onChange: (forces: GraphForces) => void;
  onClose: () => void;
  onRelayout: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="graph-forces" role="group" aria-label="Graph forces">
      <div className="graph-forces-heading">
        <strong>Forces</strong>
        <Button variant="ghost" size="icon-sm" aria-label="Close forces" onClick={onClose}>
          <X />
        </Button>
      </div>
      {forceLabels.map((item) => (
        <label key={item.key}>
          <span>
            {item.label}
            <small>{forces[item.key].toFixed(2)}</small>
          </span>
          <input
            type="range"
            min={item.min}
            max={item.max}
            step={0.05}
            value={forces[item.key]}
            onChange={(e) => onChange({ ...forces, [item.key]: Number(e.target.value) })}
          />
        </label>
      ))}
      {children}
      <div className="graph-forces-actions">
        <Button variant="ghost" size="xs" onClick={() => onChange(defaultForces)}>
          Reset forces
        </Button>
        <Button variant="ghost" size="xs" onClick={onRelayout}>
          <RotateCcw />
          Re-layout
        </Button>
      </div>
    </div>
  );
}

export const linkKindLabels: { key: keyof GraphLinks; label: string; hint: string }[] = [
  {
    key: 'semantic',
    label: 'Semantic links',
    hint: 'Solid lines: links written into a note for their context, and related notes.',
  },
  {
    key: 'word',
    label: 'Word links',
    hint: 'Dashed lines: links the glossary adds where a note mentions another page by name.',
  },
];

/** The two kinds of link as the graph draws them; each switches its kind on or off. */
export function LinkKindToggles({
  kinds,
  onChange,
}: {
  kinds: GraphLinks;
  onChange: (kinds: GraphLinks) => void;
}) {
  return (
    <span className="graph-link-kinds" role="group" aria-label="Links shown">
      {linkKindLabels.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.key}
          aria-pressed={kinds[item.key]}
          title={item.hint}
          onClick={() => onChange({ ...kinds, [item.key]: !kinds[item.key] })}
        >
          <i aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </span>
  );
}

export function GraphLegend({
  categories,
  children,
}: {
  categories: string[];
  children?: ReactNode;
}) {
  if (!categories.length && !children) return null;
  return (
    <div className="graph-legend" aria-label="Graph legend">
      {children}
      {categories.slice(0, LEGEND_SIZE).map((category, i) => (
        <span key={category}>
          <b style={{ color: graphColor(i) }} />
          {category}
        </span>
      ))}
      {categories.length > LEGEND_SIZE && (
        <span title={categories.slice(LEGEND_SIZE).join(', ')}>
          +{categories.length - LEGEND_SIZE} more
        </span>
      )}
    </div>
  );
}

const CENTRAL_LIST = 8;

/** The notes the layout is built around, most central first; hovering one highlights it. */
export function CentralNotes({
  notes,
  colorOf,
  top,
  onHover,
  onOpen,
}: {
  notes: WikiDocument[];
  colorOf: (doc: WikiDocument) => string;
  top: number;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  if (!notes.length) return null;
  return (
    <nav className="graph-hubs" style={{ top }} aria-label="Central notes">
      <span>Central notes</span>
      {notes.slice(0, CENTRAL_LIST).map((doc, i) => (
        <button
          key={doc.id}
          className={i === 0 ? 'core' : ''}
          onMouseEnter={() => onHover(doc.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(doc.id)}
          onBlur={() => onHover(null)}
          onClick={() => onOpen(doc.id)}
        >
          <b style={{ color: colorOf(doc) }} />
          {doc.title.split('/').at(-1)}
        </button>
      ))}
      {notes.length > CENTRAL_LIST && (
        <small>+{notes.length - CENTRAL_LIST} more central notes</small>
      )}
    </nav>
  );
}
