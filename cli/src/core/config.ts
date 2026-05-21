import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { KnError, ErrorCode } from "./errors";

export interface GlobalConfig {
  activeVault: string | null;
  vaults: Record<string, { name: string; path: string }>;
}

export interface ContainerConfig {
  name: string;
  runtime?: "podman" | "docker";
}

export interface VaultConfig {
  embedding: {
    baseUrl?: string;
    apiKey?: string;
    model: string;
    container?: ContainerConfig;
  };
  search: {
    fusionAlpha: number;
  };
  preprocessor?: {
    alias: string;
    command: string;
  } | null;
}

const KN_DIR = process.env.KN_HOME || join(homedir(), ".kn");
const GLOBAL_CONFIG_PATH = join(KN_DIR, "config.json");

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  activeVault: null,
  vaults: {},
};

const DEFAULT_VAULT_CONFIG: VaultConfig = {
  embedding: {
    model: "nomic-embed-text",
  },
  search: {
    fusionAlpha: 0.8,
  },
  preprocessor: null,
};

async function ensureKnDir(): Promise<void> {
  try {
    mkdirSync(KN_DIR, { recursive: true });
  } catch (e) {
    // Directory may already exist
  }
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  await ensureKnDir();
  try {
    const file = Bun.file(GLOBAL_CONFIG_PATH);
    const exists = await file.exists();
    if (!exists) {
      await saveGlobalConfig(DEFAULT_GLOBAL_CONFIG);
      return DEFAULT_GLOBAL_CONFIG;
    }
    const content = await file.text();
    return JSON.parse(content) as GlobalConfig;
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to load global config: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureKnDir();
  try {
    await Bun.write(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to save global config: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function getActiveVault(): Promise<{ name: string; path: string } | null> {
  const config = await loadGlobalConfig();
  if (!config.activeVault) {
    return null;
  }
  const vault = config.vaults[config.activeVault];
  return vault || null;
}

export async function setActiveVault(name: string): Promise<void> {
  const config = await loadGlobalConfig();
  if (!config.vaults[name]) {
    throw new KnError(ErrorCode.VAULT_NOT_FOUND, `Vault "${name}" not found`);
  }
  config.activeVault = name;
  await saveGlobalConfig(config);
}

export async function registerVault(name: string, path: string): Promise<void> {
  const config = await loadGlobalConfig();
  if (config.vaults[name]) {
    throw new KnError(ErrorCode.VAULT_EXISTS, `Vault "${name}" already exists`);
  }
  config.vaults[name] = { name, path };
  if (!config.activeVault) {
    config.activeVault = name;
  }
  await saveGlobalConfig(config);
}

export async function unregisterVault(name: string): Promise<void> {
  const config = await loadGlobalConfig();
  if (!config.vaults[name]) {
    throw new KnError(ErrorCode.VAULT_NOT_FOUND, `Vault "${name}" not found`);
  }
  delete config.vaults[name];
  if (config.activeVault === name) {
    config.activeVault = Object.keys(config.vaults)[0] || null;
  }
  await saveGlobalConfig(config);
}

export async function loadVaultConfig(vaultRoot: string): Promise<VaultConfig> {
  const vaultConfigPath = join(vaultRoot, ".kn", "vault.json");
  try {
    const file = Bun.file(vaultConfigPath);
    const exists = await file.exists();
    if (!exists) {
      await saveVaultConfig(vaultRoot, DEFAULT_VAULT_CONFIG);
      return DEFAULT_VAULT_CONFIG;
    }
    const content = await file.text();
    return JSON.parse(content) as VaultConfig;
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to load vault config at ${vaultRoot}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function saveVaultConfig(vaultRoot: string, config: VaultConfig): Promise<void> {
  const vaultConfigPath = join(vaultRoot, ".kn", "vault.json");
  try {
    const dir = join(vaultRoot, ".kn");
    mkdirSync(dir, { recursive: true });
    await Bun.write(vaultConfigPath, JSON.stringify(config, null, 2));
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to save vault config at ${vaultRoot}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function resolveVaultRoot(nameOrDefault?: string): Promise<string> {
  const config = await loadGlobalConfig();

  if (nameOrDefault) {
    const vault = config.vaults[nameOrDefault];
    if (!vault) {
      throw new KnError(ErrorCode.VAULT_NOT_FOUND, `Vault "${nameOrDefault}" not found`);
    }
    return vault.path;
  }

  if (config.activeVault) {
    const vault = config.vaults[config.activeVault];
    if (vault) {
      return vault.path;
    }
  }

  throw new KnError(
    ErrorCode.VAULT_NOT_FOUND,
    "No active vault found. Use 'kn vault set' to set an active vault."
  );
}
