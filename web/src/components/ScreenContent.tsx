import type { NoteKey, WorkspaceObjectKey, WorkspaceObjectState, WorkspaceObjectStates } from "../domain/types";
import { workspaceObjects } from "../domain/workspace";
import { EmptyPaneRenderer } from "../renderers/EmptyPaneRenderer";
import { resolveWorkspaceObjectRenderer } from "../renderers/registry";
import type { GlobalSettings } from "../settings/preferences";

type ScreenContentProps = {
  objectKey: WorkspaceObjectKey | null;
  noteKey: NoteKey | null;
  objectState: WorkspaceObjectState | null;
  objectStates: WorkspaceObjectStates;
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
  onChangeObjectState: (objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) => void;
  onOpenObject: (objectKey: WorkspaceObjectKey, target: "pane" | "floating") => void;
  empty?: boolean;
};

export function ScreenContent({
  objectKey,
  noteKey,
  objectState,
  objectStates,
  settings,
  onChangeSettings,
  onChangeObjectState,
  onOpenObject,
  empty = false
}: ScreenContentProps) {
  if (empty) return <EmptyPaneRenderer />;

  const objectKind = objectKey ? workspaceObjects[objectKey].kind : "note";
  const Renderer = resolveWorkspaceObjectRenderer(objectKind);
  return (
    <Renderer
      objectKey={objectKey}
      noteKey={noteKey}
      objectState={objectState}
      objectStates={objectStates}
      settings={settings}
      onChangeSettings={onChangeSettings}
      onChangeObjectState={onChangeObjectState}
      onOpenObject={onOpenObject}
    />
  );
}
