import type { ReactElement } from "react";
import type { NoteKey, WorkspaceObjectKey, WorkspaceObjectState, WorkspaceObjectStates } from "../domain/types";
import type { GlobalSettings } from "../settings/preferences";

export type WorkspaceObjectRendererProps = {
  objectKey: WorkspaceObjectKey | null;
  noteKey: NoteKey | null;
  objectState: WorkspaceObjectState | null;
  objectStates: WorkspaceObjectStates;
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
  onChangeObjectState: (objectKey: WorkspaceObjectKey, state: WorkspaceObjectState) => void;
  onOpenObject: (objectKey: WorkspaceObjectKey, target: "pane" | "floating") => void;
};

export type WorkspaceObjectRenderer = (props: WorkspaceObjectRendererProps) => ReactElement;
