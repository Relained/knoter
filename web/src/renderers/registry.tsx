import type { WorkspaceObjectKind } from "../domain/types";
import { CalendarObjectRenderer } from "./CalendarObjectRenderer";
import { NoteObjectRenderer } from "./NoteObjectRenderer";
import { Graph3DObjectRenderer } from "./ObjectTemplateAdapters";
import { SettingsObjectRenderer } from "./SettingsObjectRenderer";
import { TasksObjectRenderer } from "./TasksObjectRenderer";
import { TodoObjectRenderer } from "./TodoObjectRenderer";
import type { WorkspaceObjectRenderer } from "./types";

export const workspaceObjectRenderers = {
  note: NoteObjectRenderer,
  settings: SettingsObjectRenderer,
  graph3d: Graph3DObjectRenderer,
  tasks: TasksObjectRenderer,
  todo: TodoObjectRenderer,
  calendar: CalendarObjectRenderer
} satisfies Record<WorkspaceObjectKind, WorkspaceObjectRenderer>;

export function resolveWorkspaceObjectRenderer(kind: WorkspaceObjectKind) {
  return workspaceObjectRenderers[kind];
}
