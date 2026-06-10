import type { IconComponent, IconName, IconRegistry, IconThemeDefinition, IconThemeId } from "./registry";
import { builtInIconThemes } from "./registry";

export type IconThemeRuntime = {
  builtInIconThemes: typeof builtInIconThemes;
  getActiveIconTheme: typeof getActiveIconTheme;
  getBuiltInIconThemes: typeof getBuiltInIconThemes;
  getIconThemeSnapshot: typeof getIconThemeSnapshot;
  loadIconTheme: typeof loadIconTheme;
  resolveIconComponent: typeof resolveIconComponent;
};

const iconThemeStorageKey = "knoter.appearance.icons.v1";
let activeIconTheme: IconThemeDefinition = builtInIconThemes.lucide;
let activeIconRegistry: IconRegistry = mergeWithFallbackRegistry(activeIconTheme.registry);
let iconThemeVersion = 0;
const subscribers = new Set<() => void>();

export function loadIconTheme(theme: IconThemeId | IconThemeDefinition, options: { persist?: boolean } = {}) {
  const resolvedTheme = typeof theme === "string" ? builtInIconThemes[theme] : theme;
  if (!resolvedTheme) return activeIconTheme;

  activeIconTheme = resolvedTheme;
  activeIconRegistry = mergeWithFallbackRegistry(resolvedTheme.registry);
  if (options.persist) saveStoredIconThemeId(activeIconTheme.id);
  notifySubscribers();
  window.dispatchEvent(new CustomEvent("knoter:iconthemechange", { detail: { theme: activeIconTheme } }));
  return activeIconTheme;
}

export function getActiveIconTheme() {
  return activeIconTheme;
}

export function getBuiltInIconThemes() {
  return builtInIconThemes;
}

export function resolveIconComponent(name: IconName): IconComponent {
  return activeIconRegistry[name] ?? activeIconRegistry.fallback;
}

export function getIconThemeSnapshot() {
  return iconThemeVersion;
}

export function subscribeIconTheme(listener: () => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function installIconRuntime() {
  const storedThemeId = readStoredIconThemeId();
  if (storedThemeId && storedThemeId in builtInIconThemes) {
    loadIconTheme(storedThemeId as IconThemeId, { persist: false });
  }

  window.knoterIcons = {
    builtInIconThemes,
    getActiveIconTheme,
    getBuiltInIconThemes,
    getIconThemeSnapshot,
    loadIconTheme,
    resolveIconComponent
  };
}

function mergeWithFallbackRegistry(registry: Partial<IconRegistry>): IconRegistry {
  return { ...builtInIconThemes.lucide.registry, ...registry };
}

function notifySubscribers() {
  iconThemeVersion += 1;
  for (const listener of subscribers) listener();
}

function readStoredIconThemeId(): string | null {
  try {
    return localStorage.getItem(iconThemeStorageKey);
  } catch (error) {
    console.warn("Failed to read stored icon theme.", error);
    return null;
  }
}

function saveStoredIconThemeId(themeId: string) {
  try {
    localStorage.setItem(iconThemeStorageKey, themeId);
  } catch (error) {
    console.warn("Failed to save icon theme.", error);
  }
}
