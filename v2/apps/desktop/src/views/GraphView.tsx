import { BookOpen, Network } from 'lucide-react';
import { useState } from 'react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { GraphCanvas } from '../graph/GraphCanvas';
import type { WikiLinks } from '../wiki/links';

/** The local graph: notes within one to three links of a focus note. */
export function GraphView({
  documents,
  links,
  focus,
  forces,
  onForces,
  onOpen,
  onGlobal,
}: {
  documents: WikiDocument[];
  links: WikiLinks;
  focus: WikiDocument;
  forces?: GraphForces;
  onForces: (forces: GraphForces) => void;
  onOpen: (id: string) => void;
  onGlobal: () => void;
}) {
  const [depth, setDepth] = useState(1);
  return (
    <div className="graph-page page-enter">
      <div className="graph-header">
        <div>
          <span className="eyebrow">LOCAL GRAPH</span>
          <h1>{focus.title}</h1>
        </div>
        <div className="graph-header-actions">
          <span className="segmented segmented-xs" role="group" aria-label="Depth">
            {[1, 2, 3].map((value) => (
              <button
                key={value}
                className={depth === value ? 'selected' : ''}
                aria-pressed={depth === value}
                onClick={() => setDepth(value)}
              >
                {value} {value === 1 ? 'link' : 'links'}
              </button>
            ))}
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpen(focus.id)}>
            <BookOpen /> Open note
          </Button>
          <Button variant="ghost" size="sm" onClick={onGlobal}>
            <Network /> Whole wiki
          </Button>
        </div>
      </div>
      <GraphCanvas
        className="graph-fill"
        documents={documents}
        edges={links.edges}
        focusId={focus.id}
        depth={depth}
        forces={forces}
        onForces={onForces}
        onOpen={onOpen}
      />
    </div>
  );
}
