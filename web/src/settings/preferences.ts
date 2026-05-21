import { clampNumber } from "../utils/geometry";
import { parseJsonc } from "./jsonc";

export type FontFamilyPreference = "sans-serif" | "serif" | "monospace";

export type FontStackSettings = Record<FontFamilyPreference, string>;

export type GlobalSettings = {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  base16ThemeId: string;
  iconThemeId: string;
  uiFontFamily: FontFamilyPreference;
  uiFontSize: number;
  editorFontFamily: FontFamilyPreference;
  editorFontSize: number;
  fontStacks: FontStackSettings;
  motionScale: number;
  keybindingProfile: string;
};

export type GlobalSettingsRecord = {
  version: 1;
  current: GlobalSettings;
  previous: GlobalSettings | null;
  updatedAt: string;
};

export const sidebarWidthBounds = {
  min: 168,
  max: 420,
  default: 248
} as const;

export const fontSizeBounds = {
  ui: {
    min: 11,
    max: 20,
    default: 14
  },
  editor: {
    min: 12,
    max: 24,
    default: 14
  }
} as const;

export const fontFamilyOptions = ["sans-serif", "serif", "monospace"] as const satisfies readonly FontFamilyPreference[];

export const defaultFontStacks: FontStackSettings = {
  "sans-serif": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  serif: "Georgia, Cambria, Times New Roman, Times, serif",
  monospace: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace"
};

export const defaultGlobalSettings: GlobalSettings = {
  sidebarCollapsed: false,
  sidebarWidth: sidebarWidthBounds.default,
  base16ThemeId: "knoter-default-dark",
  iconThemeId: "lucide",
  uiFontFamily: "sans-serif",
  uiFontSize: fontSizeBounds.ui.default,
  editorFontFamily: "monospace",
  editorFontSize: fontSizeBounds.editor.default,
  fontStacks: defaultFontStacks,
  motionScale: 1,
  keybindingProfile: "default"
};

export const globalSettingsStorageKey = "knoter.global-settings.v1";
export const globalSettingsConfigFileName = "knoter.config.jsonc";
export const globalSettingsChangedEvent = "knoter:global-settings-changed";

export function loadGlobalSettings(): GlobalSettings {
  return loadGlobalSettingsRecord()?.current ?? defaultGlobalSettings;
}

export function saveGlobalSettings(settings: GlobalSettings) {
  try {
    const existingRecord = loadGlobalSettingsRecord();
    const nextRecord: GlobalSettingsRecord = {
      version: 1,
      current: normalizeGlobalSettings(settings),
      previous: existingRecord?.current ?? null,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(globalSettingsStorageKey, serializeGlobalSettingsRecord(nextRecord));
    dispatchGlobalSettingsChanged(nextRecord);
    return true;
  } catch (error) {
    console.warn("Failed to save global settings.", error);
    return false;
  }
}

export function loadGlobalSettingsRecord(): GlobalSettingsRecord | null {
  try {
    const rawSettings = localStorage.getItem(globalSettingsStorageKey);
    if (!rawSettings) return null;
    return normalizeGlobalSettingsRecord(parseJsonc(rawSettings));
  } catch (error) {
    console.warn("Failed to load global settings record. Falling back to defaults.", error);
    return null;
  }
}

export function getGlobalSettingsText() {
  return localStorage.getItem(globalSettingsStorageKey) ?? serializeGlobalSettingsRecord(
    createGlobalSettingsRecord(defaultGlobalSettings, null, "")
  );
}

export function applyGlobalSettingsText(text: string) {
  try {
    const existingRecord = loadGlobalSettingsRecord();
    const parsedRecord = normalizeGlobalSettingsRecord(parseJsonc(text));
    const record: GlobalSettingsRecord = {
      ...parsedRecord,
      previous: existingRecord?.current ?? parsedRecord.previous,
      updatedAt: parsedRecord.updatedAt || new Date().toISOString()
    };
    localStorage.setItem(globalSettingsStorageKey, serializeGlobalSettingsRecord(record));
    dispatchGlobalSettingsChanged(record);
    return { ok: true as const, settings: record.current };
  } catch (error) {
    console.warn("Failed to apply global settings text.", error);
    return { ok: false as const, error };
  }
}

export function serializeGlobalSettingsRecord(record: GlobalSettingsRecord) {
  return [
    "{",
    "  // Knoter global config. This file uses JSONC: JSON with comments and trailing commas.",
    "  // Intended filename: knoter.config.jsonc",
    "  \"version\": 1,",
    "  \"current\": {",
    `    \"sidebarCollapsed\": ${record.current.sidebarCollapsed},`,
    `    \"sidebarWidth\": ${record.current.sidebarWidth},`,
    `    \"base16ThemeId\": ${JSON.stringify(record.current.base16ThemeId)},`,
    `    \"iconThemeId\": ${JSON.stringify(record.current.iconThemeId)},`,
    `    \"uiFontFamily\": ${JSON.stringify(record.current.uiFontFamily)},`,
    `    \"uiFontSize\": ${record.current.uiFontSize},`,
    `    \"editorFontFamily\": ${JSON.stringify(record.current.editorFontFamily)},`,
    `    \"editorFontSize\": ${record.current.editorFontSize},`,
    `    \"fontStacks\": ${serializeFontStacks(record.current.fontStacks, 2)},`,
    `    \"motionScale\": ${record.current.motionScale},`,
    `    \"keybindingProfile\": ${JSON.stringify(record.current.keybindingProfile)}`,
    "  },",
    `  \"previous\": ${record.previous ? serializeGlobalSettings(record.previous, 2) : "null"},`,
    `  \"updatedAt\": ${JSON.stringify(record.updatedAt)}`,
    "}",
    ""
  ].join("\n");
}

export function normalizeGlobalSettings(rawSettings: unknown): GlobalSettings {
  if (!isRecord(rawSettings)) return defaultGlobalSettings;

  return {
    sidebarCollapsed: typeof rawSettings.sidebarCollapsed === "boolean"
      ? rawSettings.sidebarCollapsed
      : defaultGlobalSettings.sidebarCollapsed,
    sidebarWidth: clampNumber(
      rawSettings.sidebarWidth,
      sidebarWidthBounds.min,
      sidebarWidthBounds.max,
      defaultGlobalSettings.sidebarWidth
    ),
    base16ThemeId: normalizeTextSetting(rawSettings.base16ThemeId, defaultGlobalSettings.base16ThemeId),
    iconThemeId: normalizeTextSetting(rawSettings.iconThemeId, defaultGlobalSettings.iconThemeId),
    uiFontFamily: normalizeFontFamily(rawSettings.uiFontFamily, defaultGlobalSettings.uiFontFamily),
    uiFontSize: clampNumber(
      rawSettings.uiFontSize,
      fontSizeBounds.ui.min,
      fontSizeBounds.ui.max,
      defaultGlobalSettings.uiFontSize
    ),
    editorFontFamily: normalizeFontFamily(rawSettings.editorFontFamily, defaultGlobalSettings.editorFontFamily),
    editorFontSize: clampNumber(
      rawSettings.editorFontSize,
      fontSizeBounds.editor.min,
      fontSizeBounds.editor.max,
      defaultGlobalSettings.editorFontSize
    ),
    fontStacks: normalizeFontStacks(rawSettings.fontStacks),
    motionScale: clampNumber(rawSettings.motionScale, 0, 2, defaultGlobalSettings.motionScale),
    keybindingProfile: normalizeTextSetting(rawSettings.keybindingProfile, defaultGlobalSettings.keybindingProfile)
  };
}

export function normalizeGlobalSettingsRecord(rawRecord: unknown): GlobalSettingsRecord {
  if (!isRecord(rawRecord) || rawRecord.version !== 1) {
    return createGlobalSettingsRecord(normalizeGlobalSettings(rawRecord), null, "");
  }

  return createGlobalSettingsRecord(
    normalizeGlobalSettings(rawRecord.current),
    isRecord(rawRecord.previous) ? normalizeGlobalSettings(rawRecord.previous) : null,
    typeof rawRecord.updatedAt === "string" ? rawRecord.updatedAt : ""
  );
}

function createGlobalSettingsRecord(
  current: GlobalSettings,
  previous: GlobalSettings | null,
  updatedAt: string
): GlobalSettingsRecord {
  return {
    version: 1,
    current,
    previous,
    updatedAt
  };
}

function serializeGlobalSettings(settings: GlobalSettings, depth: number) {
  const indent = "  ".repeat(depth);
  const innerIndent = "  ".repeat(depth + 1);

  return [
    "{",
    `${innerIndent}\"sidebarCollapsed\": ${settings.sidebarCollapsed},`,
    `${innerIndent}\"sidebarWidth\": ${settings.sidebarWidth},`,
    `${innerIndent}\"base16ThemeId\": ${JSON.stringify(settings.base16ThemeId)},`,
    `${innerIndent}\"iconThemeId\": ${JSON.stringify(settings.iconThemeId)},`,
    `${innerIndent}\"uiFontFamily\": ${JSON.stringify(settings.uiFontFamily)},`,
    `${innerIndent}\"uiFontSize\": ${settings.uiFontSize},`,
    `${innerIndent}\"editorFontFamily\": ${JSON.stringify(settings.editorFontFamily)},`,
    `${innerIndent}\"editorFontSize\": ${settings.editorFontSize},`,
    `${innerIndent}\"fontStacks\": ${serializeFontStacks(settings.fontStacks, depth + 1)},`,
    `${innerIndent}\"motionScale\": ${settings.motionScale},`,
    `${innerIndent}\"keybindingProfile\": ${JSON.stringify(settings.keybindingProfile)}`,
    `${indent}}`
  ].join("\n");
}

function dispatchGlobalSettingsChanged(record: GlobalSettingsRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GlobalSettingsRecord>(globalSettingsChangedEvent, { detail: record }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeTextSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeFontFamily(value: unknown, fallback: FontFamilyPreference): FontFamilyPreference {
  return fontFamilyOptions.includes(value as FontFamilyPreference) ? value as FontFamilyPreference : fallback;
}

function normalizeFontStacks(value: unknown): FontStackSettings {
  const source = isRecord(value) ? value : {};
  return {
    "sans-serif": normalizeFontStack(source["sans-serif"], defaultFontStacks["sans-serif"]),
    serif: normalizeFontStack(source.serif, defaultFontStacks.serif),
    monospace: normalizeFontStack(source.monospace, defaultFontStacks.monospace)
  };
}

function normalizeFontStack(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const stack = value.trim();
  return stack.length > 0 && stack.length <= 240 ? stack : fallback;
}

function serializeFontStacks(fontStacks: FontStackSettings, depth: number) {
  const indent = "  ".repeat(depth);
  const innerIndent = "  ".repeat(depth + 1);

  return [
    "{",
    `${innerIndent}\"sans-serif\": ${JSON.stringify(fontStacks["sans-serif"])},`,
    `${innerIndent}\"serif\": ${JSON.stringify(fontStacks.serif)},`,
    `${innerIndent}\"monospace\": ${JSON.stringify(fontStacks.monospace)}`,
    `${indent}}`
  ].join("\n");
}
