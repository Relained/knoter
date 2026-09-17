import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  DocumentTemplateSummary,
  ExplorerItem,
  VaultSummary,
} from "../core/api/types";
import {
  getGlobalSettingsSnapshot,
  subscribeGlobalSettings,
  updateGlobalSettings,
} from "../core/settings/preferences";
import {
  chordFromEvent,
  chordHasSystemModifier,
  getKeybindingsSnapshot,
  resolveChordCommand,
  subscribeKeybindings,
} from "./commands/keybindings";
import {
  loadCommandMru,
  sortCommandsByMru,
  touchCommandMru,
} from "./commands/mru";
import { buildWorkbenchCommands } from "./commands/registry";
import { builtinViews, initialSourceDraft, initialTabs } from "./fixtures";
import { sourceToHtml } from "./utils/html";
import {
  loadStoredWidgets,
  pinWidget,
  resizeWidgetPair,
  saveStoredWidgets,
  unpinWidget,
} from "./utils/widgets";
import { CommandPaletteOverlay } from "./components/CommandPaletteOverlay";
import { HtmlPageView } from "./components/HtmlPageView";
import { OverlayBar } from "./components/OverlayMenuBar";
import { OverlayTabs } from "./components/OverlayTapBar";
import { SettingsPageView } from "./components/SettingsPageView";
import { SourceModal } from "./components/SourceModal";
import { StatusChip } from "./components/StatusChip";
import { VaultCreateModal } from "./components/VaultCreateModal";
import { WidgetBar } from "./components/WidgetBar";
import type {
  CommandValues,
  HtmlTab,
  PendingCommand,
  RunningOperation,
  SourceRecord,
  ToastMessage,
  ToolKey,
  WorkbenchCommand,
  WorkbenchWidget,
} from "./types";

const transientToastMs = 4_000;
const explorerLayers = ["source", "artifact", "template"] as const;
// Keep-alive cap: each kept tab holds a live sandboxed iframe (static
// srcdoc, no scripts), trading memory for preserved scroll positions.
const keepAliveTabLimit = 8;

export function App() {
  const api = window.knoterApi ?? null;
  const macShell = window.knoterShell?.platform === "darwin";
  const [fullScreen, setFullScreen] = useState(false);
  const [tabs, setTabs] = useState<HtmlTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialTabs[0].id,
  );
  const globalSettings = useSyncExternalStore(
    subscribeGlobalSettings,
    getGlobalSettingsSnapshot,
    getGlobalSettingsSnapshot,
  );
  const tabDock = globalSettings.workbenchTabDock;
  const widgetBarWidth = globalSettings.widgetBarWidth;
  const [openTool, setOpenTool] = useState<ToolKey | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [recentCommandIds, setRecentCommandIds] =
    useState<string[]>(loadCommandMru);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(
    null,
  );
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState(initialSourceDraft);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [dailyNote, setDailyNote] = useState("");
  const [simpleNote, setSimpleNote] = useState("");
  const [widgets, setWidgets] = useState<WorkbenchWidget[]>(loadStoredWidgets);
  const [explorerItems, setExplorerItems] = useState<ExplorerItem[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<
    DocumentTemplateSummary[]
  >([]);
  const [activeVault, setActiveVault] = useState<VaultSummary | null>(null);
  const [runningOps, setRunningOps] = useState<RunningOperation[]>([]);
  const nextOperationId = useRef(1);
  const [toastHistory, setToastHistory] = useState<ToastMessage[]>([
    { id: 1, text: "Ready.", createdAt: new Date().toISOString() },
  ]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [transientToast, setTransientToast] = useState<ToastMessage | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentRunning = useRef(false);
  // pushStatus is captured by the commands memo, so popup/toast visibility
  // must be read through refs to avoid stale closures.
  const notificationsOpenRef = useRef(false);
  const toastUnseenRef = useRef(false);

  const activeTab = activeTabId
    ? (tabs.find((tab) => tab.id === activeTabId) ?? null)
    : null;

  const [recentTabIds, setRecentTabIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeTabId) return;
    setRecentTabIds((current) =>
      [activeTabId, ...current.filter((id) => id !== activeTabId)].slice(
        0,
        keepAliveTabLimit,
      ),
    );
  }, [activeTabId]);

  // Iframe tabs among the most recently active stay mounted (hidden) so
  // their scroll positions survive tab switches; editors keep their state
  // in App and render only while active.
  const keptTabs = useMemo(() => {
    const recencyIds = activeTabId
      ? [activeTabId, ...recentTabIds.filter((id) => id !== activeTabId)]
      : recentTabIds;
    const keepIds = new Set(recencyIds.slice(0, keepAliveTabLimit));
    return tabs.filter(
      (tab) =>
        (tab.kind === "artifact" || tab.kind === "source") &&
        keepIds.has(tab.id),
    );
  }, [tabs, activeTabId, recentTabIds]);

  const activeTabIsKept =
    activeTab !== null && keptTabs.some((tab) => tab.id === activeTab.id);

  useEffect(() => {
    notificationsOpenRef.current = openTool === "notifications";
  }, [openTool]);

  const refreshVaultData = useCallback(async () => {
    if (!api) return;
    const [vault, items, templates] = await Promise.all([
      api.vault.getActive(),
      api.explorer.list({ layers: [...explorerLayers] }),
      api.template.list(),
    ]);
    setActiveVault(vault);
    setExplorerItems(items);
    setDocumentTemplates(templates);
  }, [api]);

  const keybindings = useSyncExternalStore(
    subscribeKeybindings,
    getKeybindingsSnapshot,
    getKeybindingsSnapshot,
  );

  const commands = useMemo(
    () =>
      buildWorkbenchCommands({
        api,
        tabs,
        activeTab,
        explorerItems,
        documentTemplates,
        dailyNote,
        simpleNote,
        upsertTab,
        openTab,
        closeActiveTab,
        activateAdjacentTab,
        pinWidgetView,
        pushStatus,
        openSourceModal: () => setSourceModalOpen(true),
        openVaultModal: () => setVaultModalOpen(true),
        closeVaultModal: () => setVaultModalOpen(false),
        openSettings: () => setSettingsOpen(true),
        openPalette,
        refreshVaultData,
        beginAgentRun: () => {
          if (agentRunning.current) return false;
          agentRunning.current = true;
          return true;
        },
        endAgentRun: () => {
          agentRunning.current = false;
        },
        beginOperation,
        endOperation,
      }),
    [
      api,
      tabs,
      activeTab,
      explorerItems,
      documentTemplates,
      widgets,
      dailyNote,
      simpleNote,
      refreshVaultData,
    ],
  );

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const filtered = commands.filter((command) => {
      if (!query) return true;
      return `${command.title} ${command.detail}`.toLowerCase().includes(query);
    });
    return sortCommandsByMru(filtered, recentCommandIds);
  }, [commandQuery, commands, recentCommandIds]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const chord = chordFromEvent(event);
      if (!chord) return;
      const commandId = resolveChordCommand(keybindings, chord);
      if (!commandId) return;
      // Plain keys keep their meaning while typing; system chords always win.
      if (isEditableTarget(event.target) && !chordHasSystemModifier(chord)) {
        return;
      }
      event.preventDefault();
      executeCommand(commandId);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!api) {
      pushStatus("Backend bridge not detected — running on local fixtures.");
      return;
    }
    let canceled = false;
    (async () => {
      try {
        const vault = await api.vault.getActive();
        const items = await api.explorer.list({ layers: [...explorerLayers] });
        const templates = await api.template.list();
        if (canceled) return;
        setActiveVault(vault);
        setExplorerItems(items);
        setDocumentTemplates(templates);
        pushStatus(
          vault
            ? `Vault connected: ${vault.name} (${items.length} documents).`
            : "Backend connected, but no active vault was found.",
        );
        if (!vault) {
          const vaults = await api.vault.list();
          if (!canceled && vaults.length === 0) setVaultModalOpen(true);
        }
      } catch (error) {
        if (!canceled) {
          pushStatus(`Vault connection failed: ${errorMessage(error)}`);
        }
      }
    })();
    return () => {
      canceled = true;
    };
    // Mount-only bootstrap; api comes from the preload bridge and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStoredWidgets(widgets);
  }, [widgets]);

  // The hidden macOS title bar puts the traffic lights on the tab bar row;
  // fullscreen hides them, so the drag strip is dropped there.
  useEffect(() => {
    if (!macShell) return;
    return window.knoterShell?.onFullScreenChange(setFullScreen);
  }, [macShell]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function openPalette(query: string) {
    setCommandQuery(query);
    setPendingCommand(null);
    setCommandOpen(true);
    setOpenTool(null);
  }

  function closePalette() {
    setCommandOpen(false);
    setPendingCommand(null);
  }

  function executeCommand(
    commandId: string,
    preset: CommandValues = {},
    options: { skipOptionsForm?: boolean } = {},
  ) {
    const command = commands.find((item) => item.id === commandId);
    if (!command) {
      pushStatus(`Unknown command: ${commandId}`);
      return;
    }
    selectCommand(command, preset, options);
  }

  function selectCommand(
    command: WorkbenchCommand,
    preset: CommandValues = {},
    { skipOptionsForm = false }: { skipOptionsForm?: boolean } = {},
  ) {
    setOpenTool(null);
    setRecentCommandIds(touchCommandMru(command.id));
    // Dialogs that already collected the option values (e.g. the vault
    // modal) skip the palette option form and run directly.
    if (!skipOptionsForm && command.options && command.options.length > 0) {
      setPendingCommand({ command, values: preset });
      setCommandOpen(true);
      return;
    }
    closePalette();
    void runCommand(command, preset);
  }

  function submitPendingCommand(values: CommandValues) {
    const pending = pendingCommand;
    closePalette();
    if (pending) void runCommand(pending.command, values);
  }

  async function runCommand(command: WorkbenchCommand, values: CommandValues) {
    try {
      await command.run(values);
    } catch (error) {
      pushStatus(`${command.title} failed: ${errorMessage(error)}`);
    }
  }

  function openTab(tabId: string) {
    setActiveTabId(tabId);
    setOpenTool(null);
  }

  function upsertTab(tab: HtmlTab) {
    setTabs((current) => {
      const exists = current.some((item) => item.id === tab.id);
      return exists
        ? current.map((item) =>
            item.id === tab.id ? { ...item, ...tab } : item,
          )
        : [...current, tab];
    });
    setActiveTabId(tab.id);
    setOpenTool(null);
  }

  function pinWidgetView(viewId: string) {
    const view =
      builtinViews[viewId] ?? tabs.find((tab) => tab.id === viewId);
    if (!view) {
      pushStatus(`No view to pin: ${viewId}`);
      return;
    }
    if (widgets.some((widget) => widget.id === view.id)) {
      pushStatus(`Already pinned: ${view.title}`);
      setOpenTool(null);
      return;
    }
    setWidgets((current) => pinWidget(current, view));
    pushStatus(`Pinned to widget bar: ${view.title}`);
    setOpenTool(null);
  }

  function unpinWidgetView(widgetId: string) {
    const widget = widgets.find((item) => item.id === widgetId);
    setWidgets((current) => unpinWidget(current, widgetId));
    if (widget) pushStatus(`Unpinned: ${widget.view.title}`);
  }

  function resizeWidgets(index: number, firstRatio: number, secondRatio: number) {
    setWidgets((current) =>
      resizeWidgetPair(current, index, firstRatio, secondRatio),
    );
  }

  function resizeWidgetBar(width: number) {
    updateGlobalSettings({ widgetBarWidth: width });
  }

  function queueSource() {
    if (!sourceDraft.title.trim() && sourceDraft.fileNames.length === 0) {
      pushStatus("Add a file or advanced title before queueing.");
      return;
    }
    const source: SourceRecord = {
      ...sourceDraft,
      id: crypto.randomUUID(),
      title:
        sourceDraft.title.trim() ||
        sourceDraft.fileNames[0] ||
        "Untitled source",
      status: "extraction_status=waiting-for-backend",
      createdAt: new Date().toISOString(),
    };
    setSources((current) => [source, ...current]);
    setSourceDraft(initialSourceDraft);
    pushStatus(
      `Source draft queued: ${source.title} (metadata pending backend support).`,
    );
    upsertTab({
      id: `source-${source.id}`,
      title: source.title,
      kind: "source",
      label: "Source",
      html: sourceToHtml(source),
    });
  }

  function closeTab(tabId: string) {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const fallbackTab =
      nextTabs[Math.max(0, Math.min(closingIndex, nextTabs.length - 1))];
    setTabs(nextTabs);
    if (tabId === activeTabId) setActiveTabId(fallbackTab?.id ?? null);
  }

  function closeActiveTab() {
    if (activeTabId) closeTab(activeTabId);
  }

  function activateAdjacentTab(direction: 1 | -1) {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextTab =
      tabs[(baseIndex + direction + tabs.length) % tabs.length];
    setActiveTabId(nextTab.id);
  }

  function beginOperation(label: string): number {
    const id = nextOperationId.current++;
    setRunningOps((current) => [
      ...current,
      { id, label, startedAt: new Date().toISOString() },
    ]);
    return id;
  }

  function endOperation(operationId: number) {
    setRunningOps((current) =>
      current.filter((operation) => operation.id !== operationId),
    );
  }

  function pushStatus(nextStatus: string) {
    const message: ToastMessage = {
      id: Date.now(),
      text: nextStatus,
      createdAt: new Date().toISOString(),
    };
    setToastHistory((current) => [message, ...current].slice(0, 20));
    // A message counts as unread only if its toast was cut short by the
    // next message; fully displayed, dismissed, or popup-visible messages
    // are considered seen.
    if (toastUnseenRef.current && !notificationsOpenRef.current) {
      setUnreadCount((count) => count + 1);
    }
    toastUnseenRef.current = !notificationsOpenRef.current;
    setTransientToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      toastUnseenRef.current = false;
      setTransientToast(null);
    }, transientToastMs);
  }

  function dismissTransientToast() {
    toastUnseenRef.current = false;
    setTransientToast(null);
  }

  function toggleNotifications() {
    const opening = openTool !== "notifications";
    setOpenTool(opening ? "notifications" : null);
    if (opening) {
      setUnreadCount(0);
      toastUnseenRef.current = false;
    }
  }

  function removeToastMessage(messageId: number) {
    setToastHistory((current) =>
      current.filter((message) => message.id !== messageId),
    );
  }

  function clearToastMessages() {
    setToastHistory([]);
    setUnreadCount(0);
  }

  const macTitlebarActive = macShell && !fullScreen;

  return (
    <main className={`html-workbench html-workbench-tabs-${tabDock}`}>
      <div className="workbench-main">
        {macTitlebarActive && (
          <div className="titlebar-drag-region" aria-hidden="true" />
        )}
        <section className="html-page" aria-label="Main page">
          {keptTabs.map((tab) => (
            <div
              className="html-page-scroll"
              key={tab.id}
              hidden={tab.id !== activeTabId}
            >
              <HtmlPageView
                tab={tab}
                dailyNote={dailyNote}
                simpleNote={simpleNote}
                onDailyNote={setDailyNote}
                onSimpleNote={setSimpleNote}
                onSaveNote={(editor) => executeCommand("note.save", { editor })}
              />
            </div>
          ))}
          {!activeTabIsKept && (
            <div className="html-page-scroll">
              <HtmlPageView
                tab={activeTab}
                dailyNote={dailyNote}
                simpleNote={simpleNote}
                onDailyNote={setDailyNote}
                onSimpleNote={setSimpleNote}
                onSaveNote={(editor) => executeCommand("note.save", { editor })}
              />
            </div>
          )}
        </section>

        <OverlayBar
          openTool={openTool}
          settingsOpen={settingsOpen}
          unreadCount={unreadCount}
          runningOps={runningOps}
          toastHistory={toastHistory}
          onOpenTool={setOpenTool}
          onToggleNotifications={toggleNotifications}
          onDismissMessage={removeToastMessage}
          onClearMessages={clearToastMessages}
          onRunCommand={executeCommand}
        />

        <OverlayTabs
          tabDock={tabDock}
          tabs={tabs}
          activeTabId={activeTabId}
          isSharedDock={false}
          onOpenTab={openTab}
          onCloseTab={closeTab}
        />

        <StatusChip
          connected={api !== null}
          vault={activeVault}
          documentCount={explorerItems.length}
          onOpenStatus={() => executeCommand("vault.status")}
        />

        {transientToast && (
          <div className="workbench-toast" role="status" aria-live="polite">
            <span>{transientToast.text}</span>
            <button
              type="button"
              onClick={dismissTransientToast}
              aria-label="Dismiss message"
            >
              x
            </button>
          </div>
        )}
      </div>

      <WidgetBar
        widgets={widgets}
        width={widgetBarWidth}
        dailyNote={dailyNote}
        simpleNote={simpleNote}
        onDailyNote={setDailyNote}
        onSimpleNote={setSimpleNote}
        onOpenAsTab={upsertTab}
        onUnpin={unpinWidgetView}
        onResizeRatios={resizeWidgets}
        onResizeWidth={resizeWidgetBar}
      />

      {commandOpen && (
        <CommandPaletteOverlay
          query={commandQuery}
          items={filteredCommands}
          pending={pendingCommand}
          keybindings={keybindings}
          onQuery={setCommandQuery}
          onSelect={selectCommand}
          onSubmitPending={submitPendingCommand}
          onCancelPending={() => setPendingCommand(null)}
          onClose={closePalette}
        />
      )}

      {sourceModalOpen && (
        <SourceModal
          draft={sourceDraft}
          onChange={setSourceDraft}
          onQueue={queueSource}
          onClose={() => setSourceModalOpen(false)}
        />
      )}

      {vaultModalOpen && (
        <VaultCreateModal
          hasBackend={api !== null}
          onPickDirectory={async (title) => {
            if (!api) return null;
            const picked = await api.dialog.pickDirectory({ title });
            return picked.canceled ? null : picked.path;
          }}
          onSubmit={(input) =>
            executeCommand(
              "vault.bootstrap",
              {
                name: input.name,
                directory: input.directory ?? "",
                sourceFolder: input.sourceFolder ?? "",
              },
              { skipOptionsForm: true },
            )
          }
          onClose={() => setVaultModalOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPageView
          commands={commands}
          keybindings={keybindings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, "");
  }
  return String(error);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
