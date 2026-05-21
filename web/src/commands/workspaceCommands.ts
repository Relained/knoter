import type { NoteKey, WorkspaceObjectStates } from "../domain/types";
import { isNoteKey, notes, workspaceObjects } from "../domain/workspace";
import type { Command } from "./types";

export type WorkspaceCommandActions = {
  openPalette: () => void;
  newTab: () => void;
  splitSmart: () => void;
  closePane: () => void;
  newFloating: (objectKey?: string) => void;
  openSettings: () => void;
  openObject: (objectKey: string) => void;
  closeTopFloatingWindow: () => void;
  floatActivePane: () => void;
  moveActivePaneToolbar: () => void;
  cycleMenu: () => void;
  cycleTheme: () => void;
  openNote: (noteKey: string) => void;
};

export function createWorkspaceCommands(actions: WorkspaceCommandActions, objectStates: WorkspaceObjectStates = {}): Command[] {
  const noteCommands = Object.keys(notes).filter(isNoteKey).map((noteKey) => createOpenNoteCommand(actions, noteKey, objectStates));

  return [
    { id: "open-palette", label: "명령어 팔레트 열기", hint: "Workbench", icon: "command.search", run: actions.openPalette },
    { id: "new-tab", label: "새 탭 열기", hint: "Active pane", icon: "document.new", run: actions.newTab },
    { id: "split-pane", label: "지능형 화면 분할", hint: "Wide -> right, Tall -> down", icon: "layout.split", run: actions.splitSmart },
    { id: "close-pane", label: "현재 패널 닫기", hint: "Main workspace", icon: "window.close", run: actions.closePane },
    { id: "new-floating", label: "플로팅 윈도우 열기", hint: "Overlay", icon: "layout.float", run: () => actions.newFloating("Dashboard") },
    { id: "open-settings", label: "설정 열기", hint: "Floating window", icon: "settings.open", run: actions.openSettings },
    { id: "open-graph-3d", label: "3D 그래프 열기", hint: "Object", icon: "object.graph3d", run: () => actions.openObject("Graph 3D") },
    { id: "open-tasks", label: "Tasks 열기", hint: "Object", icon: "object.tasks", run: () => actions.openObject("Tasks") },
    { id: "open-todo", label: "Todo 열기", hint: "Object", icon: "object.todo", run: () => actions.openObject("Todo") },
    { id: "open-calendar", label: "Calendar 열기", hint: "Object", icon: "object.calendar", run: () => actions.openObject("Calendar") },
    { id: "close-floating", label: "최상위 플로팅 윈도우 닫기", hint: "Overlay", icon: "window.close", run: actions.closeTopFloatingWindow },
    { id: "float-pane", label: "현재 화면 플로팅으로 열기", hint: "Active pane", icon: "layout.square", run: actions.floatActivePane },
    { id: "cycle-toolbar", label: "현재 화면 도구모음 위치 변경", hint: "Top / Right / Bottom / Left", icon: "layout.toolbar", run: actions.moveActivePaneToolbar },
    { id: "cycle-menu", label: "앱 메뉴 위치 변경", hint: "Top / Right / Bottom / Left", icon: "layout.toolbar", run: actions.cycleMenu },
    { id: "cycle-theme", label: "Base16 테마 변경", hint: "Appearance", icon: "appearance.theme", run: actions.cycleTheme },
    ...noteCommands
  ];
}

function createOpenNoteCommand(
  actions: WorkspaceCommandActions,
  noteKey: NoteKey,
  objectStates: WorkspaceObjectStates
): Command {
  const note = notes[noteKey];
  const objectState = objectStates[noteKey];
  const content = objectState?.kind === "note" ? objectState.content : "";
  return {
    id: `open-note-${noteKey.toLowerCase().replace(/\s+/g, "-")}`,
    label: `${workspaceObjects[noteKey].title} 열기`,
    hint: "Markdown",
    icon: "command.search",
    keywords: [note.summary, note.cards.flat().join(" "), content],
    run: () => actions.openNote(noteKey)
  };
}
