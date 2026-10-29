/**
 * Keyboard shortcuts: a fixed set of commands with default bindings that the user can
 * override in Settings. Bindings are stored as text such as `Mod+Shift+S`, where `Mod`
 * is ⌘ on macOS and Ctrl elsewhere, and keys come from the physical key so Option or
 * Alt combinations still match on every keyboard layout.
 */
export const shortcutCommands = [
  { id: 'search', label: 'Search notes and commands', group: 'Navigate', binding: 'Mod+K' },
  { id: 'home', label: 'Home: search and graph', group: 'Navigate', binding: 'Mod+1' },
  { id: 'library', label: 'All notes', group: 'Navigate', binding: 'Mod+2' },
  { id: 'back', label: 'Go back', group: 'Navigate', binding: 'Mod+[' },
  { id: 'forward', label: 'Go forward', group: 'Navigate', binding: 'Mod+]' },
  { id: 'newNote', label: 'New note', group: 'Notes', binding: 'Mod+N' },
  { id: 'editNote', label: 'Edit the open note', group: 'Notes', binding: 'Mod+E' },
  {
    id: 'rewriteNote',
    label: 'Rewrite the open note with a supplement ratio',
    group: 'Notes',
    binding: 'Mod+Shift+E',
  },
  { id: 'localGraph', label: 'Graph around the open note', group: 'Notes', binding: 'Mod+G' },
  { id: 'toggleNavigation', label: 'Toggle navigation', group: 'Layout', binding: 'Mod+B' },
  { id: 'toggleChat', label: 'Toggle Chat', group: 'Layout', binding: 'Mod+L' },
  { id: 'toggleChanges', label: 'Toggle Changes', group: 'Layout', binding: 'Mod+Shift+H' },
  { id: 'zen', label: 'Toggle Zen mode', group: 'Layout', binding: 'Mod+.' },
  { id: 'openSources', label: 'Open Sources', group: 'Windows', binding: 'Mod+Shift+S' },
  { id: 'openAgent', label: 'Open Agent', group: 'Windows', binding: 'Mod+Shift+A' },
  { id: 'activity', label: 'Open Activity', group: 'Windows', binding: 'Mod+Shift+Y' },
  { id: 'settings', label: 'Open Settings', group: 'Windows', binding: 'Mod+,' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Windows', binding: 'Mod+/' },
] as const;
export type ShortcutId = (typeof shortcutCommands)[number]['id'];
export type Bindings = Record<ShortcutId, string>;

export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const codeKeys: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
};
const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** The binding text for a key event, or null for a lone modifier. */
export function eventBinding(event: KeyboardEvent): string | null {
  if (modifierKeys.has(event.key)) return null;
  const code = event.code;
  const key = code.startsWith('Key')
    ? code.slice(3)
    : code.startsWith('Digit')
      ? code.slice(5)
      : code.startsWith('Numpad') && /^\d$/.test(code.slice(6))
        ? code.slice(6)
        : (codeKeys[code] ??
          (event.key.length === 1 ? event.key.toUpperCase() : event.key || code));
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (isMac && event.ctrlKey) parts.push('Ctrl');
  if (!isMac && event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** A binding must use a command modifier, or be a function key, to stay out of typing. */
export function usableBinding(binding: string) {
  const parts = binding.split('+');
  const key = parts.at(-1)!;
  return (
    /^F([1-9]|1[0-2])$/.test(key) || parts.some((p) => ['Mod', 'Ctrl', 'Meta', 'Alt'].includes(p))
  );
}

const macSymbols: Record<string, string> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Meta: '⌘',
};
/** Display text: ⌘⇧S on macOS, Ctrl+Shift+S elsewhere. */
export function formatBinding(binding: string) {
  if (!binding) return '';
  const parts = binding.split('+');
  if (isMac) return parts.map((p) => macSymbols[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p === 'Meta' ? 'Win' : p)).join('+');
}

export function resolveBindings(overrides: Record<string, string> | undefined): Bindings {
  return Object.fromEntries(
    shortcutCommands.map((c) => [c.id, overrides?.[c.id] ?? c.binding]),
  ) as Bindings;
}

/** Commands that share a binding with another command. */
export function conflicts(bindings: Bindings) {
  const seen = new Map<string, ShortcutId[]>();
  for (const [id, binding] of Object.entries(bindings) as [ShortcutId, string][])
    if (binding) seen.set(binding, [...(seen.get(binding) ?? []), id]);
  return new Set([...seen.values()].filter((ids) => ids.length > 1).flat());
}

/** Tooltip text with the bound shortcut, if any. */
export const withShortcut = (label: string, binding?: string) =>
  binding ? `${label} (${formatBinding(binding)})` : label;
