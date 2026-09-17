import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { KnError, ErrorCode } from "./errors";

/**
 * Configuration is file-based only — no environment variables.
 *
 * - Global config: `~/.config/knoter/config.json`. Registers vault paths and
 *   global defaults (agent backends available on this machine, embedding
 *   endpoint, sync interval).
 * - Vault config: `<vault>/config.json`. Optional partial override of the
 *   global defaults for that vault.
 *
 * `loadVaultConfig()` returns the merged effective config.
 */

export interface AgentBackendConfig {
  /** Executable name or absolute path. */
  bin: string;
  /** Arguments placed before the prompt (e.g. ["exec"] for codex, ["-p"] for claude). */
  args: string[];
}

export interface AgentConfig {
  /** Selected backend key in `backends`; null disables agent invocation. */
  backend: string | null;
  backends: Record<string, AgentBackendConfig>;
  timeoutMs: number;
}

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface SearchConfig {
  fusionAlpha: number;
}

export interface SyncConfig {
  intervalMinutes: number;
}

export interface GlobalConfig {
  activeVault: string | null;
  vaults: Record<string, { name: string; path: string }>;
  /** Default parent directory for `kn vault init <name>` without --path. */
  defaultVaultDir: string;
  agent: AgentConfig;
  embedding: EmbeddingConfig;
  search: SearchConfig;
  sync: SyncConfig;
}

/** Per-vault override file (<vault>/config.json). All fields optional. */
export interface VaultConfigOverride {
  embedding?: Partial<EmbeddingConfig>;
  agent?: Partial<Pick<AgentConfig, "backend" | "timeoutMs">>;
  search?: Partial<SearchConfig>;
}

/** Effective per-vault config: global defaults merged with the vault override. */
export interface VaultConfig {
  embedding: EmbeddingConfig;
  agent: AgentConfig;
  search: SearchConfig;
}

const CONFIG_DIR = join(homedir(), ".config", "knoter");
const GLOBAL_CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const VAULT_CONFIG_FILE = "config.json";

function defaultGlobalConfig(): GlobalConfig {
  return {
    activeVault: null,
    vaults: {},
    defaultVaultDir: join(homedir(), "Documents"),
    agent: {
      backend: null,
      backends: {
        codex: { bin: "codex", args: ["exec"] },
        claude: { bin: "claude", args: ["-p"] },
      },
      timeoutMs: 600_000,
    },
    embedding: {
      baseUrl: "http://127.0.0.1:39280",
      model: "nomic-embed-text",
    },
    search: {
      fusionAlpha: 0.8,
    },
    sync: {
      intervalMinutes: 10,
    },
  };
}

export function globalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const file = Bun.file(GLOBAL_CONFIG_PATH);
    if (!(await file.exists())) {
      const config = defaultGlobalConfig();
      await saveGlobalConfig(config);
      return config;
    }
    const raw = JSON.parse(await file.text()) as Partial<GlobalConfig>;
    return normalizeGlobalConfig(raw);
  } catch (e) {
    if (e instanceof KnError) throw e;
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to load global config at ${GLOBAL_CONFIG_PATH}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    await Bun.write(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to save global config: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Fill missing fields so hand-edited configs stay loadable. */
function normalizeGlobalConfig(raw: Partial<GlobalConfig>): GlobalConfig {
  const defaults = defaultGlobalConfig();
  return {
    activeVault: raw.activeVault ?? null,
    vaults: raw.vaults ?? {},
    defaultVaultDir: raw.defaultVaultDir || defaults.defaultVaultDir,
    agent: {
      backend: raw.agent?.backend ?? defaults.agent.backend,
      backends: raw.agent?.backends && Object.keys(raw.agent.backends).length > 0
        ? raw.agent.backends
        : defaults.agent.backends,
      timeoutMs: raw.agent?.timeoutMs ?? defaults.agent.timeoutMs,
    },
    embedding: {
      baseUrl: raw.embedding?.baseUrl || defaults.embedding.baseUrl,
      model: raw.embedding?.model || defaults.embedding.model,
      ...(raw.embedding?.apiKey ? { apiKey: raw.embedding.apiKey } : {}),
    },
    search: {
      fusionAlpha: raw.search?.fusionAlpha ?? defaults.search.fusionAlpha,
    },
    sync: {
      intervalMinutes: raw.sync?.intervalMinutes ?? defaults.sync.intervalMinutes,
    },
  };
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

/** Effective vault config: global defaults overridden by <vault>/config.json. */
export async function loadVaultConfig(vaultRoot: string): Promise<VaultConfig> {
  const global = await loadGlobalConfig();
  let override: VaultConfigOverride = {};

  const overridePath = join(vaultRoot, VAULT_CONFIG_FILE);
  try {
    const file = Bun.file(overridePath);
    if (await file.exists()) {
      override = JSON.parse(await file.text()) as VaultConfigOverride;
    }
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to load vault config at ${overridePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    embedding: {
      ...global.embedding,
      ...(override.embedding ?? {}),
    },
    agent: {
      ...global.agent,
      ...(override.agent ?? {}),
    },
    search: {
      ...global.search,
      ...(override.search ?? {}),
    },
  };
}

export async function saveVaultConfigOverride(
  vaultRoot: string,
  override: VaultConfigOverride,
): Promise<void> {
  const overridePath = join(vaultRoot, VAULT_CONFIG_FILE);
  try {
    mkdirSync(vaultRoot, { recursive: true });
    await Bun.write(overridePath, JSON.stringify(override, null, 2));
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to save vault config at ${overridePath}: ${e instanceof Error ? e.message : String(e)}`,
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
    "No active vault found. Use 'kn vault switch' to set an active vault.",
  );
}

/** Resolve the vault name for output envelopes. */
export async function resolveVaultName(vaultOpt?: string): Promise<string> {
  if (vaultOpt) return vaultOpt;
  const config = await loadGlobalConfig();
  return config.activeVault || "default";
}
