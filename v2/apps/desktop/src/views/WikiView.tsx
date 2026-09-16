import { lazy, Suspense, useRef, useState } from 'react';
import type { EditorHandle } from '../components/Editor';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { Markdown } from '../components/Markdown';
import { DocIcon, relativeTime } from '../components/helpers';

const Editor = lazy(() => import('../components/Editor'));
export type RunAction = (action: () => Promise<unknown>, message?: string) => Promise<boolean>;

export function WikiLibrary({
  snapshot,
  category,
  onOpen,
  onNew,
}: {
  snapshot: WorkspaceSnapshot;
  category: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const docs = snapshot.documents.filter(
    (d) =>
      (!category || d.category === category) &&
      (filter !== 'favorites' || d.favorite) &&
      `${d.title} ${d.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="collection-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONNECTED KNOWLEDGE</div>
          <h1>{category || 'The wiki'}</h1>
          <p>A home for the ideas you want to keep.</p>
        </div>
        <Button onClick={onNew}>
          <Plus /> New note
        </Button>
      </div>
      <div className="list-toolbar">
        <div className="segmented">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            All notes <span>{snapshot.documents.length}</span>
          </button>
          <button
            className={filter === 'favorites' ? 'selected' : ''}
            onClick={() => setFilter('favorites')}
          >
            Favorites
          </button>
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            placeholder="Find a note…"
            aria-label="Find a note"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="document-grid">
        {docs.map((doc) => (
          <button key={doc.id} className="document-card" onClick={() => onOpen(doc.id)}>
            <div className="document-card-top">
              <span className="document-symbol">
                <DocIcon doc={doc} size={21} />
              </span>
              {doc.favorite && <Star size={14} className="favorite-star" />}
            </div>
            <span className="tiny-label">{doc.category}</span>
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <div className="document-card-bottom">
              <span>
                <Link2 size={13} /> {doc.sourceIds.length} sources
              </span>
              <span>{relativeTime(doc.updatedAt)}</span>
              <ArrowUpRight size={15} />
            </div>
          </button>
        ))}
      </div>
      {!docs.length && (
        <div className="empty-state">
          <BookOpen />
          <h3>No notes here yet</h3>
          <p>Try another search, or give a new idea a home.</p>
          <Button variant="outline" onClick={onNew}>
            Create a note
          </Button>
        </div>
      )}
    </div>
  );
}

export function WikiDocumentView({
  doc,
  snapshot,
  client,
  run,
  onSource,
  onOpen,
  onAsk,
  editing,
  onEditing,
}: {
  doc: WikiDocument;
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
  onAsk: () => void;
  editing: boolean;
  onEditing: (value: boolean) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [baseRevision, setBaseRevision] = useState(doc.revision);
  const [saving, setSaving] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const sources = snapshot.sources.filter((s) => doc.sourceIds.includes(s.id));
  const related = snapshot.documents.filter((d) => doc.relatedIds.includes(d.id));
  const begin = () => {
    setTitle(doc.title);
    setBody(doc.body);
    setBaseRevision(doc.revision);
    onEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const success = await run(
      () =>
        client.saveDocument({
          id: doc.id,
          title,
          body: editor.current?.getMarkdown() ?? body,
          baseRevision,
        }),
      'Note saved. Your edits are protected.',
    );
    setSaving(false);
    if (success) onEditing(false);
  };
  return (
    <div className="wiki-scroll page-enter">
      <article className="wiki-article">
        <div className="article-topline">
          <span className="category-label">
            <span />
            {doc.category}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void run(() => client.toggleFavorite(doc.id))}
              aria-label={doc.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={doc.favorite ? 'favorite-star' : ''} />
            </Button>
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditing(false)}
                  disabled={saving}
                >
                  <X /> Cancel
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="spin" /> : <Check />} Save note
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={begin}>
                <PencilLine /> Edit note
              </Button>
            )}
          </div>
        </div>
        <div className="article-icon">
          <DocIcon doc={doc} size={27} />
        </div>
        {editing ? (
          <input
            className="title-editor"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Note title"
          />
        ) : (
          <h1>{doc.title}</h1>
        )}
        <p className="article-description">{doc.description}</p>
        <div className="article-meta">
          <span>
            <Sparkles size={13} /> {doc.protected ? 'Curated by you' : 'Connected by knoter'}
          </span>
          <i />
          <span>Updated {relativeTime(doc.updatedAt)}</span>
          <i />
          <span>
            <Clock3 size={13} /> {Math.max(1, Math.ceil(doc.body.split(/\s+/).length / 180))} min
            read
          </span>
        </div>
        {editing ? (
          <>
            <div className="editing-note">
              <ShieldCheck size={14} /> Your edits are protected from future automatic updates.
            </div>
            <Suspense
              fallback={
                <div className="editor-loading">
                  <Loader2 className="spin" /> Opening your editor…
                </div>
              }
            >
              <Editor
                ref={editor}
                key={`${doc.id}-${baseRevision}`}
                value={body}
                onChange={setBody}
              />
            </Suspense>
          </>
        ) : (
          <>
            <div className="knowledge-strip">
              <span>
                <span className="status-dot" /> Living note
              </span>
              <button
                onClick={() => sources[0] && onSource(sources[0].id)}
                disabled={!sources.length}
              >
                <Link2 size={14} /> {sources.length} connected sources <ChevronRight size={13} />
              </button>
              {doc.protected && (
                <span className="protected-label">
                  <ShieldCheck size={13} /> Protected
                </span>
              )}
            </div>
            <Markdown onSource={onSource}>{doc.body}</Markdown>
            <section className="article-sources">
              <div className="section-heading">
                <h2>Grounded in your sources</h2>
                <span>{sources.length} references</span>
              </div>
              {sources.length ? (
                sources.map((source, index) => (
                  <button
                    className="source-reference"
                    key={source.id}
                    onClick={() => onSource(source.id)}
                  >
                    <span className="reference-number">{index + 1}</span>
                    <div>
                      <strong>{source.title}</strong>
                      <span>{source.filename}</span>
                    </div>
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <p className="muted text-sm">
                  This is your own note. Add source material from the Sources library.
                </p>
              )}
            </section>
            {related.length > 0 && (
              <section className="related-section">
                <div className="section-heading">
                  <h2>Follow the connections</h2>
                </div>
                <div className="related-grid">
                  {related.map((item) => (
                    <button key={item.id} onClick={() => onOpen(item.id)}>
                      <DocIcon doc={item} size={17} />
                      <span>{item.title}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <footer className="article-footer">
              <span>
                <FileText size={13} /> Revision {doc.revision}
              </span>
              <button onClick={onAsk}>
                <Sparkles size={14} /> Think through this with knoter <ChevronRight size={13} />
              </button>
            </footer>
          </>
        )}
      </article>
    </div>
  );
}
