import type {
  EdgePosition,
  EdgePreviewModel,
  Pane,
  TabPlacementPreviewModel,
  WorkspaceObjectKey,
  WorkspaceObjectState,
  WorkspaceObjectStates
} from "../domain/types";
import type { GlobalSettings } from "../settings/preferences";
import { DraggableTab } from "./DraggableTab";
import { ScreenContent } from "./ScreenContent";
import { ScreenToolbar } from "./ScreenToolbar";

type WorkspacePaneProps = {
  pane: Pane;
  active: boolean;
  canClose: boolean;
  onActivate: () => void;
  onMoveToolbar: () => void;
  onSetToolbarPosition: (position: EdgePosition) => void;
  onPreviewEdge: (preview: EdgePreviewModel | null) => void;
  onPreviewTabPlacement: (preview: TabPlacementPreviewModel | null) => void;
  onFloat: () => void;
  onClosePane: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onSplitTab: (tabId: string, edge: EdgePosition, targetPaneId: string | null) => void;
  onMoveTab: (tabId: string, targetPaneId: string, targetTabId: string, placement: "before" | "after") => void;
  objectStates: WorkspaceObjectStates;
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
  onChangeObjectState: (objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) => void;
  onOpenObject: (objectKey: WorkspaceObjectKey, target: "pane" | "floating") => void;
};

export function WorkspacePane({
  pane,
  active,
  canClose,
  onActivate,
  onMoveToolbar,
  onSetToolbarPosition,
  onPreviewEdge,
  onPreviewTabPlacement,
  onFloat,
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
}: WorkspacePaneProps) {
  const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0];
  const hasTabs = pane.tabs.length > 0;
  const activeObjectState = activeTab?.objectKey ? objectStates[activeTab.objectKey] ?? null : null;

  return (
    <section
      className={`workspace-pane ${active ? "is-active" : ""}`}
      data-pane-id={pane.id}
      data-toolbar-position={pane.toolbarPosition}
      onPointerDown={onActivate}
      onFocus={onActivate}
    >
      <ScreenToolbar
        toolbarPosition={pane.toolbarPosition}
        onMoveToolbar={onMoveToolbar}
        onSetToolbarPosition={onSetToolbarPosition}
        onPreviewEdge={onPreviewEdge}
        onFloat={onFloat}
        onClosePane={canClose ? onClosePane : null}
      />
      <div className="tab-strip">
        {hasTabs ? (
          pane.tabs.map((tab) => (
            <DraggableTab
              key={tab.id}
              tab={tab}
              active={tab.id === pane.activeTabId}
              onSelect={() => onSelectTab(tab.id)}
              onClose={() => onCloseTab(tab.id)}
              onPlacementPreview={onPreviewTabPlacement}
              onSplit={onSplitTab}
              onMoveTab={onMoveTab}
            />
          ))
        ) : (
          <div className="tab-placeholder">No tabs</div>
        )}
      </div>
      <ScreenContent
        objectKey={activeTab?.objectKey ?? null}
        noteKey={activeTab?.noteKey ?? null}
        objectState={activeObjectState}
        objectStates={objectStates}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onChangeObjectState={onChangeObjectState}
        onOpenObject={onOpenObject}
        empty={!hasTabs}
      />
    </section>
  );
}
