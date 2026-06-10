import {
  applyGlobalSettingsText,
  getGlobalSettingsText,
  globalSettingsConfigFileName,
  loadGlobalSettings,
  saveGlobalSettings,
  type GlobalSettings
} from "./preferences";

export type GlobalConfigFileBridge = {
  readText?: (fileName: string) => string | Promise<string>;
  writeText?: (fileName: string, text: string) => boolean | void | Promise<boolean | void>;
  subscribe?: (fileName: string, listener: (text: string) => void) => void | (() => void);
};

export type GlobalConfigFileResult =
  | { ok: true; text?: string }
  | { ok: false; error: unknown };

export type GlobalConfigRuntime = {
  fileName: string;
  canUseFileBridge: () => boolean;
  getSettings: () => GlobalSettings;
  getText: () => string;
  applyText: (text: string) => ReturnType<typeof applyGlobalSettingsText>;
  syncFromFile: () => Promise<GlobalConfigFileResult>;
  syncToFile: () => Promise<GlobalConfigFileResult>;
  save: (settings: GlobalSettings) => boolean;
};

export function installGlobalConfigRuntime(): GlobalConfigRuntime {
  let unsubscribeFileBridge: (() => void) | null = null;
  const runtime: GlobalConfigRuntime = {
    fileName: globalSettingsConfigFileName,
    canUseFileBridge,
    getSettings: loadGlobalSettings,
    getText: getGlobalSettingsText,
    applyText: applyGlobalSettingsText,
    syncFromFile,
    syncToFile,
    save: saveGlobalSettings
  };

  window.knoterConfig = runtime;
  unsubscribeFileBridge = subscribeToConfigFileBridge();
  window.addEventListener("beforeunload", () => unsubscribeFileBridge?.(), { once: true });
  return runtime;
}

function canUseFileBridge() {
  return Boolean(window.knoterConfigFile?.readText || window.knoterConfigFile?.writeText);
}

async function syncFromFile(): Promise<GlobalConfigFileResult> {
  try {
    const text = await window.knoterConfigFile?.readText?.(globalSettingsConfigFileName);
    if (typeof text !== "string") return { ok: false, error: new Error("Global config file bridge cannot read text.") };

    const result = applyGlobalSettingsText(text);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, text };
  } catch (error) {
    console.warn("Failed to sync global config from file.", error);
    return { ok: false, error };
  }
}

async function syncToFile(): Promise<GlobalConfigFileResult> {
  try {
    const text = getGlobalSettingsText();
    const result = await window.knoterConfigFile?.writeText?.(globalSettingsConfigFileName, text);
    if (result === false) return { ok: false, error: new Error("Global config file bridge rejected the write.") };
    return { ok: true, text };
  } catch (error) {
    console.warn("Failed to sync global config to file.", error);
    return { ok: false, error };
  }
}

function subscribeToConfigFileBridge() {
  return window.knoterConfigFile?.subscribe?.(globalSettingsConfigFileName, (text) => {
    const result = applyGlobalSettingsText(text);
    if (!result.ok) console.warn("Failed to apply changed global config file.", result.error);
  }) ?? null;
}
