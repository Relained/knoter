import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Outlet, useBlocker, useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCheck,
  CircleHelp,
  FileText,
  Folder,
  Home,
  Loader2,
  Network,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { KnoterClient, View, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import {
  DEFAULT_SUPPLEMENT_RATIO,
  type GraphForces,
  type GraphView,
  type WindowCommand,
  type WindowFrame,
  type WindowState,
} from '@knoter/contracts/native';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { PopupWindow } from './components/ui/popup-window';
import { ContextPanel, type PanelTab } from './components/ContextPanel';
import { reviewCount } from './components/ChangesPanel';
import { AgentPanel } from './components/AgentPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { SettingsWindow, type SettingsSection } from './components/SettingsWindow';
import { RewriteDialog, rewriteRequest } from './components/RewriteDialog';
import type { ChatRequest } from './components/ChatPanel';
import { DocIcon, fileSize, relativeTime, SourceIcon } from './components/helpers';
import { Markdown } from './components/Markdown';
import type { RunAction } from './views/WikiView';
import { searchDocuments } from './views/HomeView';
import { createSampleFile, readImports } from './api';
import { exportMarkdown } from './api/export';
import { useNavigationHistory } from './components/useNavigationHistory';
import { SidebarResizeHandle } from './components/SidebarResizeHandle';
import { useWorkspaceRoute, type WorkspaceContext } from './routing/WorkspaceRoutes';
import { paths, routePath, type WorkspaceRoute } from './routing/paths';
import { buildWikiLinks } from './wiki/links';
import { DocumentActionsProvider, DocumentContextMenu } from './components/DocumentMenu';
import { copyDocumentLink } from './api/clipboard';
import { SourceEvidence } from './components/SourceEvidence';
import { TitleBar } from './shell/TitleBar';
import { StatusBar, type AgentStatus } from './shell/StatusBar';
import {
  eventBinding,
  formatBinding,
  resolveBindings,
  shortcutCommands,
  withShortcut,
  type ShortcutId,
} from './shell/shortcuts';

type Modal = 'import' | 'settings' | 'search' | 'activity' | 'trash' | 'sources' | 'agent';
const viewLabels: Record<View, string> = {
  home: 'Home',
  wiki: 'Wiki',
  graph: 'Graph',
  sources: 'Home',
  tasks: 'Tasks',
  calendar: 'Calendar',
};
const TITLEBAR_HEIGHT = 38;
const STATUSBAR_HEIGHT = 26;

export function App({ client }: { client: KnoterClient }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const [panel, setPanelVisible] = useState(() => window.innerWidth > 1050);
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [leftWidth, setLeftWidth] = useState(222);
  const [rightWidth, setRightWidth] = useState(340);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const layoutLoaded = useRef(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');
  const [deleteTarget, setDeleteTarget] = useState<WikiDocument | null>(null);
  const [rewriteId, setRewriteId] = useState<string | null>(null);
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const requestCounter = useRef(0);
  const [documentPending, setDocumentPending] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [windowState, setWindowState] = useState<WindowState | null>(null);
  const dirtyCheck = useRef<(() => boolean) | null>(null);
  const pendingEdit = useRef<string | null>(null);
  const setDirtyCheck = useCallback((check: (() => boolean) | null) => {
    dirtyCheck.current = check;
  }, []);
  const location = useLocation();
  const routerNavigate = useNavigate();
  const blocker = useBlocker(() => dirtyCheck.current?.() ?? false);
  const historyNav = useNavigationHistory();
  const { view, documentId, category = null, tag = null, focusId } = useWorkspaceRoute();
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
  const togglePanel = (tab: PanelTab) => {
    if (panel && panelTab === tab && !zenMode) return setPanel(false);
    setZenMode(false);
    setPanelTab(tab);
    if (!panel) setPanel(true);
  };
  const toggleNavigation = () => {
    if (viewportWidth <= 760) return setMobileNav(!mobileNav);
    setZenMode(false);
    setSidebarCompact(!sidebarCompact);
    void run(() => client.updateSettings({ leftSidebarCompact: !sidebarCompact }));
  };
  const toggleModal = (next: Modal) => setModal((current) => (current === next ? null : next));
  const openSearch = () => {
    setSearch('');
    setSearchIndex(0);
    toggleModal('search');
  };
  const openSettings = (section: SettingsSection = 'appearance') => {
    setSettingsSection(section);
    setModal((current) =>
      current === 'settings' && section === settingsSection ? null : 'settings',
    );
  };
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (!client.window) return;
    let active = true;
    const refresh = () =>
      void client.window!({ action: 'state' })
        .then((state) => active && setWindowState(state))
        .catch(() => undefined);
    refresh();
    window.addEventListener('resize', refresh);
    return () => {
      active = false;
      window.removeEventListener('resize', refresh);
    };
  }, [client]);
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
              setRightWidth(Math.max(280, Math.min(600, value.settings.rightSidebarWidth || 340)));
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
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyCheck.current?.()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  useEffect(() => {
    searchSelection.current?.scrollIntoView({ block: 'nearest' });
  }, [searchIndex]);
  useLayoutEffect(() => {
    setEditing(pendingEdit.current === location.pathname + location.search);
    pendingEdit.current = null;
    // `#/sources` opens the Sources window over the home page.
    setModal(view === 'sources' ? 'sources' : null);
    setSourceId(null);
    setMobileNav(false);
  }, [location.key, location.pathname, location.search]);
  const goTo = (route: WorkspaceRoute, edit = false) => {
    const to = routePath(route);
    if (to === location.pathname + location.search) {
      if (edit) setEditing(true);
      setModal(null);
      setSourceId(null);
      setMobileNav(false);
      return;
    }
    pendingEdit.current = edit ? to : null;
    void routerNavigate(to);
  };
  const afterDiscard = (action: () => void) => {
    if (dirtyCheck.current?.()) setPendingAction(() => action);
    else action();
  };
  const keepEditing = () => {
    if (blocker.state === 'blocked') blocker.reset();
    pendingEdit.current = null;
    setPendingAction(null);
  };
  const wikiLinks = useMemo(() => buildWikiLinks(snapshot?.documents || []), [snapshot?.documents]);
  const bindings = useMemo(
    () => resolveBindings(snapshot?.settings.shortcuts),
    [snapshot?.settings.shortcuts],
  );
  const tip = (label: string, id: ShortcutId) => withShortcut(label, bindings[id]);
  const openDocument = (id: string) => goTo({ view: 'wiki', documentId: id });
  const editDocument = (id: string) => {
    if (editing && documentId === id) return;
    goTo({ view: 'wiki', documentId: id }, true);
  };
  const restoreDocument = async (id: string) => {
    setDocumentPending(true);
    await run(
      () => client.restoreDocument(id),
      'Note restored with its connections and revision history.',
    );
    setDocumentPending(false);
  };
  const deleteDocument = async () => {
    if (!deleteTarget || documentPending) return;
    setDocumentPending(true);
    const id = deleteTarget.id;
    const success = await run(
      () => client.deleteDocument(id),
      'Note moved to Trash. You can restore it from the wiki.',
    );
    setDocumentPending(false);
    if (!success) return;
    setDeleteTarget(null);
    if (documentId === id || focusId === id) {
      // The dedicated delete dialog already confirmed discarding this draft.
      dirtyCheck.current = null;
      setEditing(false);
      void routerNavigate(documentId === id ? paths.wiki : paths.home, { replace: true });
    }
  };
  const openView = (next: View) => {
    if (next === 'sources') return setModal('sources');
    goTo({ view: next });
  };
  const createNote = () =>
    afterDiscard(() => {
      void run(async () => {
        const id = await client.createDocument();
        goTo({ view: 'wiki', documentId: id }, true);
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
      setModal('sources');
    }
  };
  const requestRewrite = (id: string) => {
    if (editing && documentId === id)
      return setToast({
        text: 'Save or cancel your edit before rewriting this note.',
        error: true,
      });
    setRewriteId(id);
  };
  const changeFrame = (frame: WindowFrame) =>
    afterDiscard(() => {
      dirtyCheck.current = null;
      void run(() => client.window!({ action: 'setFrame', frame }));
    });
  const windowCommand = (command: WindowCommand) =>
    command.action === 'close'
      ? afterDiscard(() => {
          dirtyCheck.current = null;
          void run(() => client.window!(command));
        })
      : void run(() => client.window!(command));
  const saveForces = useCallback(
    (forces: GraphForces) => void run(() => client.updateSettings({ graph: forces })),
    [client, run],
  );
  const saveGraphView = useCallback(
    (view: GraphView) => void run(() => client.updateSettings({ graphView: view })),
    [client, run],
  );

  const doc =
    snapshot && view === 'wiki' && documentId
      ? snapshot.documents.find((d) => d.id === documentId)
      : undefined;
  const focusDoc =
    snapshot && view === 'graph' && focusId
      ? snapshot.documents.find((d) => d.id === focusId)
      : undefined;

  // Shortcut actions read the latest state through a ref; the listener is registered once.
  const commandActions: Record<ShortcutId, () => void> = {
    search: openSearch,
    home: () => openView('home'),
    library: () => openView('wiki'),
    back: () => historyNav.canBack && historyNav.back(),
    forward: () => historyNav.canForward && historyNav.forward(),
    newNote: createNote,
    editNote: () => doc && editDocument(doc.id),
    rewriteNote: () => doc && requestRewrite(doc.id),
    localGraph: () => {
      const id = doc?.id ?? focusDoc?.id;
      if (id) goTo({ view: 'graph', focusId: id });
    },
    toggleNavigation,
    toggleChat: () => togglePanel('chat'),
    toggleChanges: () => togglePanel('changes'),
    zen: () => {
      setMobileNav(false);
      setZenMode(!zenMode);
    },
    openSources: () => toggleModal('sources'),
    openAgent: () => toggleModal('agent'),
    activity: () => toggleModal('activity'),
    settings: () => openSettings('appearance'),
    shortcuts: () => openSettings('shortcuts'),
  };
  const shortcutState = useRef({ bindings, commandActions });
  shortcutState.current = { bindings, commandActions };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Keys an editor or field already handled (bold, list indent, a recorder) stay there.
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const binding = eventBinding(event);
      if (!binding) return;
      const { bindings: current, commandActions: actions } = shortcutState.current;
      const command = shortcutCommands.find((c) => current[c.id] === binding);
      if (!command) return;
      event.preventDefault();
      actions[command.id]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!snapshot)
    return (
      <div className="app-loading">
        <Network size={32} />
        <span>Opening your workspace…</span>
        {toast && <p>{toast.text}</p>}
      </div>
    );
  const source = snapshot.sources.find((s) => s.id === sourceId);
  const rewriteDoc = snapshot.documents.find((d) => d.id === rewriteId) ?? null;
  const categories = [...new Set(snapshot.documents.map((d) => d.category))];
  const tagCounts = new Map<string, number>();
  for (const d of snapshot.documents)
    for (const t of d.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const navigation: {
    id: View;
    label: string;
    icon: typeof Home;
    count: number;
    shortcut: ShortcutId | null;
  }[] = [
    { id: 'home', label: 'Home', icon: Home, count: 0, shortcut: 'home' },
    {
      id: 'wiki',
      label: 'All notes',
      icon: BookOpen,
      count: snapshot.documents.length,
      shortcut: 'library',
    },
    // Tasks and calendar are simulated only in the browser preview.
    ...(client.mode === 'demo'
      ? [
          {
            id: 'tasks' as const,
            label: 'Tasks',
            icon: CheckCheck,
            count: snapshot.tasks.filter((t) => !t.done).length,
            shortcut: null,
          },
          {
            id: 'calendar' as const,
            label: 'Calendar',
            icon: CalendarDays,
            count: 0,
            shortcut: null,
          },
        ]
      : []),
  ];
  const activeNav = view === 'sources' ? 'home' : view === 'graph' ? 'home' : view;
  const searchResults = [
    ...searchDocuments(snapshot.documents, search, 7).map((d) => ({
      id: d.id,
      label: d.title,
      detail: d.category,
      hint: '',
      icon: <DocIcon doc={d} />,
      action: () => openDocument(d.id),
    })),
    ...shortcutCommands
      .filter(
        (c) =>
          c.id !== 'search' && (!search || c.label.toLowerCase().includes(search.toLowerCase())),
      )
      .map((c) => ({
        id: c.id,
        label: c.label,
        detail: c.group,
        hint: bindings[c.id] ? formatBinding(bindings[c.id]) : '',
        icon: <ArrowRight size={15} />,
        action: () => {
          setModal(null);
          commandActions[c.id]();
        },
      })),
  ];
  const chooseFiles = (items: File[]) => {
    setFiles((current) => [
      ...current,
      ...items.filter((file) => !current.some((f) => f.name === file.name && f.size === file.size)),
    ]);
  };
  const showTitleBar = !client.window || windowState?.frame === 'custom';
  const narrow = viewportWidth <= 760;
  const overlayPanel = viewportWidth <= 1050;
  const navWidth =
    narrow || zenMode
      ? 0
      : sidebarCompact
        ? 52
        : Math.min(leftWidth, viewportWidth - 360 - (panel && !overlayPanel ? 280 : 0));
  const contextWidth = Math.min(
    rightWidth,
    !overlayPanel ? viewportWidth - navWidth - 360 : viewportWidth - 24,
  );
  const leftMax = Math.min(380, viewportWidth - 360 - (panel && !overlayPanel ? contextWidth : 0));
  const rightMax = Math.min(
    600,
    !overlayPanel ? viewportWidth - navWidth - 360 : viewportWidth - 24,
  );
  const processing = snapshot.sources.filter((s) =>
    ['queued', 'extracting'].includes(s.status),
  ).length;
  const worker = snapshot.worker;
  const agentStatus: AgentStatus =
    client.mode === 'demo'
      ? snapshot.settings.workerPaused
        ? 'paused'
        : 'preview'
      : !worker?.connected
        ? 'offline'
        : worker.cli.status !== 'ready'
          ? 'attention'
          : snapshot.settings.workerPaused
            ? 'paused'
            : 'ready';
  const pendingReview = reviewCount(snapshot);
  const crumbs: { label: string; onClick?: () => void }[] =
    view === 'wiki'
      ? [
          { label: 'Wiki', onClick: () => openView('wiki') },
          ...(doc
            ? [
                {
                  label: doc.category,
                  onClick: () => goTo({ view: 'wiki', category: doc.category }),
                },
                { label: doc.title.split('/').at(-1)! },
              ]
            : category
              ? [{ label: category }]
              : tag
                ? [{ label: `#${tag}` }]
                : []),
        ]
      : view === 'graph'
        ? [
            { label: 'Home', onClick: () => openView('home') },
            { label: focusDoc ? `Graph · ${focusDoc.title.split('/').at(-1)}` : 'Graph' },
          ]
        : [{ label: viewLabels[view] }];
  const panelVisible = panel && !zenMode;

  const content = (
    <div
      className={`app-shell ${panelVisible ? 'has-panel' : ''} ${sidebarCompact ? 'sidebar-compact' : ''} ${zenMode ? 'zen-mode' : ''} ${showTitleBar ? 'has-titlebar' : ''}`}
      style={
        {
          '--nav-width': `${navWidth}px`,
          '--context-width': `${panelVisible && !overlayPanel ? contextWidth : 0}px`,
          '--overlay-width': `${contextWidth}px`,
          '--titlebar-height': `${showTitleBar ? TITLEBAR_HEIGHT : 0}px`,
          '--statusbar-height': `${STATUSBAR_HEIGHT}px`,
        } as CSSProperties
      }
    >
      {showTitleBar && (
        <TitleBar
          windowState={windowState}
          onWindow={windowCommand}
          title={doc?.title ?? (focusDoc ? `Graph · ${focusDoc.title}` : viewLabels[view])}
          workspace="Research space"
          onHome={() => openView('home')}
          onSearch={openSearch}
          searchBinding={bindings.search}
        />
      )}
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
        {!showTitleBar && (
          <>
            <button className="brand" onClick={() => openView('home')} title="knoter home">
              <Network size={17} strokeWidth={1.9} />
              <span>
                knoter<span className="brand-period">.</span>
              </span>
            </button>
            <button
              className="global-search"
              aria-label="Search notes and commands"
              title={tip('Search', 'search')}
              onClick={openSearch}
            >
              <Search size={14} />
              <span>Search</span>
              <kbd>{formatBinding(bindings.search)}</kbd>
            </button>
          </>
        )}
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
              key={item.id}
              aria-label={item.label}
              title={item.shortcut ? tip(item.label, item.shortcut) : item.label}
              aria-current={activeNav === item.id ? 'page' : undefined}
              onClick={() => openView(item.id)}
            >
              <item.icon size={16} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.count > 0 && <small>{item.count}</small>}
            </button>
          ))}
          <button
            className="nav-item"
            aria-label="New note"
            title={tip('New note', 'newNote')}
            onClick={createNote}
          >
            <Plus size={16} strokeWidth={1.8} />
            <span>New note</span>
          </button>
        </nav>
        <div className="sidebar-group">
          <div className="sidebar-label">
            PINNED
            <Sparkles size={11} />
          </div>
          {snapshot.documents
            .filter((d) => d.favorite)
            .map((d) => (
              <DocumentContextMenu doc={d} key={d.id}>
                <button
                  className={`sidebar-note ${doc?.id === d.id ? 'note-selected' : ''}`}
                  key={d.id}
                  title={d.title}
                  onClick={() => openDocument(d.id)}
                >
                  <DocIcon doc={d} size={13} />
                  <span>{d.title}</span>
                </button>
              </DocumentContextMenu>
            ))}
          {!snapshot.documents.some((d) => d.favorite) && (
            <p className="sidebar-empty">Star a note to pin it here.</p>
          )}
        </div>
        <div className="sidebar-group">
          <div className="sidebar-label">
            COLLECTIONS<span>{categories.length}</span>
          </div>
          {categories.map((name, i) => (
            <button
              className={`collection-link ${category === name ? 'note-selected' : ''}`}
              key={name}
              onClick={() => goTo({ view: 'wiki', category: name })}
            >
              <i className={`collection-dot dot-${i % 3}`} />
              <span>{name}</span>
              <small>{snapshot.documents.filter((d) => d.category === name).length}</small>
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-label">
              TAGS<span>{tags.length}</span>
            </div>
            {tags.slice(0, 12).map(([name, count]) => (
              <button
                className={`collection-link ${tag === name ? 'note-selected' : ''}`}
                key={name}
                onClick={() => goTo({ view: 'wiki', tag: name })}
              >
                <i className="tag-hash">#</i>
                <span>{name}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-bottom">
          <button aria-label="Trash" title="Trash" onClick={() => setModal('trash')}>
            <Trash2 size={15} />
            <span>Trash</span>
            {snapshot.trashedDocuments.length > 0 && (
              <small>{snapshot.trashedDocuments.length}</small>
            )}
          </button>
          <button
            aria-label="Settings"
            title={tip('Settings', 'settings')}
            onClick={() => openSettings('appearance')}
          >
            <Settings2 size={15} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main
        className="main-workspace"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length && client.mode === 'demo') {
            e.preventDefault();
            chooseFiles(Array.from(e.dataTransfer.files));
            setModal('import');
          }
        }}
      >
        <Outlet
          context={
            {
              snapshot,
              client,
              run,
              links: wikiLinks,
              editing,
              onEditing: (value) => {
                setEditing(value);
                if (!value) dirtyCheck.current = null;
              },
              onDirtyCheck: setDirtyCheck,
              onSource: setSourceId,
              onOpen: openDocument,
              onGraph: (id) => goTo({ view: 'graph', focusId: id }),
              onView: openView,
              onAsk: () => {
                setZenMode(false);
                setPanelTab('chat');
                if (!panel) setPanel(true);
              },
              onRewrite: requestRewrite,
              onNew: createNote,
              onTrash: () => setModal('trash'),
              onImport: () => setModal('import'),
              onRestore: restoreDocument,
              onForces: saveForces,
              onGraphView: saveGraphView,
              documentPending,
              rewriteBinding: bindings.rewriteNote,
            } satisfies WorkspaceContext
          }
        />
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
          titles={{ chat: tip('Chat', 'toggleChat'), changes: tip('Changes', 'toggleChanges') }}
          chatRequest={chatRequest}
          onChatRequestHandled={() => setChatRequest(null)}
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
      <StatusBar
        navCompact={sidebarCompact}
        onToggleNav={toggleNavigation}
        onMobileNav={() => setMobileNav(true)}
        history={historyNav}
        crumbs={crumbs}
        saveState={
          client.mode === 'connected' && !worker?.connected
            ? { label: 'Service offline · drafts retained', offline: true }
            : { label: 'Saved on this device', offline: false }
        }
        processing={processing}
        sourcesCount={snapshot.sources.length}
        agent={agentStatus}
        review={pendingReview}
        panel={panelVisible ? panelTab : null}
        zen={zenMode}
        titles={{
          nav: tip('Toggle navigation', 'toggleNavigation'),
          back: tip('Go back', 'back'),
          forward: tip('Go forward', 'forward'),
          sources: tip('Sources', 'openSources'),
          agent: tip('Agent', 'openAgent'),
          activity: tip('Activity', 'activity'),
          chat: tip('Chat', 'toggleChat'),
          changes: tip('Changes', 'toggleChanges'),
          zen: tip(zenMode ? 'Exit Zen mode' : 'Zen mode — focus on the main view', 'zen'),
        }}
        onSources={() => toggleModal('sources')}
        onAgent={() => toggleModal('agent')}
        onActivity={() => toggleModal('activity')}
        onToggleChat={() => togglePanel('chat')}
        onToggleChanges={() => togglePanel('changes')}
        onZen={() => {
          setMobileNav(false);
          setZenMode(!zenMode);
        }}
      />
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'toast-error' : ''}`}
        >
          {toast.error ? <CircleHelp size={16} /> : <Check size={16} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <PopupWindow
        open={modal === 'sources'}
        onOpenChange={(open) => {
          if (open) return;
          setModal(null);
          if (view === 'sources') void routerNavigate(paths.home, { replace: true });
        }}
        title="Sources"
        icon={<Folder size={14} />}
        description="Watched folders, imported notes, and their processing status."
        className="sources-window"
      >
        <SourcesPanel
          snapshot={snapshot}
          client={client}
          run={run}
          onImport={() => setModal('import')}
          onSource={setSourceId}
          onOpen={openDocument}
        />
      </PopupWindow>

      <PopupWindow
        open={modal === 'agent'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Agent"
        icon={<Bot size={14} />}
        description="The background service, the worker CLI, its queue, and backups."
        className="agent-window"
      >
        <AgentPanel
          snapshot={snapshot}
          client={client}
          run={run}
          onOpenChanges={() => {
            setModal(null);
            setZenMode(false);
            setPanelTab('changes');
            if (!panel) setPanel(true);
          }}
        />
      </PopupWindow>

      <SettingsWindow
        open={modal === 'settings'}
        section={settingsSection}
        onSection={setSettingsSection}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        snapshot={snapshot}
        client={client}
        run={run}
        frame={client.window ? (windowState?.frame ?? null) : null}
        onFrame={changeFrame}
      />

      <RewriteDialog
        doc={rewriteDoc}
        defaultRatio={snapshot.settings.supplementRatio ?? DEFAULT_SUPPLEMENT_RATIO}
        simulated={client.mode === 'demo' || !!snapshot.chat?.simulated}
        onClose={() => setRewriteId(null)}
        onRewrite={(target, ratio, remember) => {
          setRewriteId(null);
          if (remember) void run(() => client.updateSettings({ supplementRatio: ratio }));
          setZenMode(false);
          setPanelTab('chat');
          if (!panel) setPanel(true);
          setChatRequest({
            id: ++requestCounter.current,
            text: rewriteRequest(target, ratio),
            documentIds: [target.id],
            supplementRatio: ratio,
          });
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !documentPending) setDeleteTarget(null);
        }}
        title="Move note to Trash?"
        description="You can restore it later. Original source files and saved revisions will be kept."
      >
        <div className="delete-note-summary">
          <Trash2 size={20} />
          <strong>{deleteTarget?.title}</strong>
        </div>
        {editing && deleteTarget?.id === documentId && (
          <p className="delete-draft-warning">
            Your unsaved edits will be discarded. The last saved version will be kept in Trash.
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="ghost" disabled={documentPending} onClick={() => setDeleteTarget(null)}>
            Keep note
          </Button>
          <Button
            className="destructive-button"
            disabled={documentPending}
            onClick={() => void deleteDocument()}
          >
            {documentPending ? <Loader2 className="spin" /> : <Trash2 />}Move to Trash
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'trash'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Trash"
        description="Deleted notes stay here until you restore them. Sources and revision history are preserved."
      >
        <div className="trash-list">
          {snapshot.trashedDocuments.map((item) => (
            <div className="trash-row" key={item.id}>
              <DocIcon doc={item} size={18} />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.category} · {item.deletedBy === 'knoter' ? 'Moved by knoter' : 'Deleted'}{' '}
                  {relativeTime(item.deletedAt)}
                  {item.trashReason ? ` · ${item.trashReason}` : ''}
                </small>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Restore ${item.title}`}
                disabled={documentPending}
                onClick={() => void restoreDocument(item.id)}
              >
                <Undo2 />
                Restore
              </Button>
            </div>
          ))}
          {!snapshot.trashedDocuments.length && (
            <div className="empty-state">
              <Trash2 />
              <h3>Trash is empty</h3>
              <p>Deleted notes will appear here.</p>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={modal === 'import'}
        onOpenChange={(open) => {
          if (!open && !importing) setModal(null);
        }}
        title="Bring your sources together"
        description="Add a paper, a thought, or the start of something new."
      >
        <div className="dialog-form">
          {client.mode === 'connected' ? (
            <>
              <p>
                Choose a Markdown folder to watch, or import original bytes once. Files stay
                untouched. Maximum 256 KiB per UTF-8 .md file.
              </p>
              <Button
                onClick={() =>
                  void run(async () => {
                    await client.desktop!('chooseFolder');
                    setModal('sources');
                  })
                }
              >
                Watch a Markdown folder
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    await client.desktop!('importMarkdown');
                    setModal('sources');
                  })
                }
              >
                Import Markdown snapshots
              </Button>
            </>
          ) : (
            <>
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
                <UploadCloud size={28} />
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
                        size="icon-sm"
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
                  In this demo, processing is simulated. Text notes are kept in your browser; PDFs
                  are represented by their filename.
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
                <Button
                  disabled={!files.length || importing}
                  onClick={() => void importFiles(files)}
                >
                  {importing ? <Loader2 className="spin" /> : <Plus />}Add {files.length || ''}{' '}
                  source
                  {files.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
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
            {client.mode === 'connected' && (
              <SourceEvidence
                key={source.id}
                source={source}
                snapshot={snapshot}
                client={client}
                run={run}
              />
            )}
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
        description="Search your notes or run a command."
        className="search-dialog"
      >
        <div className="command-input">
          <Search size={17} />
          <input
            autoFocus
            placeholder="Search notes, or type a command…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchIndex((i) => (i + 1) % Math.max(1, searchResults.length));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex(
                  (i) => (i - 1 + searchResults.length) % Math.max(1, searchResults.length),
                );
              }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                searchResults[searchIndex]?.action();
              }
            }}
            aria-label="Search workspace"
          />
        </div>
        <div className="command-results">
          {searchResults.map((result, index) => (
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
              {result.hint ? <kbd>{result.hint}</kbd> : <ArrowRight size={14} />}
            </button>
          ))}
          {!searchResults.length && (
            <div className="empty-state">
              <Search />
              <p>No notes or commands found. Try another idea.</p>
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
                  <CheckCheck size={16} />
                ) : item.kind === 'source' ? (
                  <Folder size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <time>{relativeTime(item.createdAt)}</time>
              </span>
              {item.documentId && <ArrowRight size={13} />}
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={blocker.state === 'blocked' || pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) keepEditing();
        }}
        title="Leave this edit?"
        description="Your unsaved changes will be discarded. Your last saved version will stay as it is."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={keepEditing}>
            Keep editing
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
              dirtyCheck.current = null;
              setMobileNav(false);
              if (blocker.state === 'blocked') blocker.proceed();
              const action = pendingAction;
              setPendingAction(null);
              action?.();
            }}
          >
            Discard changes
          </Button>
        </div>
      </Dialog>
    </div>
  );
  return (
    <DocumentActionsProvider
      value={{
        open: openDocument,
        edit: editDocument,
        rewrite: requestRewrite,
        favorite: (id) => void run(() => client.toggleFavorite(id)),
        graph: (id) => goTo({ view: 'graph', focusId: id }),
        copyLink: (id) => void run(() => copyDocumentLink(id), 'Note link copied.'),
        export: exportMarkdown,
        delete: setDeleteTarget,
      }}
    >
      {content}
    </DocumentActionsProvider>
  );
}
