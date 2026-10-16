import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Plus, Search } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces, GraphView as GraphViewSetting } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { DocIcon } from '../components/helpers';
import { WikiGraph } from '../graph/WikiGraph';
import type { WikiLinks } from '../wiki/links';

/** Rank by title match first, then category, tags, and body. */
export function searchDocuments(documents: WikiDocument[], query: string, limit = 8) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return documents
    .map((d) => {
      const title = d.title.toLocaleLowerCase();
      const score = title.startsWith(needle)
        ? 4
        : title.includes(needle)
          ? 3
          : `${d.category} ${(d.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(needle)
            ? 2
            : `${d.description} ${d.body}`.toLocaleLowerCase().includes(needle)
              ? 1
              : 0;
      return { d, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((r) => r.d);
}

/** The wiki's front page: one search field above the whole graph. */
export function HomeView({
  documents,
  links,
  forces,
  onForces,
  view,
  onView,
  onOpen,
  onNew,
  onLibrary,
}: {
  documents: WikiDocument[];
  links: WikiLinks;
  forces?: GraphForces;
  onForces: (forces: GraphForces) => void;
  view?: GraphViewSetting;
  onView: (view: GraphViewSetting) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onLibrary: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchDocuments(documents, query), [documents, query]);
  const connections = useMemo(
    () => new Set(links.edges.map((e) => [e.source, e.target].sort().join(':'))).size,
    [links.edges],
  );
  const open = focused && !!query.trim();
  return (
    <div className="home-page page-enter">
      <div className="home-search-wrap">
        <div className={`home-search ${open ? 'home-search-open' : ''}`}>
          <Search size={17} />
          <input
            ref={input}
            role="combobox"
            aria-expanded={open}
            aria-controls="home-search-results"
            aria-label="Search the wiki"
            placeholder="Search your wiki…"
            value={query}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setIndex((i) => (i + step + results.length) % Math.max(1, results.length));
              }
              if (e.key === 'Enter' && results[index]) {
                e.preventDefault();
                onOpen(results[index].id);
              }
              if (e.key === 'Escape') {
                setQuery('');
                input.current?.blur();
              }
            }}
          />
          {open && (
            <div className="home-search-results" id="home-search-results" role="listbox">
              {results.map((doc, i) => (
                <button
                  key={doc.id}
                  role="option"
                  aria-selected={i === index}
                  className={i === index ? 'selected' : ''}
                  onMouseEnter={() => setIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onOpen(doc.id)}
                >
                  <DocIcon doc={doc} size={15} />
                  <span>
                    {doc.title}
                    <small>
                      {doc.category}
                      {doc.description ? ` · ${doc.description}` : ''}
                    </small>
                  </span>
                  <ArrowRight size={13} />
                </button>
              ))}
              {!results.length && <p>No notes match “{query.trim()}”.</p>}
            </div>
          )}
        </div>
        <div className="home-meta">
          <span>
            {documents.length} notes · {connections} connections
          </span>
          <Button variant="ghost" size="xs" onClick={onLibrary}>
            <BookOpen /> All notes
          </Button>
          <Button variant="ghost" size="xs" onClick={onNew}>
            <Plus /> New note
          </Button>
        </div>
      </div>
      <WikiGraph
        view={view}
        onView={onView}
        className="graph-fill"
        insetTop={110}
        documents={documents}
        edges={links.edges}
        query={query}
        forces={forces}
        onForces={onForces}
        onOpen={onOpen}
      />
    </div>
  );
}
