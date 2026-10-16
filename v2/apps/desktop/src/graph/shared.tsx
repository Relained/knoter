import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import type { WikiEdge } from '../wiki/links';
import { defaultForces } from './simulation';

export const PALETTE_SIZE = 8;
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

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
 * structure does: snapshots replace every object every few seconds.
 */
export function useGraphData(
  documents: WikiDocument[],
  allEdges: WikiEdge[],
  focusId?: string,
  depth = 1,
  query = '',
) {
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

export function GraphLegend({
  categories,
  children,
}: {
  categories: string[];
  children?: ReactNode;
}) {
  if (!categories.length && !children) return null;
  return (
    <div className="graph-legend" aria-label="Collections">
      {children}
      {categories.slice(0, PALETTE_SIZE).map((category, i) => (
        <span key={category}>
          <b className={`graph-color-${i}`} />
          {category}
        </span>
      ))}
      {categories.length > PALETTE_SIZE && <span>+{categories.length - PALETTE_SIZE}</span>}
    </div>
  );
}
