import type { EdgePosition, EdgePreviewModel } from "../domain/types";
import { Icon } from "../icons/Icon";
import { EdgePositionDragButton } from "./EdgePositionDragButton";
import { IconButton } from "./IconButton";

type ScreenToolbarProps = {
  toolbarPosition: EdgePosition;
  onMoveToolbar?: () => void;
  onSetToolbarPosition: (position: EdgePosition) => void;
  onPreviewEdge: (preview: EdgePreviewModel | null) => void;
  onFloat?: () => void;
  onDock?: () => void;
  onClosePane?: (() => void) | null;
};

export function ScreenToolbar({
  toolbarPosition,
  onMoveToolbar,
  onSetToolbarPosition,
  onPreviewEdge,
  onFloat,
  onDock,
  onClosePane
}: ScreenToolbarProps) {
  return (
    <div className="pane-toolbar">
      <IconButton label="Bold">
        <Icon name="text.bold" size={15} />
      </IconButton>
      <IconButton label="Italic">
        <Icon name="text.italic" size={15} />
      </IconButton>
      <IconButton label="Link">
        <Icon name="text.link" size={15} />
      </IconButton>
      <EdgePositionDragButton
        label="Move toolbar"
        size={15}
        scopeSelector=".workspace-pane, .floating-window"
        fallbackClick={onMoveToolbar}
        onCommit={onSetToolbarPosition}
        onPreview={onPreviewEdge}
      />
      {onFloat && (
        <IconButton label="Open as floating window" onClick={onFloat}>
          <Icon name="layout.float" size={15} />
        </IconButton>
      )}
      {onDock && (
        <IconButton label="Dock to main workspace" onClick={onDock}>
          <Icon name="window.dock" size={15} />
        </IconButton>
      )}
      {onClosePane && (
        <IconButton label="Close pane" onClick={onClosePane}>
          <Icon name="window.close" size={15} />
        </IconButton>
      )}
    </div>
  );
}
