import type { Command } from "../commands/types";
import type { KeyModifier, Keybinding, KeybindingEvent } from "./types";

export function findMatchingKeybinding(
  event: KeybindingEvent,
  keybindings: readonly Keybinding[]
): Keybinding | null {
  return keybindings.find((binding) => matchesKeybinding(event, binding)) ?? null;
}

export function matchesKeybinding(event: KeybindingEvent, binding: Keybinding): boolean {
  if (!binding.allowInEditable && isEditableTarget(event.target)) return false;
  if (normalizeKey(event.key) !== normalizeKey(binding.key)) return false;

  const modifiers = new Set<KeyModifier>(binding.modifiers);
  const usesPrimary = modifiers.has("primary");
  const primaryPressed = event.ctrlKey || event.metaKey;

  if (usesPrimary && !primaryPressed) return false;
  if (!usesPrimary && event.ctrlKey !== modifiers.has("ctrl")) return false;
  if (!usesPrimary && event.metaKey !== modifiers.has("meta")) return false;
  if (usesPrimary && (modifiers.has("ctrl") || modifiers.has("meta"))) return false;
  if (event.altKey !== modifiers.has("alt")) return false;
  if (event.shiftKey !== modifiers.has("shift")) return false;

  return true;
}

export function createCommandLookup(commands: readonly Command[]): Map<string, Command> {
  return new Map(commands.map((command) => [command.id, command]));
}

export function commandForKeybinding(
  event: KeybindingEvent,
  keybindings: readonly Keybinding[],
  commands: readonly Command[]
): Command | null {
  const binding = findMatchingKeybinding(event, keybindings);
  if (!binding) return null;
  return createCommandLookup(commands).get(binding.commandId) ?? null;
}

export function shouldPreventDefault(binding: Keybinding): boolean {
  return binding.preventDefault !== false;
}

function normalizeKey(key: string) {
  if (key === " ") return "space";
  return key.toLowerCase();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;

  const element = target as {
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    tagName?: string;
  };
  if (element.isContentEditable) return true;
  if (element.getAttribute?.("contenteditable") === "true") return true;

  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
