import type { Keybinding } from "./types";

export const defaultKeybindings = [
  {
    id: "workbench.commandPalette",
    commandId: "open-palette",
    key: "k",
    modifiers: ["primary"],
    allowInEditable: true
  }
] satisfies Keybinding[];
