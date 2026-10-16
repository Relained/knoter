import { useEffect, useState } from 'react';
import type { WikiDocument } from '@knoter/contracts';
import { defaultGraphView, type GraphForces, type GraphView } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import type { WikiEdge } from '../wiki/links';
import { GraphCanvas } from './GraphCanvas';
import { Graph3D } from './Graph3D';

/** The wiki graph in the user's chosen form: the 3D sphere (default) or the flat map. */
export function WikiGraph({
  view,
  onView,
  ...props
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
  insetTop?: number;
  view?: GraphView;
  onView: (view: GraphView) => void;
}) {
  // Apply a choice at once; the saved setting follows with the next snapshot.
  const saved = JSON.stringify(view ?? defaultGraphView);
  const [current, setCurrent] = useState<GraphView>(JSON.parse(saved));
  useEffect(() => setCurrent(JSON.parse(saved)), [saved]);
  const change = (next: GraphView) => {
    setCurrent(next);
    onView(next);
  };
  const flat = current.mode === '2d';
  const toggle = (
    <Button
      variant="ghost"
      size="xs"
      className="graph-mode-toggle"
      aria-label={flat ? 'Show the graph in 3D' : 'Show the graph in 2D'}
      title={flat ? 'Switch to the 3D sphere' : 'Switch to the flat 2D map'}
      onClick={() => change({ ...current, mode: flat ? '3d' : '2d' })}
    >
      {flat ? '3D' : '2D'}
    </Button>
  );
  return flat ? (
    <GraphCanvas {...props} modeToggle={toggle} />
  ) : (
    <Graph3D
      {...props}
      rotate={current.rotate}
      onRotate={(rotate) => change({ ...current, rotate })}
      modeToggle={toggle}
    />
  );
}
