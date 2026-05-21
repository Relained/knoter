import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppMenu } from "./components/AppMenu";
import { CommandPalette } from "./components/CommandPalette";
import { EdgePreview } from "./components/EdgePreview";
import { FloatingWindow } from "./components/FloatingWindow";
import { Sidebar } from "./components/Sidebar";
import { TabPlacementPreview } from "./components/TabPlacementPreview";
import { WorkspacePane } from "./components/WorkspacePane";
import { createWorkspaceCommands } from "./commands/workspaceCommands";
import type { Command } from "./commands/types";
import { getPaneIdsFromLayout } from "./domain/workspace";
import { getSelectedSidebarExplorerLayers } from "./sidebar/explorerModel";
import type { SidebarExplorerEntry } from "./sidebar/explorerModel";
import type { ExplorerItem } from "./api/types";
import type {
  EdgePosition,
  EdgePreviewModel,
  FloatingWindowModel,
  LayoutNode,
  Pane,
  SplitDirection,
  TabPlacementPreviewModel,
  WorkspaceObjectKey,
  WorkspaceObjectState,
  WorkspaceObjectStates
} from "./domain/types";
import { loadWorkspaceState, saveWorkspaceState } from "./state/persistence";
import { globalSettingsChangedEvent, globalSettingsStorageKey, loadGlobalSettings, normalizeGlobalSettings, saveGlobalSettings } from "./settings/preferences";
import type { GlobalSettings } from "./settings/preferences";
import type { GlobalSettingsRecord } from "./settings/preferences";
import { installGlobalConfigRuntime } from "./settings/runtime";
import { workspaceReducer } from "./state/workspaceReducer";
import { installThemeHarness } from "./theming/runtime";
import { installIconRuntime } from "./icons/runtime";
import { createCommandLookup, defaultKeybindings, findMatchingKeybinding, shouldPreventDefault } from "./keybindings";
import "./styles/index.css";

function App() {
  useEffect(() => {
    installThemeHarness();
    installIconRuntime();
    installGlobalConfigRuntime();
  }, []);

  const [initialGlobalSettings] = useState(loadGlobalSettings);
  const [workspaceState, dispatchWorkspace] = useReducer(workspaceReducer, undefined, () => loadWorkspaceState());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialGlobalSettings.sidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(initialGlobalSettings.sidebarWidth);
  const [base16ThemeId, setBase16ThemeId] = useState(initialGlobalSettings.base16ThemeId);
  const [iconThemeId, setIconThemeId] = useState(initialGlobalSettings.iconThemeId);
  const [uiFontFamily, setUiFontFamily] = useState(initialGlobalSettings.uiFontFamily);
  const [uiFontSize, setUiFontSize] = useState(initialGlobalSettings.uiFontSize);
  const [editorFontFamily, setEditorFontFamily] = useState(initialGlobalSettings.editorFontFamily);
  const [editorFontSize, setEditorFontSize] = useState(initialGlobalSettings.editorFontSize);
  const [fontStacks, setFontStacks] = useState(initialGlobalSettings.fontStacks);
  const [motionScale, setMotionScale] = useState(initialGlobalSettings.motionScale);
  const [keybindingProfile, setKeybindingProfile] = useState(initialGlobalSettings.keybindingProfile);
  const [edgePreview, setEdgePreview] = useState<EdgePreviewModel | null>(null);
  const [tabPlacementPreview, setTabPlacementPreview] = useState<TabPlacementPreviewModel | null>(null);
  const [workspacePersistenceWarning, setWorkspacePersistenceWarning] = useState(false);
  const [settingsPersistenceWarning, setSettingsPersistenceWarning] = useState(false);
  const [explorerItems, setExplorerItems] = useState<ExplorerItem[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerRefreshNonce, setExplorerRefreshNonce] = useState(0);
  const globalSettingsChangedRef = useRef(false);
  const {
    menuPosition,
    sidebarExplorerFilters,
    panesById,
    layoutTree,
    objectStates,
    activePaneId,
    floatingWindows,
    activeFloatingWindowId
  } = workspaceState;

  const paneIds = useMemo(() => getPaneIdsFromLayout(layoutTree), [layoutTree]);
  const panes = useMemo(() => paneIds.map((paneId) => panesById[paneId]).filter(Boolean), [paneIds, panesById]);
  const activePane = activePaneId ? panesById[activePaneId] ?? panes[0] : panes[0];
  const workspaceSnapshot = useMemo(
    () => ({
      ...workspaceState,
      activePaneId: activePane?.id ?? null
    }),
    [activePane?.id, workspaceState]
  );
  const globalSettingsSnapshot = useMemo(
    () => ({
      sidebarCollapsed,
      sidebarWidth,
      base16ThemeId,
      iconThemeId,
      uiFontFamily,
      uiFontSize,
      editorFontFamily,
      editorFontSize,
      fontStacks,
      motionScale,
      keybindingProfile
    }),
    [
      base16ThemeId,
      editorFontFamily,
      editorFontSize,
      fontStacks,
      iconThemeId,
      keybindingProfile,
      motionScale,
      sidebarCollapsed,
      sidebarWidth,
      uiFontFamily,
      uiFontSize
    ]
  );

  useEffect(() => {
    if (!activePaneId && panes[0]) dispatchWorkspace({ type: "ensureActivePane" });
  }, [activePaneId, panes]);

  useEffect(() => {
    const api = window.knoterApi;
    if (!api) return;

    let cancelled = false;
    const layers = getSelectedSidebarExplorerLayers(sidebarExplorerFilters);
    setExplorerLoading(true);
    api.explorer.list({ layers })
      .then((items) => {
        if (!cancelled) setExplorerItems(items);
      })
      .catch(() => {
        if (!cancelled) setExplorerItems([]);
      })
      .finally(() => {
        if (!cancelled) setExplorerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sidebarExplorerFilters, explorerRefreshNonce]);

  useEffect(() => {
    const constrainWindows = () => {
      dispatchWorkspace({ type: "constrainFloatingWindows" });
    };

    window.addEventListener("resize", constrainWindows);
    return () => window.removeEventListener("resize", constrainWindows);
  }, []);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      const saved = saveWorkspaceState(workspaceSnapshot);
      setWorkspacePersistenceWarning(!saved);
    }, 180);

    return () => window.clearTimeout(saveTimer);
  }, [workspaceSnapshot]);

  useEffect(() => {
    if (!globalSettingsChangedRef.current) return;

    const saveTimer = window.setTimeout(() => {
      const saved = saveGlobalSettings(globalSettingsSnapshot);
      setSettingsPersistenceWarning(!saved);
      if (saved) globalSettingsChangedRef.current = false;
    }, 180);

    return () => window.clearTimeout(saveTimer);
  }, [globalSettingsSnapshot]);

  useEffect(() => {
    const flushWorkspaceState = () => {
      saveWorkspaceState(workspaceSnapshot);
    };

    window.addEventListener("pagehide", flushWorkspaceState);
    window.addEventListener("beforeunload", flushWorkspaceState);
    return () => {
      window.removeEventListener("pagehide", flushWorkspaceState);
      window.removeEventListener("beforeunload", flushWorkspaceState);
    };
  }, [workspaceSnapshot]);

  useEffect(() => {
    const flushGlobalSettings = () => {
      if (globalSettingsChangedRef.current) saveGlobalSettings(globalSettingsSnapshot);
    };

    window.addEventListener("pagehide", flushGlobalSettings);
    window.addEventListener("beforeunload", flushGlobalSettings);
    return () => {
      window.removeEventListener("pagehide", flushGlobalSettings);
      window.removeEventListener("beforeunload", flushGlobalSettings);
    };
  }, [globalSettingsSnapshot]);

  useEffect(() => {
    applyGlobalSettingsRuntime(globalSettingsSnapshot);
  }, [globalSettingsSnapshot]);

  useEffect(() => {
    const syncGlobalSettings = (event: Event) => {
      const record = (event as CustomEvent<GlobalSettingsRecord>).detail;
      globalSettingsChangedRef.current = false;
      setSidebarCollapsed(record.current.sidebarCollapsed);
      setSidebarWidth(record.current.sidebarWidth);
      setBase16ThemeId(record.current.base16ThemeId);
      setIconThemeId(record.current.iconThemeId);
      setUiFontFamily(record.current.uiFontFamily);
      setUiFontSize(record.current.uiFontSize);
      setEditorFontFamily(record.current.editorFontFamily);
      setEditorFontSize(record.current.editorFontSize);
      setFontStacks(record.current.fontStacks);
      setMotionScale(record.current.motionScale);
      setKeybindingProfile(record.current.keybindingProfile);
      setSettingsPersistenceWarning(false);
    };
    const syncStoredGlobalSettings = (event: StorageEvent) => {
      if (event.key !== globalSettingsStorageKey) return;
      const settings = loadGlobalSettings();
      globalSettingsChangedRef.current = false;
      setSidebarCollapsed(settings.sidebarCollapsed);
      setSidebarWidth(settings.sidebarWidth);
      setBase16ThemeId(settings.base16ThemeId);
      setIconThemeId(settings.iconThemeId);
      setUiFontFamily(settings.uiFontFamily);
      setUiFontSize(settings.uiFontSize);
      setEditorFontFamily(settings.editorFontFamily);
      setEditorFontSize(settings.editorFontSize);
      setFontStacks(settings.fontStacks);
      setMotionScale(settings.motionScale);
      setKeybindingProfile(settings.keybindingProfile);
      setSettingsPersistenceWarning(false);
    };

    window.addEventListener(globalSettingsChangedEvent, syncGlobalSettings);
    window.addEventListener("storage", syncStoredGlobalSettings);
    return () => {
      window.removeEventListener(globalSettingsChangedEvent, syncGlobalSettings);
      window.removeEventListener("storage", syncStoredGlobalSettings);
    };
  }, []);

  const actions = useMemo(
    () => ({
      openPalette: () => setPaletteOpen(true),
      newTab: () => {
        if (activePane) dispatchWorkspace({ type: "newTab", paneId: activePane.id });
      },
      openNote: (noteKey: string) => {
        if (activePane) dispatchWorkspace({ type: "openNote", paneId: activePane.id, noteKey });
      },
      splitSmart: () => splitActivePane(getSmartSplitDirection(activePaneId)),
      newFloating: (objectKey = "Dashboard") => openFloatingWindow(objectKey),
      openSettings: () => openFloatingWindow("Settings"),
      openObject: (objectKey: string) => openFloatingWindow(objectKey),
      floatActivePane: () => {
        if (activePane) dispatchWorkspace({ type: "floatPane", paneId: activePane.id });
      },
      closePane: () => closePane(activePane?.id),
      moveActivePaneToolbar: () => movePaneToolbar(activePane?.id),
      cycleMenu: () => {
        dispatchWorkspace({ type: "cycleMenuPosition" });
      },
      cycleTheme: () => {
        window.knoterTheme?.cycleBase16Theme({ persist: true });
      }
    }),
    [activePane, activePaneId]
  );

  const commands = useMemo<Command[]>(
    () => createWorkspaceCommands({ ...actions, closeTopFloatingWindow }, objectStates),
    [actions, closeTopFloatingWindow, objectStates]
  );
  const commandLookup = useMemo(() => createCommandLookup(commands), [commands]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = findMatchingKeybinding(event, defaultKeybindings);
      if (!binding) return;

      const command = commandLookup.get(binding.commandId);
      if (!command) return;

      if (shouldPreventDefault(binding)) event.preventDefault();
      command.run();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandLookup]);

  function movePaneToolbar(paneId: string | undefined) {
    if (!paneId) return;
    dispatchWorkspace({ type: "movePaneToolbar", paneId });
  }

  function setPaneToolbarPosition(paneId: string, position: EdgePosition) {
    dispatchWorkspace({ type: "setPaneToolbarPosition", paneId, position });
  }

  function moveFloatingToolbar(windowId: string) {
    dispatchWorkspace({ type: "moveFloatingToolbar", windowId });
  }

  function setFloatingToolbarPosition(windowId: string, position: EdgePosition) {
    dispatchWorkspace({ type: "setFloatingToolbarPosition", windowId, position });
  }

  function selectTab(paneId: string, tabId: string) {
    dispatchWorkspace({ type: "selectTab", paneId, tabId });
  }

  function closeTab(paneId: string, tabId: string) {
    dispatchWorkspace({ type: "closeTab", paneId, tabId });
  }

  function closePane(paneId: string | undefined) {
    if (!paneId) return;
    dispatchWorkspace({ type: "closePane", paneId });
  }

  function splitActivePane(direction: SplitDirection) {
    const targetPaneId = activePaneId;
    if (!targetPaneId) return;
    dispatchWorkspace({ type: "splitActivePane", targetPaneId, direction });
  }

  function getSmartSplitDirection(paneId: string | null) {
    const paneElement = paneId ? document.querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`) : null;
    const rect = paneElement?.getBoundingClientRect();
    if (rect) return rect.width >= rect.height ? "horizontal" : "vertical";
    return window.innerWidth >= window.innerHeight ? "horizontal" : "vertical";
  }

  function splitTabToPane(sourcePaneId: string, tabId: string, edge: EdgePosition, targetPaneId: string | null = sourcePaneId) {
    dispatchWorkspace({ type: "splitTabToPane", sourcePaneId, tabId, edge, targetPaneId });
  }

  function moveTabToPane(
    sourcePaneId: string,
    tabId: string,
    targetPaneId: string,
    targetTabId: string,
    placement: "before" | "after"
  ) {
    dispatchWorkspace({ type: "moveTabToPane", sourcePaneId, tabId, targetPaneId, targetTabId, placement });
  }

  function openFloatingWindow(objectKey = "Dashboard") {
    dispatchWorkspace({ type: "openFloatingWindow", objectKey });
  }

  async function openExplorerItem(entry: SidebarExplorerEntry) {
    if (entry.noteKey) {
      actions.openNote(entry.noteKey);
      return;
    }
    if (!entry.path || !window.knoterApi || !activePane) return;

    try {
      const document = await window.knoterApi.explorer.read({ path: entry.path });
      dispatchWorkspace({
        type: "setObjectState",
        objectKey: "Vault Document",
        state: {
          kind: "note",
          title: document.title,
          path: document.path,
          content: formatVaultDocumentContent(document.title, document.path, document.content),
          mode: "split"
        }
      });
      dispatchWorkspace({ type: "openObjectInPane", paneId: activePane.id, objectKey: "Vault Document", title: document.title });
    } catch (error) {
      dispatchWorkspace({
        type: "setObjectState",
        objectKey: "Vault Document",
        state: {
          kind: "note",
          title: entry.title,
          path: entry.path,
          content: `# ${entry.title}\n\nUnable to load ${entry.path}.\n\n${error instanceof Error ? error.message : String(error)}`,
          mode: "preview"
        }
      });
      dispatchWorkspace({ type: "openObjectInPane", paneId: activePane.id, objectKey: "Vault Document", title: entry.title });
    }
  }

  function openObjectTarget(objectKey: WorkspaceObjectKey, target: "pane" | "floating") {
    if (target === "floating" || !activePane) {
      openFloatingWindow(objectKey);
      return;
    }
    dispatchWorkspace({ type: "openObjectInPane", paneId: activePane.id, objectKey });
  }

  function dockFloatingWindow(windowId: string) {
    dispatchWorkspace({ type: "dockFloatingWindow", windowId });
  }

  function closeFloatingWindow(windowId: string) {
    dispatchWorkspace({ type: "closeFloatingWindow", windowId });
  }

  function closeTopFloatingWindow() {
    dispatchWorkspace({ type: "closeTopFloatingWindow" });
  }

  function updateFloatingWindow(windowId: string, patch: Partial<FloatingWindowModel>) {
    dispatchWorkspace({ type: "updateFloatingWindow", windowId, patch });
  }

  function focusFloatingWindow(windowId: string) {
    dispatchWorkspace({ type: "focusFloatingWindow", windowId });
  }

  function changeObjectState(objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) {
    dispatchWorkspace({ type: "setObjectState", objectKey, state });
  }

  function toggleSidebar() {
    globalSettingsChangedRef.current = true;
    setSidebarCollapsed((current) => !current);
  }

  function resizeSidebar(width: number) {
    globalSettingsChangedRef.current = true;
    setSidebarWidth(width);
  }

  function changeGlobalSettings(patch: Partial<GlobalSettings>) {
    const nextSettings = normalizeGlobalSettings({ ...globalSettingsSnapshot, ...patch });
    globalSettingsChangedRef.current = true;
    setSidebarCollapsed(nextSettings.sidebarCollapsed);
    setSidebarWidth(nextSettings.sidebarWidth);
    setBase16ThemeId(nextSettings.base16ThemeId);
    setIconThemeId(nextSettings.iconThemeId);
    setUiFontFamily(nextSettings.uiFontFamily);
    setUiFontSize(nextSettings.uiFontSize);
    setEditorFontFamily(nextSettings.editorFontFamily);
    setEditorFontSize(nextSettings.editorFontSize);
    setFontStacks(nextSettings.fontStacks);
    setMotionScale(nextSettings.motionScale);
    setKeybindingProfile(nextSettings.keybindingProfile);
  }

  return (
    <>
      <div
        className="app-shell"
        data-menu-position={menuPosition}
        data-sidebar-collapsed={sidebarCollapsed}
        style={{ "--sidebar-resized-size": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <AppMenu
          menuPosition={menuPosition}
          sidebarCollapsed={sidebarCollapsed}
          actions={actions}
          onToggleSidebar={toggleSidebar}
          onSetMenuPosition={(position) => dispatchWorkspace({ type: "setMenuPosition", position })}
          onPreviewEdge={setEdgePreview}
        />
        {!sidebarCollapsed && (
          <Sidebar
            activePane={activePane}
            openNote={actions.openNote}
            openExplorerItem={openExplorerItem}
            explorerFilters={sidebarExplorerFilters}
            explorerItems={explorerItems}
            explorerLoading={explorerLoading}
            objectStates={objectStates}
            onResize={resizeSidebar}
            onChangeExplorerFilter={(layer, checked) => dispatchWorkspace({ type: "setSidebarExplorerFilter", layer, checked })}
            onRefreshExplorer={() => setExplorerRefreshNonce((value) => value + 1)}
            actions={actions}
          />
        )}
        <main className="workspace-main">
          <TilingWorkspace
            node={layoutTree}
            panesById={panesById}
            activePaneId={activePane?.id}
            canClose={paneIds.length > 1}
            onActivatePane={(paneId) => dispatchWorkspace({ type: "activatePane", paneId })}
            onMoveToolbar={movePaneToolbar}
            onSetToolbarPosition={setPaneToolbarPosition}
            onPreviewEdge={setEdgePreview}
            onPreviewTabPlacement={setTabPlacementPreview}
            onFloatPane={(pane) => dispatchWorkspace({ type: "floatPane", paneId: pane.id })}
            onClosePane={closePane}
            onSelectTab={selectTab}
            onCloseTab={closeTab}
            onSplitTab={splitTabToPane}
            onMoveTab={moveTabToPane}
            objectStates={objectStates}
            settings={globalSettingsSnapshot}
            onChangeSettings={changeGlobalSettings}
            onChangeObjectState={changeObjectState}
            onOpenObject={openObjectTarget}
          />
        </main>
      </div>

      <div className="floating-layer" aria-live="polite">
        {floatingWindows.map((win) => (
          <FloatingWindow
            key={win.id}
            win={win}
            active={win.id === activeFloatingWindowId}
            onFocus={() => focusFloatingWindow(win.id)}
            onMoveToolbar={() => moveFloatingToolbar(win.id)}
            onSetToolbarPosition={(position) => setFloatingToolbarPosition(win.id, position)}
            onPreviewEdge={setEdgePreview}
            onDock={() => dockFloatingWindow(win.id)}
            onClose={() => closeFloatingWindow(win.id)}
            onChange={(patch) => updateFloatingWindow(win.id, patch)}
            objectStates={objectStates}
            settings={globalSettingsSnapshot}
            onChangeSettings={changeGlobalSettings}
            onChangeObjectState={changeObjectState}
            onOpenObject={openObjectTarget}
          />
        ))}
      </div>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {edgePreview && <EdgePreview preview={edgePreview} />}
      {tabPlacementPreview && <TabPlacementPreview preview={tabPlacementPreview} />}
      {(workspacePersistenceWarning || settingsPersistenceWarning) && (
        <div className="persistence-warning">Workspace state or preferences are not being saved.</div>
      )}
    </>
  );
}

type TilingWorkspaceProps = {
  node: LayoutNode | null;
  panesById: Record<string, Pane>;
  activePaneId: string | undefined;
  canClose: boolean;
  onActivatePane: (paneId: string) => void;
  onMoveToolbar: (paneId: string) => void;
  onSetToolbarPosition: (paneId: string, position: EdgePosition) => void;
  onPreviewEdge: (preview: EdgePreviewModel | null) => void;
  onPreviewTabPlacement: (preview: TabPlacementPreviewModel | null) => void;
  onFloatPane: (pane: Pane) => void;
  onClosePane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onSplitTab: (sourcePaneId: string, tabId: string, edge: EdgePosition, targetPaneId: string | null) => void;
  onMoveTab: (sourcePaneId: string, tabId: string, targetPaneId: string, targetTabId: string, placement: "before" | "after") => void;
  objectStates: WorkspaceObjectStates;
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
  onChangeObjectState: (objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) => void;
  onOpenObject: (objectKey: WorkspaceObjectKey, target: "pane" | "floating") => void;
};

function TilingWorkspace({
  node,
  panesById,
  activePaneId,
  canClose,
  onActivatePane,
  onMoveToolbar,
  onSetToolbarPosition,
  onPreviewEdge,
  onPreviewTabPlacement,
  onFloatPane,
  onClosePane,
  onSelectTab,
  onCloseTab,
  onSplitTab,
  onMoveTab,
  objectStates,
  settings,
  onChangeSettings,
  onChangeObjectState,
  onOpenObject
}: TilingWorkspaceProps) {
  if (!node) return null;

  if (node.type === "leaf") {
    const pane = panesById[node.paneId];
    if (!pane) return null;

    return (
      <div className="tiling-root-leaf">
        <WorkspacePane
          pane={pane}
          active={pane.id === activePaneId}
          canClose={canClose}
          onActivate={() => onActivatePane(pane.id)}
          onMoveToolbar={() => onMoveToolbar(pane.id)}
          onSetToolbarPosition={(position) => onSetToolbarPosition(pane.id, position)}
          onPreviewEdge={onPreviewEdge}
          onPreviewTabPlacement={onPreviewTabPlacement}
          onFloat={() => onFloatPane(pane)}
          onClosePane={() => onClosePane(pane.id)}
          onSelectTab={(tabId) => onSelectTab(pane.id, tabId)}
          onCloseTab={(tabId) => onCloseTab(pane.id, tabId)}
          onSplitTab={(tabId, edge, targetPaneId) => onSplitTab(pane.id, tabId, edge, targetPaneId)}
          onMoveTab={(tabId, targetPaneId, targetTabId, placement) => onMoveTab(pane.id, tabId, targetPaneId, targetTabId, placement)}
          objectStates={objectStates}
          settings={settings}
          onChangeSettings={onChangeSettings}
          onChangeObjectState={onChangeObjectState}
          onOpenObject={onOpenObject}
        />
      </div>
    );
  }

  return (
    <div className={`tiling-split tiling-${node.direction}`}>
      {node.children.map((child, index) => (
        <div className="tiling-child" style={{ flexGrow: node.sizes?.[index] ?? 1 }} key={layoutNodeKey(child, index)}>
          <TilingWorkspace
            node={child}
            panesById={panesById}
            activePaneId={activePaneId}
            canClose={canClose}
            onActivatePane={onActivatePane}
            onMoveToolbar={onMoveToolbar}
            onSetToolbarPosition={onSetToolbarPosition}
            onPreviewEdge={onPreviewEdge}
            onPreviewTabPlacement={onPreviewTabPlacement}
            onFloatPane={onFloatPane}
            onClosePane={onClosePane}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onSplitTab={onSplitTab}
            onMoveTab={onMoveTab}
            objectStates={objectStates}
            settings={settings}
            onChangeSettings={onChangeSettings}
            onChangeObjectState={onChangeObjectState}
            onOpenObject={onOpenObject}
          />
        </div>
      ))}
    </div>
  );
}

function layoutNodeKey(node: LayoutNode, index: number) {
  return node.type === "leaf" ? node.paneId : `${node.direction}-${index}`;
}

function formatVaultDocumentContent(title: string, path: string, content: string) {
  return `# ${title}\n\n${path}\n\n${content}`;
}

function applyGlobalSettingsRuntime(settings: GlobalSettings) {
  const theme = window.knoterTheme?.getBuiltInBase16Themes().find((scheme) => scheme.id === settings.base16ThemeId);
  if (theme) window.knoterTheme?.loadBase16Theme(theme, { persist: false });

  const iconThemes = window.knoterIcons?.getBuiltInIconThemes();
  const iconTheme = iconThemes ? Object.values(iconThemes).find((theme) => theme.id === settings.iconThemeId) : null;
  if (iconTheme) window.knoterIcons?.loadIconTheme(iconTheme, { persist: false });

  const scale = Math.min(Math.max(settings.motionScale, 0), 2);
  const root = document.documentElement;
  root.style.setProperty("--motion-instant", `${Math.round(80 * scale)}ms`);
  root.style.setProperty("--motion-fast", `${Math.round(140 * scale)}ms`);
  root.style.setProperty("--motion-medium", `${Math.round(220 * scale)}ms`);
  root.style.setProperty("--motion-slow", `${Math.round(360 * scale)}ms`);
  root.style.setProperty("--font-sans", settings.fontStacks["sans-serif"]);
  root.style.setProperty("--font-serif", settings.fontStacks.serif);
  root.style.setProperty("--font-monospace", settings.fontStacks.monospace);
  root.style.setProperty("--font-ui", settings.fontStacks[settings.uiFontFamily]);
  root.style.setProperty("--font-editor", settings.fontStacks[settings.editorFontFamily]);
  root.style.setProperty("--font-size-ui", `${settings.uiFontSize}px`);
  root.style.setProperty("--font-size-editor", `${settings.editorFontSize}px`);
  root.dataset.keybindingProfile = settings.keybindingProfile;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element.");

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
