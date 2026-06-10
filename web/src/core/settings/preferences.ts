export type FontFamilyPreference = "sans-serif" | "serif" | "monospace";
export type DockPreference = "top" | "bottom";

export type FontStackSettings = Record<FontFamilyPreference, string>;

export type GlobalSettings = {
  base16ThemeId: string;
  iconThemeId: string;
  uiFontFamily: FontFamilyPreference;
  uiFontSize: number;
  editorFontFamily: FontFamilyPreference;
  editorFontSize: number;
  fontStacks: FontStackSettings;
  motionScale: number;
  workbenchTabDock: DockPreference;
  widgetBarWidth: number;
};

type SettingDefinition<T> = {
  key: keyof GlobalSettings;
  storageKey: string;
  defaultValue: T;
  normalize: (value: unknown) => T;
  serialize: (value: T) => string;
  deserialize: (value: string) => unknown;
};

type SettingDefinitions = {
  [Key in keyof GlobalSettings]: SettingDefinition<GlobalSettings[Key]>;
};

export const widgetBarWidthBounds = {
  min: 240,
  max: 560,
  default: 320,
} as const;

export const fontSizeBounds = {
  ui: {
    min: 11,
    max: 20,
    default: 14,
  },
  editor: {
    min: 12,
    max: 24,
    default: 14,
  },
} as const;

export const fontFamilyOptions = [
  "sans-serif",
  "serif",
  "monospace",
] as const satisfies readonly FontFamilyPreference[];

export const dockOptions = [
  "top",
  "bottom",
] as const satisfies readonly DockPreference[];

export const defaultFontStacks: FontStackSettings = {
  "sans-serif":
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  serif: "Georgia, Cambria, Times New Roman, Times, serif",
  monospace: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace",
};

export const defaultGlobalSettings: GlobalSettings = {
  base16ThemeId: "knoter-default-dark",
  iconThemeId: "lucide",
  uiFontFamily: "sans-serif",
  uiFontSize: fontSizeBounds.ui.default,
  editorFontFamily: "monospace",
  editorFontSize: fontSizeBounds.editor.default,
  fontStacks: defaultFontStacks,
  motionScale: 1,
  workbenchTabDock: "top",
  widgetBarWidth: widgetBarWidthBounds.default,
};

export const globalSettingsStoragePrefix = "knoter.global-settings.";
export const globalSettingsConfigFileName = "knoter.config";
export const globalSettingsChangedEvent = "knoter:global-settings-changed";

const settingDefinitions: SettingDefinitions = {
  base16ThemeId: textSetting("base16ThemeId", defaultGlobalSettings.base16ThemeId),
  iconThemeId: textSetting("iconThemeId", defaultGlobalSettings.iconThemeId),
  uiFontFamily: enumSetting(
    "uiFontFamily",
    fontFamilyOptions,
    defaultGlobalSettings.uiFontFamily,
  ),
  uiFontSize: numberSetting(
    "uiFontSize",
    fontSizeBounds.ui.min,
    fontSizeBounds.ui.max,
    defaultGlobalSettings.uiFontSize,
  ),
  editorFontFamily: enumSetting(
    "editorFontFamily",
    fontFamilyOptions,
    defaultGlobalSettings.editorFontFamily,
  ),
  editorFontSize: numberSetting(
    "editorFontSize",
    fontSizeBounds.editor.min,
    fontSizeBounds.editor.max,
    defaultGlobalSettings.editorFontSize,
  ),
  fontStacks: fontStacksSetting("fontStacks", defaultGlobalSettings.fontStacks),
  motionScale: numberSetting("motionScale", 0, 2, defaultGlobalSettings.motionScale),
  workbenchTabDock: enumSetting(
    "workbenchTabDock",
    dockOptions,
    defaultGlobalSettings.workbenchTabDock,
  ),
  widgetBarWidth: numberSetting(
    "widgetBarWidth",
    widgetBarWidthBounds.min,
    widgetBarWidthBounds.max,
    defaultGlobalSettings.widgetBarWidth,
  ),
};

let settingsSnapshot = readSettingsFromStore();
const listeners = new Set<() => void>();

export function loadGlobalSettings(): GlobalSettings {
  settingsSnapshot = readSettingsFromStore();
  return settingsSnapshot;
}

export function getGlobalSettingsSnapshot(): GlobalSettings {
  return settingsSnapshot;
}

export function subscribeGlobalSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveGlobalSettings(settings: GlobalSettings) {
  try {
    const nextSettings = normalizeGlobalSettings(settings);
    writeSettingsToStore(nextSettings);
    setGlobalSettingsSnapshot(nextSettings);
    return true;
  } catch (error) {
    console.warn("Failed to save global settings.", error);
    return false;
  }
}

export function updateGlobalSettings(patch: Partial<GlobalSettings>) {
  return saveGlobalSettings({
    ...settingsSnapshot,
    ...patch,
  });
}

export function getGlobalSettingsText() {
  return serializeGlobalSettings(loadGlobalSettings());
}

export function applyGlobalSettingsText(text: string) {
  try {
    const parsed = parseGlobalSettingsText(text);
    const nextSettings = normalizeGlobalSettings({
      ...settingsSnapshot,
      ...parsed,
    });
    saveGlobalSettings(nextSettings);
    return { ok: true as const, settings: nextSettings };
  } catch (error) {
    console.warn("Failed to apply global settings text.", error);
    return { ok: false as const, error };
  }
}

export function normalizeGlobalSettings(rawSettings: unknown): GlobalSettings {
  const source = isRecord(rawSettings) ? rawSettings : {};
  return mapSettings((definition) =>
    definition.normalize(source[definition.key] ?? definition.defaultValue),
  );
}

function setGlobalSettingsSnapshot(settings: GlobalSettings) {
  settingsSnapshot = settings;
  dispatchGlobalSettingsChanged(settings);
  listeners.forEach((listener) => listener());
}

function readSettingsFromStore(): GlobalSettings {
  return mapSettings((definition) => {
    const stored = readSettingValue(definition.storageKey);
    return definition.normalize(
      stored === null ? definition.defaultValue : definition.deserialize(stored),
    );
  });
}

function writeSettingsToStore(settings: GlobalSettings) {
  for (const key of Object.keys(settingDefinitions) as Array<keyof GlobalSettings>) {
    const definition = settingDefinitions[key];
    writeSettingValue(definition.storageKey, definition.serialize(settings[key] as never));
  }
}

function mapSettings(
  mapDefinition: <Key extends keyof GlobalSettings>(
    definition: SettingDefinition<GlobalSettings[Key]>,
  ) => GlobalSettings[Key],
): GlobalSettings {
  const settings = {} as GlobalSettings;
  for (const key of Object.keys(settingDefinitions) as Array<keyof GlobalSettings>) {
    const definition = settingDefinitions[key] as SettingDefinition<GlobalSettings[typeof key]>;
    settings[key] = mapDefinition(definition) as never;
  }
  return settings;
}

function serializeGlobalSettings(settings: GlobalSettings) {
  return (Object.keys(settingDefinitions) as Array<keyof GlobalSettings>)
    .map((key) => {
      const definition = settingDefinitions[key];
      return `${String(key)}=${definition.serialize(settings[key] as never)}`;
    })
    .join("\n");
}

function parseGlobalSettingsText(text: string): Partial<GlobalSettings> {
  const patch: Partial<GlobalSettings> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim() as keyof GlobalSettings;
    const definition = settingDefinitions[key];
    if (!definition) continue;

    const value = trimmed.slice(separatorIndex + 1).trim();
    patch[key] = definition.normalize(definition.deserialize(value)) as never;
  }
  return patch;
}

function numberSetting(
  key: keyof GlobalSettings,
  min: number,
  max: number,
  defaultValue: number,
): SettingDefinition<number> {
  return {
    key,
    storageKey: storageKeyFor(key),
    defaultValue,
    normalize: (value) => clampNumber(value, min, max, defaultValue),
    serialize: (value) => String(value),
    deserialize: (value) => Number(value),
  };
}

function textSetting(
  key: keyof GlobalSettings,
  defaultValue: string,
): SettingDefinition<string> {
  return {
    key,
    storageKey: storageKeyFor(key),
    defaultValue,
    normalize: (value) => normalizeTextSetting(value, defaultValue),
    serialize: (value) => value,
    deserialize: (value) => value,
  };
}

function enumSetting<T extends string>(
  key: keyof GlobalSettings,
  options: readonly T[],
  defaultValue: T,
): SettingDefinition<T> {
  return {
    key,
    storageKey: storageKeyFor(key),
    defaultValue,
    normalize: (value) => (options.includes(value as T) ? (value as T) : defaultValue),
    serialize: (value) => value,
    deserialize: (value) => value,
  };
}

function fontStacksSetting(
  key: keyof GlobalSettings,
  defaultValue: FontStackSettings,
): SettingDefinition<FontStackSettings> {
  return {
    key,
    storageKey: storageKeyFor(key),
    defaultValue,
    normalize: normalizeFontStacks,
    serialize: (value) =>
      [
        value["sans-serif"],
        value.serif,
        value.monospace,
      ].join("|"),
    deserialize: (value) => {
      const [sansSerif, serif, monospace] = value.split("|");
      return {
        "sans-serif": sansSerif,
        serif,
        monospace,
      };
    },
  };
}

function dispatchGlobalSettingsChanged(settings: GlobalSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GlobalSettings>(globalSettingsChangedEvent, { detail: settings }));
}

function readSettingValue(key: string) {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

function writeSettingValue(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value);
}

function storageKeyFor(key: keyof GlobalSettings) {
  return `${globalSettingsStoragePrefix}${String(key)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeTextSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeFontStacks(value: unknown): FontStackSettings {
  const source = isRecord(value) ? value : {};
  return {
    "sans-serif": normalizeFontStack(source["sans-serif"], defaultFontStacks["sans-serif"]),
    serif: normalizeFontStack(source.serif, defaultFontStacks.serif),
    monospace: normalizeFontStack(source.monospace, defaultFontStacks.monospace),
  };
}

function normalizeFontStack(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const stack = value.trim();
  return stack.length > 0 && stack.length <= 240 ? stack : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
