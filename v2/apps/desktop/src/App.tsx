import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  FileText,
  Folder,
  Leaf,
  Loader2,
  Maximize,
  Menu,
  Minimize,
  Moon,
  Network,
  PanelRight,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  UploadCloud,
  X,
} from 'lucide-react';
import type { KnoterClient, View, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { ContextPanel, type PanelTab } from './components/ContextPanel';
import { DocIcon, fileSize, relativeTime, SourceIcon } from './components/helpers';
import { Markdown } from './components/Markdown';
import { WikiDocumentView, WikiLibrary, type RunAction } from './views/WikiView';
import { SourcesView } from './views/SourcesView';
import { TasksView } from './views/TasksView';
import { CalendarView } from './views/CalendarView';
import { createSampleFile, readImports } from './api';
import { exportMarkdown } from './api/export';
import { useWorkspaceHistory } from './components/useWorkspaceHistory';
import { SidebarResizeHandle } from './components/SidebarResizeHandle';
import { GraphView } from './views/GraphView';
import { buildWikiLinks } from './wiki/links';

const navigation = [
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'sources', label: 'Sources', icon: Folder },
  { id: 'tasks', label: 'Tasks', icon: CheckCheck },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
] as const;

export function App({ client }: { client: KnoterClient }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const [panel, setPanelVisible] = useState(() => window.innerWidth > 1050);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [leftWidth, setLeftWidth] = useState(222);
  const [rightWidth, setRightWidth] = useState(326);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const layoutLoaded = useRef(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<'import' | 'settings' | 'search' | 'activity' | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const destination = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchSelection = useRef<HTMLButtonElement>(null);
  const run: RunAction = useCallback(async (action, message) => {
    try {
      await action();
      if (message) setToast({ text: message, error: false });
      return true;
    } catch (error) {
      setToast({
        text: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        error: true,
      });
      return false;
    }
  }, []);
  const setPanel = (visible: boolean) => {
    setPanelVisible(visible);
    void run(() => client.updateSettings({ rightSidebarCollapsed: !visible }));
  };
  const toggleNavigation = () => {
    setSidebarCompact(!sidebarCompact);
    void run(() => client.updateSettings({ leftSidebarCompact: !sidebarCompact }));
  };
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    let active = true;
    const load = () =>
      void client
        .getSnapshot()
        .then((value) => {
          if (active) {
            setSnapshot(value);
            if (!layoutLoaded.current) {
              layoutLoaded.current = true;
              setSidebarCompact(
                value.settings.leftSidebarCompact ?? value.settings.leftSidebarCollapsed ?? false,
              );
              setPanelVisible(
                window.innerWidth > 1050 && !(value.settings.rightSidebarCollapsed ?? false),
              );
              setLeftWidth(Math.max(184, Math.min(380, value.settings.leftSidebarWidth || 222)));
              setRightWidth(Math.max(280, Math.min(600, value.settings.rightSidebarWidth || 326)));
            }
          }
        })
        .catch((error) => {
          if (active) setToast({ text: String(error), error: true });
        });
    const unsubscribe = client.subscribe(load);
    load();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 8000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.settings.theme || 'light';
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setModal((current) => (current === 'search' ? null : 'search'));
        setSearch('');
        setSearchIndex(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [editing]);
  useEffect(() => {
    searchSelection.current?.scrollIntoView({ block: 'nearest' });
  }, [searchIndex]);
  const navigate = (action: () => void) => {
    if (editing) {
      destination.current = action;
      setLeaving(true);
      return;
    }
    action();
    setMobileNav(false);
  };
  const historyNav = useWorkspaceHistory(
    navigate,
    () => {
      setModal(null);
      setSourceId(null);
      setMobileNav(false);
      setEditing(false);
    },
    editing,
  );
  const { view, documentId, category = null, focusId } = historyNav.route;
  const wikiLinks = useMemo(() => buildWikiLinks(snapshot?.documents || []), [snapshot?.documents]);
  const openDocument = (id: string) =>
    navigate(() => {
      historyNav.push({ view: 'wiki', documentId: id });
      setModal(null);
      setSourceId(null);
    });
  const openView = (next: View) =>
    navigate(() => {
      historyNav.push({ view: next });
      setModal(null);
    });
  const createNote = () =>
    navigate(() => {
      void run(async () => {
        const id = await client.createDocument();
        historyNav.push({ view: 'wiki', documentId: id });
        setModal(null);
        setEditing(true);
      });
    });
  const importFiles = async (selected: File[]) => {
    if (!selected.length) return;
    setImporting(true);
    const ok = await run(
      async () => client.importSources(await readImports(selected)),
      'Sources added. Demo processing will connect them to your wiki.',
    );
    setImporting(false);
    if (ok) {
      setFiles([]);
      setModal(null);
      navigate(() => {
        historyNav.push({ view: 'sources' });
      });
    }
  };

  if (!snapshot)
    return (
      <div className="app-loading">
        <Network size={32} />
        <span>Opening your workspace…</span>
        {toast && <p>{toast.text}</p>}
      </div>
    );
  const doc =
    view === 'wiki' && documentId ? snapshot.documents.find((d) => d.id === documentId) : undefined;
  const source = snapshot.sources.find((s) => s.id === sourceId);
  const categories = [...new Set(snapshot.documents.map((d) => d.category))];
  const currentLabel = navigation.find((n) => n.id === view)!.label;
  const resultDocs = snapshot.documents
    .filter((d) =>
      `${d.title} ${d.category} ${d.body}`.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 7);
  const results = [
    ...resultDocs.map((d) => ({
      id: d.id,
      label: d.title,
      detail: d.category,
      icon: <DocIcon doc={d} />,
      action: () => openDocument(d.id),
    })),
    ...navigation
      .filter((n) => !search || n.label.toLowerCase().includes(search.toLowerCase()))
      .map((n) => ({
        id: n.id,
        label: `Open ${n.label}`,
        detail: 'Go to',
        icon: <n.icon size={16} />,
        action: () => openView(n.id),
      })),
  ];
  const chooseFiles = (items: File[]) => {
    setFiles((current) => [
      ...current,
      ...items.filter((file) => !current.some((f) => f.name === file.name && f.size === file.size)),
    ]);
  };
  const counts = {
    wiki: snapshot.documents.length,
    sources: snapshot.sources.length,
    tasks: snapshot.tasks.filter((t) => !t.done).length,
    calendar: 0,
    graph: 0,
  };
  const navWidth =
    viewportWidth <= 760 || zenMode
      ? 0
      : sidebarCompact
        ? 64
        : Math.min(leftWidth, viewportWidth - 360 - (panel && viewportWidth > 1050 ? 280 : 0));
  const contextWidth = Math.min(
    rightWidth,
    viewportWidth > 1050 ? viewportWidth - navWidth - 360 : viewportWidth - 24,
  );
  const leftMax = Math.min(
    380,
    viewportWidth - 360 - (panel && viewportWidth > 1050 ? contextWidth : 0),
  );
  const rightMax = Math.min(
    600,
    viewportWidth > 1050 ? viewportWidth - navWidth - 360 : viewportWidth - 24,
  );

  return (
    <div
      className={`app-shell ${panel ? 'has-panel' : ''} ${sidebarCompact ? 'sidebar-compact' : ''} ${zenMode ? 'zen-mode' : ''}`}
      style={
        {
          '--nav-width': `${navWidth}px`,
          '--context-width': `${panel && !zenMode && viewportWidth > 1050 ? contextWidth : 0}px`,
          '--overlay-width': `${contextWidth}px`,
        } as CSSProperties
      }
    >
      {mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}
      >
        {!sidebarCompact && (
          <SidebarResizeHandle
            side="left"
            width={navWidth}
            min={184}
            max={leftMax}
            onChange={setLeftWidth}
            onCommit={(value) => void run(() => client.updateSettings({ leftSidebarWidth: value }))}
          />
        )}
        <a
          className="brand"
          href="#"
          aria-label="knoter home"
          title="knoter home"
          onClick={(e) => {
            e.preventDefault();
            openView('wiki');
          }}
        >
          <span className="brand-symbol">
            <Network size={22} strokeWidth={1.8} />
          </span>
          <span>
            knoter<span className="brand-period">.</span>
          </span>
        </a>
        <button
          className="workspace-picker"
          aria-label="Research space settings"
          title="Research space settings"
          onClick={() => setModal('settings')}
        >
          <span className="workspace-avatar">
            <Leaf size={16} />
          </span>
          <span>
            <strong>Research space</strong>
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={13} />
        </button>
        <button
          className="global-search"
          aria-label="Find anything"
          title="Find anything (⌘/Ctrl K)"
          onClick={() => {
            setModal('search');
            setSearch('');
            setSearchIndex(0);
          }}
        >
          <Search size={15} />
          <span>Find anything</span>
          <kbd>
            <Command size={10} />K
          </kbd>
        </button>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              key={item.id}
              aria-label={item.label}
              title={item.label}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => openView(item.id)}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
              {counts[item.id] > 0 && <small>{counts[item.id]}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-group">
          <div className="sidebar-label">
            PINNED NOTES
            <StarGlyph />
          </div>
          {snapshot.documents
            .filter((d) => d.favorite)
            .map((d) => (
              <button
                className={`sidebar-note ${doc?.id === d.id ? 'note-selected' : ''}`}
                key={d.id}
                title={d.title}
                onClick={() => openDocument(d.id)}
              >
                <DocIcon doc={d} size={14} />
                <span>{d.title}</span>
              </button>
            ))}
        </div>
        <div className="sidebar-group">
          <div className="sidebar-label">
            COLLECTIONS<span>{categories.length}</span>
          </div>
          {categories.map((name, i) => (
            <button
              className={`collection-link ${category === name ? 'note-selected' : ''}`}
              key={name}
              onClick={() =>
                navigate(() => {
                  historyNav.push({ view: 'wiki', category: name });
                })
              }
            >
              <i className={`collection-dot dot-${i % 3}`} />
              <span>{name}</span>
              <small>{snapshot.documents.filter((d) => d.category === name).length}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="workspace-pulse" onClick={() => setModal('activity')}>
            <span className="pulse-dot" />
            <div>
              <strong>
                {snapshot.settings.workerPaused ? 'A moment of pause' : 'A growing workspace'}
              </strong>
              <span>{snapshot.documents.length} notes, connected.</span>
            </div>
            <ChevronRight size={13} />
          </button>
          <div className="sidebar-bottom-actions">
            <button aria-label="Settings" title="Settings" onClick={() => setModal('settings')}>
              <Settings2 size={16} />
              <span>Settings</span>
            </button>
            <button
              aria-label="About this demo"
              title="About this demo"
              onClick={() => setModal('settings')}
            >
              <CircleHelp size={16} />
            </button>
          </div>
          <div className="demo-footnote">
            <span />
            Local demo<span className="version-label">v0.1</span>
          </div>
        </div>
      </aside>
      <main
        className="main-workspace"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            chooseFiles(Array.from(e.dataTransfer.files));
            setModal('import');
          }
        }}
      >
        <header className="topbar">
          <Button
            className="desktop-nav-toggle"
            size="icon"
            variant={sidebarCompact ? 'soft' : 'ghost'}
            aria-label={sidebarCompact ? 'Expand navigation' : 'Use compact navigation'}
            title={sidebarCompact ? 'Expand navigation' : 'Use compact navigation'}
            aria-pressed={sidebarCompact}
            aria-controls="workspace-navigation"
            onClick={toggleNavigation}
          >
            <PanelLeft />
          </Button>
          <Button
            className="mobile-menu"
            size="icon"
            variant="ghost"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </Button>
          <div className="history-controls">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Go back"
              disabled={!historyNav.canBack}
              onClick={historyNav.back}
            >
              <ArrowLeft />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Go forward"
              disabled={!historyNav.canForward}
              onClick={historyNav.forward}
            >
              <ArrowRight />
            </Button>
          </div>
          <div className="breadcrumbs">
            <button onClick={() => openView(view)}>{currentLabel}</button>
            {(doc || category) && (
              <>
                <ChevronRight size={13} />
                <span>{doc?.category || category}</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="workspace-state">
              <span className="status-dot" />
              Saved on this device
            </span>
            {doc && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Export note as Markdown"
                title="Export Markdown"
                onClick={() => exportMarkdown(doc)}
              >
                <ArrowDownToLine />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Workspace activity"
              title="Workspace activity"
              onClick={() => setModal('activity')}
            >
              <Bell />
            </Button>
            <span className="toolbar-divider panel-divider" />
            <Button
              className="assistant-toggle"
              variant={panel ? 'soft' : 'ghost'}
              size="icon"
              aria-label={panel ? 'Hide assistant panel' : 'Show assistant panel'}
              title="Toggle side panel"
              onClick={() => setPanel(!panel)}
            >
              <PanelRight />
            </Button>
            <Button
              className="zen-toggle"
              variant={zenMode ? 'soft' : 'ghost'}
              size={zenMode ? 'sm' : 'icon'}
              aria-label={zenMode ? 'Exit Zen mode' : 'Enter Zen mode'}
              title={zenMode ? 'Exit Zen mode' : 'Zen mode — focus on the main workspace'}
              aria-pressed={zenMode}
              onClick={() => {
                setMobileNav(false);
                setZenMode(!zenMode);
              }}
            >
              {zenMode ? <Minimize /> : <Maximize />}
              {zenMode && <span>Exit Zen</span>}
            </Button>
          </div>
        </header>
        {view === 'wiki' &&
          (doc ? (
            <WikiDocumentView
              key={doc.id}
              doc={doc}
              snapshot={snapshot}
              client={client}
              run={run}
              onSource={setSourceId}
              onOpen={openDocument}
              links={wikiLinks}
              onGraph={() => navigate(() => historyNav.push({ view: 'graph', focusId: doc.id }))}
              onAsk={() => {
                setZenMode(false);
                setPanel(true);
                setPanelTab('chat');
              }}
              editing={editing}
              onEditing={setEditing}
            />
          ) : documentId ? (
            <div className="empty-state">
              <BookOpen />
              <h2>Note not found</h2>
              <p>This link does not match a document in this workspace.</p>
              <Button onClick={() => openView('wiki')}>Browse the wiki</Button>
            </div>
          ) : (
            <WikiLibrary
              snapshot={snapshot}
              category={category}
              onOpen={openDocument}
              onNew={createNote}
            />
          ))}
        {view === 'sources' && (
          <SourcesView
            snapshot={snapshot}
            client={client}
            run={run}
            onImport={() => setModal('import')}
            onSource={setSourceId}
            onOpen={openDocument}
          />
        )}
        {view === 'tasks' && (
          <TasksView snapshot={snapshot} client={client} run={run} onOpen={openDocument} />
        )}
        {view === 'calendar' && <CalendarView snapshot={snapshot} client={client} run={run} />}
        {view === 'graph' && (
          <GraphView
            key={focusId || 'all'}
            documents={snapshot.documents}
            links={wikiLinks}
            focusId={focusId}
            onOpen={openDocument}
            onGlobal={() => openView('graph')}
          />
        )}
      </main>
      {panel && (
        <ContextPanel
          snapshot={snapshot}
          doc={doc}
          client={client}
          run={run}
          onClose={() => setPanel(false)}
          onSource={setSourceId}
          onOpen={openDocument}
          tab={panelTab}
          setTab={setPanelTab}
          resizeHandle={
            <SidebarResizeHandle
              side="right"
              width={contextWidth}
              min={Math.min(280, rightMax)}
              max={rightMax}
              onChange={setRightWidth}
              onCommit={(value) =>
                void run(() => client.updateSettings({ rightSidebarWidth: value }))
              }
            />
          }
        />
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'toast-error' : ''}`}
        >
          {toast.error ? <CircleHelp size={17} /> : <Check size={17} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <Dialog
        open={modal === 'import'}
        onOpenChange={(open) => {
          if (!open && !importing) setModal(null);
        }}
        title="Bring your sources together"
        description="Add a paper, a thought, or the start of something new."
      >
        <div className="dialog-form">
          <input
            type="file"
            accept=".pdf,.md,.txt"
            multiple
            ref={fileInput}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              chooseFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <button
            className={`import-drop ${dragging ? 'dragging' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              chooseFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <UploadCloud size={30} />
            <strong>Drop your files here</strong>
            <span>or click to browse · PDF, Markdown, TXT</span>
            <small>Up to 25 MB per file</small>
          </button>
          {files.length > 0 && (
            <div className="selected-files">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`}>
                  <FileText size={16} />
                  <span>
                    {file.name}
                    <small>{fileSize(file.size)}</small>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="demo-info">
            <Sparkles size={15} />
            <p>
              In this demo, processing is simulated. Text notes are kept in your browser; PDFs are
              represented by their filename.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={importing}
            onClick={() => void importFiles([createSampleFile()])}
          >
            Try a sample note
          </Button>
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setModal(null)} disabled={importing}>
              Cancel
            </Button>
            <Button disabled={!files.length || importing} onClick={() => void importFiles(files)}>
              {importing ? <Loader2 className="spin" /> : <Plus />}Add {files.length || ''} source
              {files.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!source}
        onOpenChange={(open) => {
          if (!open) setSourceId(null);
        }}
        title="A closer look at the source"
        description="Keep the evidence close to the idea."
        className="source-dialog"
      >
        {source && (
          <div className="dialog-form">
            <div className="source-detail-title">
              <SourceIcon type={source.type} />
              <div>
                <h2>{source.title}</h2>
                <p>
                  {source.filename} · {fileSize(source.size)}
                  {source.pages ? ` · ${source.pages} pages` : ''}
                </p>
              </div>
            </div>
            <div className="source-preview-label">
              <span>CONTENT PREVIEW</span>
              {source.type === 'pdf' && <span className="demo-tag">Demo excerpt</span>}
            </div>
            <div className="source-preview">
              <Markdown onOpen={openDocument} onSource={setSourceId} documents={snapshot.documents}>
                {source.excerpt}
              </Markdown>
            </div>
            <div className="section-heading">
              <h3>Connected notes</h3>
              <span>{source.documentIds.length}</span>
            </div>
            {source.documentIds.map((id) => (
              <button className="source-note-link" key={id} onClick={() => openDocument(id)}>
                <BookOpen size={16} />
                {snapshot.documents.find((d) => d.id === id)?.title}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog
        open={modal === 'search'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Find a connection"
        description="Search your notes or jump to another part of your workspace."
        className="search-dialog"
      >
        <div className="command-input">
          <Search size={19} />
          <input
            autoFocus
            placeholder="Search notes, ideas, and pages…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchIndex((i) => (i + 1) % Math.max(1, results.length));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex((i) => (i - 1 + results.length) % Math.max(1, results.length));
              }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                results[searchIndex]?.action();
              }
            }}
            aria-label="Search workspace"
          />
        </div>
        <div className="command-results">
          {results.map((result, index) => (
            <button
              ref={index === searchIndex ? searchSelection : undefined}
              key={`${result.detail}-${result.id}`}
              className={index === searchIndex ? 'command-selected' : ''}
              onMouseEnter={() => setSearchIndex(index)}
              onClick={result.action}
            >
              {result.icon}
              <span>
                {result.label}
                <small>{result.detail}</small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
          {!results.length && (
            <div className="empty-state">
              <Search />
              <p>No notes found. Try another idea.</p>
            </div>
          )}
        </div>
        <div className="command-footer">
          <span>↑ ↓ to explore</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'settings'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Make yourself at home"
        description="A few small things to make this space yours."
      >
        <div className="dialog-form">
          <div className="settings-section">
            <span className="tiny-label">APPEARANCE</span>
            <div className="theme-options">
              {(
                [
                  {
                    theme: 'light',
                    name: 'Daylight',
                    description: 'A clear, quiet canvas.',
                    icon: Sun,
                  },
                  {
                    theme: 'dark',
                    name: 'Evening',
                    description: 'A softer place after dark.',
                    icon: Moon,
                  },
                ] as const
              ).map((option) => (
                <button
                  className={snapshot.settings.theme === option.theme ? 'theme-selected' : ''}
                  key={option.theme}
                  onClick={() => void run(() => client.updateSettings({ theme: option.theme }))}
                >
                  <option.icon size={22} />
                  <strong>{option.name}</strong>
                  <span>{option.description}</span>
                  {snapshot.settings.theme === option.theme && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section settings-row">
            <div>
              <strong>Background processing</strong>
              <p>Simulate connecting imported sources to your wiki.</p>
            </div>
            <Button
              variant={snapshot.settings.workerPaused ? 'outline' : 'soft'}
              size="sm"
              onClick={() =>
                void run(() =>
                  client.updateSettings({ workerPaused: !snapshot.settings.workerPaused }),
                )
              }
            >
              {snapshot.settings.workerPaused ? 'Paused' : 'Running'}
            </Button>
          </div>
          <div className="about-demo">
            <span className="mini-logo">
              <Network size={17} />
            </span>
            <div>
              <strong>knoter · Frontend preview</strong>
              <p>
                Your changes stay in this browser. Chat and source processing are simulated; no LLM,
                vault, or background service is connected.
              </p>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'activity'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Your workspace, growing"
        description="A few things that have been taking shape."
      >
        <div className="activity-list">
          {snapshot.activities.map((item) => (
            <button
              key={item.id}
              disabled={!item.documentId}
              onClick={() => item.documentId && openDocument(item.documentId)}
            >
              <span className="activity-symbol">
                {item.kind === 'task' ? (
                  <CheckCheck size={18} />
                ) : item.kind === 'source' ? (
                  <Folder size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <time>{relativeTime(item.createdAt)}</time>
              </span>
              {item.documentId && <ChevronRight size={14} />}
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave this edit?"
        description="Your unsaved changes will be discarded. Your last saved version will stay as it is."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setLeaving(false)}>
            Keep editing
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
              setLeaving(false);
              setMobileNav(false);
              destination.current?.();
              destination.current = null;
            }}
          >
            Discard changes
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function StarGlyph() {
  return <Sparkles size={12} />;
}
