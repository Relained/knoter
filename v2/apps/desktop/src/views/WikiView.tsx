import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorHandle } from '../components/Editor';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Link2,
  Network,
  Loader2,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { Markdown } from '../components/Markdown';
import { DocIcon, relativeTime } from '../components/helpers';
import { Dialog } from '../components/ui/dialog';
import { documentHref, documentMarkdownLink, type WikiLinks } from '../wiki/links';
import { DocumentContextMenu, DocumentMenuButton } from '../components/DocumentMenu';

const Editor = lazy(() => import('../components/Editor'));
export type RunAction = (action: () => Promise<unknown>, message?: string) => Promise<boolean>;

export function WikiLibrary({
  snapshot,
  category,
  onOpen,
  onNew,
  onTrash,
}: {
  snapshot: WorkspaceSnapshot;
  category: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTrash: () => void;
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
        <div className="library-actions">
          <Button variant="ghost" onClick={onTrash}>
            <Trash2 />
            Trash
            {snapshot.trashedDocuments.length > 0 && (
              <span>{snapshot.trashedDocuments.length}</span>
            )}
          </Button>
          <Button onClick={onNew}>
            <Plus /> New note
          </Button>
        </div>
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
          <DocumentContextMenu key={doc.id} doc={doc}>
            <div className="document-card">
              <button
                className="document-card-open"
                aria-label={`Open ${doc.title}`}
                onClick={() => onOpen(doc.id)}
              >
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
              <DocumentMenuButton doc={doc} />
            </div>
          </DocumentContextMenu>
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
  onDirtyCheck,
  links,
  onGraph,
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
  onDirtyCheck: (check: (() => boolean) | null) => void;
  links: WikiLinks;
  onGraph: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const savedDraft = useRef({ title: doc.title, body: doc.body });
  const [baseRevision, setBaseRevision] = useState(doc.revision);
  const [saving, setSaving] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const [linkPicker, setLinkPicker] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const sources = snapshot.sources.filter((s) => doc.sourceIds.includes(s.id));
  const related = snapshot.documents.filter((d) => doc.relatedIds.includes(d.id));
  const outgoing = snapshot.documents.filter((d) =>
    links.edges.some((e) => e.source === doc.id && e.target === d.id && e.kind === 'link'),
  );
  const incoming = snapshot.documents.filter((d) =>
    links.edges.some((e) => e.source === d.id && e.target === doc.id),
  );
  const unresolved = links.unresolved.filter((e) => e.source === doc.id);
  useLayoutEffect(() => {
    // Read live Markdown: Milkdown's debounced onChange may miss the last keystroke.
    onDirtyCheck(
      () =>
        editing &&
        (title !== savedDraft.current.title ||
          (editor.current?.getMarkdown() ?? body) !== savedDraft.current.body),
    );
    return () => onDirtyCheck(null);
  }, [editing, title, body, onDirtyCheck]);
  useEffect(() => {
    if (editing) return;
    // Prepare the next edit while reading so the editor mounts with saved content.
    // Snapshot updates must not replace an in-progress draft.
    setEditorReady(false);
    setTitle(doc.title);
    setBody(doc.body);
    setBaseRevision(doc.revision);
    savedDraft.current = { title: doc.title, body: doc.body };
  }, [editing, doc.title, doc.body, doc.revision]);
  const begin = () => onEditing(true);
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
      <DocumentContextMenu doc={doc} disabled={editing}>
        <article className="wiki-article">
          <div className="article-topline">
            <span className="category-label">
              <span />
              {doc.category}
            </span>
            <div className="flex gap-1">
              {!editing && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="View this note in graph"
                  title="View connected graph"
                  onClick={onGraph}
                >
                  <Network />
                </Button>
              )}
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
              <DocumentMenuButton doc={doc} disabled={saving} />
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
              <div className="wiki-link-toolbar">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLinkQuery('');
                    setLinkPicker(true);
                  }}
                  disabled={!editorReady}
                >
                  <Link2 />
                  Link a note
                </Button>
                <span>Connect an idea with [[note title]] or choose a note.</span>
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
                  onReady={() => {
                    // Serialization may normalize untouched Markdown when the editor opens.
                    savedDraft.current.body = editor.current?.getMarkdown() ?? body;
                    setEditorReady(true);
                  }}
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
              <Markdown onSource={onSource} onOpen={onOpen} documents={snapshot.documents}>
                {doc.body}
              </Markdown>
              <section className="wiki-connections">
                <div className="section-heading">
                  <h2>Connected knowledge</h2>
                  <Button variant="ghost" size="sm" onClick={onGraph}>
                    <Network />
                    Explore graph
                  </Button>
                </div>
                <div className="wiki-connections-grid">
                  <div>
                    <h3>
                      Links from this note <span>{outgoing.length}</span>
                    </h3>
                    {outgoing.map((item) => (
                      <DocumentContextMenu doc={item} key={item.id}>
                        <a
                          key={item.id}
                          href={documentHref(item.id)}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                              e.preventDefault();
                              onOpen(item.id);
                            }
                          }}
                        >
                          {item.title}
                          <ArrowUpRight size={13} />
                        </a>
                      </DocumentContextMenu>
                    ))}
                    {!outgoing.length && <p>Add a link in the editor to connect an idea.</p>}
                  </div>
                  <div>
                    <h3>
                      Backlinks <span>{incoming.length}</span>
                    </h3>
                    {incoming.map((item) => (
                      <DocumentContextMenu doc={item} key={item.id}>
                        <a
                          key={item.id}
                          href={documentHref(item.id)}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                              e.preventDefault();
                              onOpen(item.id);
                            }
                          }}
                        >
                          {item.title}
                          <ArrowUpRight size={13} />
                        </a>
                      </DocumentContextMenu>
                    ))}
                    {!incoming.length && <p>No other notes link here yet.</p>}
                  </div>
                </div>
                {!!unresolved.length && (
                  <p className="unresolved-summary">
                    Unresolved links: {unresolved.map((e) => e.target).join(', ')}. Use a unique
                    note title or insert a link by choosing a note.
                  </p>
                )}
              </section>
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
                      <DocumentContextMenu doc={item} key={item.id}>
                        <button key={item.id} onClick={() => onOpen(item.id)}>
                          <DocIcon doc={item} size={17} />
                          <span>{item.title}</span>
                          <ArrowUpRight size={14} />
                        </button>
                      </DocumentContextMenu>
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
      </DocumentContextMenu>
      <Dialog
        open={linkPicker}
        onOpenChange={setLinkPicker}
        title="Link to another note"
        description="Choose a note to insert a stable link at your cursor."
      >
        <div className="link-picker">
          <div className="search-field">
            <Search size={15} />
            <input
              autoFocus
              aria-label="Find a note to link"
              placeholder="Find a note…"
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
            />
          </div>
          <div className="link-picker-results">
            {snapshot.documents
              .filter(
                (d) => d.id !== doc.id && d.title.toLowerCase().includes(linkQuery.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    void run(async () => {
                      if (!editor.current)
                        throw new Error('The editor is still opening. Please try again.');
                      editor.current.insertLink(documentMarkdownLink(item));
                      setLinkPicker(false);
                    });
                  }}
                >
                  <DocIcon doc={item} />
                  <span>
                    {item.title}
                    <small>{item.category}</small>
                  </span>
                  <Link2 size={14} />
                </button>
              ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
