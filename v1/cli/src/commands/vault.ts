import { Command } from "commander";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { confirm } from "@clack/prompts";
import {
  loadGlobalConfig,
  setActiveVault,
  registerVault,
  unregisterVault,
  loadVaultConfig,
  saveVaultConfigOverride,
  resolveVaultRoot,
  resolveVaultName,
  type VaultConfigOverride,
} from "../core/config";
import { success, error, render } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { ensureVaultSynced } from "../core/sync";
import { setVerbose, logger } from "../core/logger";
import { MetaDB, VAULT_DB_DIR } from "../stores/meta-store";
import { createVaultCollection, EMBEDDING_DIMENSIONS } from "../stores/vec-store";
import { createEmbeddingProvider } from "../providers/factory";
import { checkEmbeddingHealth } from "../providers/health";
import type { OutputFormat } from "../core/output";

const BUNDLED_TEMPLATES_DIR = fileURLToPath(
  new URL("../../../res/templates", import.meta.url),
);

export function registerVaultCommand(program: Command): void {
  const vaultCmd = program
    .command("vault")
    .description("Manage vaults (init, list, switch, delete, status)");

  vaultCmd
    .command("init <name>")
    .description("Initialize a vault: templates/, sources/, artifacts/, .db/")
    .option("--path <dir>", "Vault directory (default: <defaultVaultDir>/<name>)")
    .option("--model <model>", "Embedding model override for this vault")
    .option("--dim <n>", "Embedding dimension (required for unknown models)")
    .option("--embedding-base-url <url>", "OpenAI-compatible embedding endpoint override")
    .option("--embedding-api-key <key>", "Embedding endpoint API key override")
    .action(async (name, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const globalConfig = await loadGlobalConfig();
        if (globalConfig.vaults[name]) {
          throw new KnError(ErrorCode.VAULT_EXISTS, `Vault "${name}" already exists`);
        }

        const vaultPath = options.path
          ? (options.path as string)
          : join(globalConfig.defaultVaultDir, name);
        const model = (options.model as string | undefined) || globalConfig.embedding.model;

        // Resolve dimension: explicit --dim overrides the preset table.
        const presetDim = EMBEDDING_DIMENSIONS[model];
        const dim = options.dim ? parseInt(options.dim, 10) : presetDim;
        if (!dim || isNaN(dim)) {
          throw new KnError(
            ErrorCode.CONFIG_INVALID,
            `Unknown embedding dimension for model "${model}". Pass --dim <n> explicitly.`,
          );
        }
        // Register so downstream createVaultCollection can look it up.
        EMBEDDING_DIMENSIONS[model] = dim;

        logger.debug(`Initializing vault "${name}" at ${vaultPath} (model: ${model})`);

        // Vault layout: user content directories + index storage.
        for (const dir of ["sources", "artifacts", "templates", VAULT_DB_DIR]) {
          mkdirSync(join(vaultPath, dir), { recursive: true });
        }

        const seededTemplates = seedTemplates(vaultPath);
        logger.info(`Seeded ${seededTemplates.length} template file(s)`);

        const meta = new MetaDB(vaultPath);
        meta.setEmbeddingModel(name, model);
        meta.close();

        createVaultCollection(join(vaultPath, VAULT_DB_DIR, "vectors"), name, model);
        logger.info(`Created vector collection`);

        // Vault config override only stores deviations from the global config.
        const override: VaultConfigOverride = {};
        if (options.model || options.embeddingBaseUrl || options.embeddingApiKey) {
          override.embedding = {
            ...(options.model ? { model } : {}),
            ...(options.embeddingBaseUrl ? { baseUrl: options.embeddingBaseUrl } : {}),
            ...(options.embeddingApiKey ? { apiKey: options.embeddingApiKey } : {}),
          };
          await saveVaultConfigOverride(vaultPath, override);
        }

        await registerVault(name, vaultPath);

        render(
          success(
            "vault init",
            {
              name,
              path: vaultPath,
              model,
              dim,
              templatesSeeded: seededTemplates,
            },
            name,
          ),
          format,
        );
      } catch (err) {
        renderCommandError("vault init", err, format);
      }
    });

  vaultCmd
    .command("list")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const globalConfig = await loadGlobalConfig();
        const vaults = Object.values(globalConfig.vaults).map((vault) => ({
          name: vault.name,
          path: vault.path,
          active: vault.name === globalConfig.activeVault,
        }));
        render(
          success("vault list", { vaults, activeVault: globalConfig.activeVault }),
          format,
        );
      } catch (err) {
        renderCommandError("vault list", err, format);
      }
    });

  vaultCmd
    .command("switch <name>")
    .action(async (name, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        await setActiveVault(name);
        render(success("vault switch", { activeVault: name }, name), format);
      } catch (err) {
        renderCommandError("vault switch", err, format);
      }
    });

  vaultCmd
    .command("delete <name>")
    .option("--confirm", "Skip confirmation prompt")
    .action(async (name, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        if (!options.confirm) {
          const shouldDelete = await confirm({
            message: `Delete vault "${name}" index data (.db) and unregister it? User files (sources/artifacts/templates) are kept.`,
          });
          if (!shouldDelete || typeof shouldDelete === "symbol") {
            render(success("vault delete", { cancelled: true, name }), format);
            return;
          }
        }

        const vaultRoot = await resolveVaultRoot(name);
        const dbDir = join(vaultRoot, VAULT_DB_DIR);
        if (existsSync(dbDir)) {
          rmSync(dbDir, { recursive: true, force: true });
          logger.info(`Removed ${dbDir}`);
        }
        await unregisterVault(name);

        render(success("vault delete", { deleted: true, name }, name), format);
      } catch (err) {
        renderCommandError("vault delete", err, format);
      }
    });

  vaultCmd
    .command("status [name]")
    .option("--check-providers", "Check health of embedding provider")
    .action(async (name, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultRoot = await resolveVaultRoot(name);
        const vaultName = await resolveVaultName(name);

        // Status doubles as the cheap "index my dropped files" trigger.
        await ensureVaultSynced(vaultRoot, vaultName);

        const meta = new MetaDB(vaultRoot);
        const vaultStatus = meta.getVaultStatus(vaultName);
        meta.close();

        const vaultConfig = await loadVaultConfig(vaultRoot);

        let providerHealth: Record<string, unknown> | undefined;
        if (options.checkProviders) {
          const embeddingProvider = createEmbeddingProvider(vaultConfig);
          providerHealth = { embedding: await checkEmbeddingHealth(embeddingProvider) };
        }

        render(
          success(
            "vault status",
            {
              vault: vaultName,
              path: vaultRoot,
              status: vaultStatus,
              config: {
                embedding: vaultConfig.embedding,
                agentBackend: vaultConfig.agent.backend,
              },
              ...(providerHealth && { providerHealth }),
            },
            vaultName,
          ),
          format,
        );
      } catch (err) {
        renderCommandError("vault status", err, format);
      }
    });
}

/** Copy bundled templates (workflow contract + per-artifact md/html) into the vault. */
function seedTemplates(vaultPath: string): string[] {
  const targetDir = join(vaultPath, "templates");
  let files: string[];
  try {
    files = readdirSync(BUNDLED_TEMPLATES_DIR);
  } catch {
    logger.warn(`Bundled templates not found at ${BUNDLED_TEMPLATES_DIR}`);
    return [];
  }

  const seeded: string[] = [];
  for (const file of files) {
    const target = join(targetDir, file);
    if (existsSync(target)) continue;
    copyFileSync(join(BUNDLED_TEMPLATES_DIR, file), target);
    seeded.push(file);
  }
  return seeded;
}

function renderCommandError(command: string, err: unknown, format: OutputFormat): void {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
  render(error(command, code, msg), format);
  process.exit(err instanceof KnError ? err.exitCode : 1);
}
