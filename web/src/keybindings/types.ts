export type KeyModifier = "primary" | "ctrl" | "meta" | "alt" | "shift";

export type Keybinding = {
  id: string;
  commandId: string;
  key: string;
  modifiers: readonly KeyModifier[];
  allowInEditable?: boolean;
  preventDefault?: boolean;
};

export type KeybindingEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
};
