/**
 * Keybinding system over the command registry: a chord (e.g. "Mod+K") maps to
 * a command id. "Mod" expands to Meta on macOS and Ctrl elsewhere. One chord
 * per command; assigning a chord that another command holds unbinds it there.
 */

export type KeybindingMap = Record<string, string>;

const storageKey = "knoter.workbench.keybindings";

export const defaultKeybindings: KeybindingMap = {
  "palette.open": "Mod+K",
  "search.run": "Mod+Shift+F",
  "note.save": "Mod+S",
  "settings.open": "Mod+,",
  "open.daily-note": "Mod+D",
  "sync.run": "Mod+Shift+S",
  "explorer.refresh": "Mod+Shift+E",
  "tab.close": "Mod+Shift+W",
  "tab.next": "Ctrl+Tab",
  "tab.prev": "Ctrl+Shift+Tab",
};

let snapshot = loadKeybindings();
const listeners = new Set<() => void>();

export function getKeybindingsSnapshot(): KeybindingMap {
  return snapshot;
}

export function subscribeKeybindings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Binds a chord to a command (chord === null clears the binding).
 * Returns the command id that lost the chord to this assignment, if any.
 */
export function setKeybinding(
  commandId: string,
  chord: string | null,
): string | null {
  const next: KeybindingMap = { ...snapshot };
  let displaced: string | null = null;

  if (chord) {
    const expanded = expandChord(chord);
    for (const [otherId, otherChord] of Object.entries(next)) {
      if (otherId !== commandId && expandChord(otherChord) === expanded) {
        delete next[otherId];
        displaced = otherId;
      }
    }
    next[commandId] = chord;
  } else {
    delete next[commandId];
  }

  persistKeybindings(next);
  setSnapshot(next);
  return displaced;
}

export function resetKeybindings() {
  persistKeybindings(defaultKeybindings);
  setSnapshot({ ...defaultKeybindings });
}

export function resolveChordCommand(
  bindings: KeybindingMap,
  eventChord: string,
): string | null {
  const expanded = expandChord(eventChord);
  for (const [commandId, chord] of Object.entries(bindings)) {
    if (expandChord(chord) === expanded) return commandId;
  }
  return null;
}

/** Builds a canonical chord from a keydown event; null for lone modifiers. */
export function chordFromEvent(event: KeyboardEvent): string | null {
  const key = normalizeKey(event.key);
  if (!key) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
}

export function chordHasSystemModifier(chord: string): boolean {
  const expanded = expandChord(chord);
  return expanded.includes("Ctrl+") || expanded.includes("Meta+");
}

export function formatChord(chord: string): string {
  const macLabels: Record<string, string> = {
    Mod: "⌘",
    Meta: "⌘",
    Ctrl: "⌃",
    Alt: "⌥",
    Shift: "⇧",
  };
  const otherLabels: Record<string, string> = {
    Mod: "Ctrl",
    Meta: "Win",
  };
  const parts = chord.split("+");
  if (isMacPlatform()) {
    return parts.map((part) => macLabels[part] ?? part).join("");
  }
  return parts.map((part) => otherLabels[part] ?? part).join("+");
}

function expandChord(chord: string): string {
  const mod = isMacPlatform() ? "Meta" : "Ctrl";
  const parts = chord.split("+").map((part) => (part === "Mod" ? mod : part));
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  const ordered = ["Ctrl", "Alt", "Shift", "Meta"].filter((name) =>
    modifiers.has(name),
  );
  return [...ordered, normalizeKey(key) ?? key].join("+");
}

function normalizeKey(key: string): string | null {
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
    return null;
  }
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
}

function loadKeybindings(): KeybindingMap {
  if (typeof localStorage === "undefined") return { ...defaultKeybindings };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultKeybindings };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...defaultKeybindings };
    }
    const bindings: KeybindingMap = {};
    for (const [commandId, chord] of Object.entries(parsed)) {
      if (typeof chord === "string" && chord.length > 0) {
        bindings[commandId] = chord;
      }
    }
    return bindings;
  } catch {
    return { ...defaultKeybindings };
  }
}

function persistKeybindings(bindings: KeybindingMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(bindings));
  } catch {
    // Persistence is best-effort.
  }
}

function setSnapshot(next: KeybindingMap) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
