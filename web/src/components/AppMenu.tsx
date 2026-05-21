import { EdgePositionDragButton } from "./EdgePositionDragButton";
import type { EdgePosition, EdgePreviewModel } from "../domain/types";
import { Icon } from "../icons/Icon";
import { IconButton } from "./IconButton";
import type { WorkspaceCommandActions } from "../commands/workspaceCommands";

type AppMenuProps = {
  menuPosition: EdgePosition;
  sidebarCollapsed: boolean;
  actions: Pick<WorkspaceCommandActions, "openPalette" | "newTab" | "splitSmart" | "newFloating" | "cycleMenu">;
  onToggleSidebar: () => void;
  onSetMenuPosition: (position: EdgePosition) => void;
  onPreviewEdge: (preview: EdgePreviewModel | null) => void;
};

export function AppMenu({ menuPosition, sidebarCollapsed, actions, onToggleSidebar, onSetMenuPosition, onPreviewEdge }: AppMenuProps) {
  return (
    <nav className="app-menu" aria-label="Application menu">
      <IconButton label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"} onClick={onToggleSidebar}>
        <Icon name={sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse"} size={17} />
      </IconButton>
      <IconButton label="Command Palette" onClick={actions.openPalette}>
        <Icon name="command.search" size={17} />
      </IconButton>
      <IconButton label="New Tab" onClick={actions.newTab}>
        <Icon name="document.new" size={17} />
      </IconButton>
      <IconButton label="Split Pane" onClick={actions.splitSmart}>
        <Icon name="layout.split" size={17} />
      </IconButton>
      <IconButton label="Floating Window" onClick={() => actions.newFloating("Dashboard")}>
        <Icon name="layout.float" size={17} />
      </IconButton>
      <EdgePositionDragButton
        label="Move Menu"
        size={17}
        scopeSelector=".app-shell"
        fallbackClick={actions.cycleMenu}
        onCommit={onSetMenuPosition}
        onPreview={onPreviewEdge}
      />
    </nav>
  );
}
