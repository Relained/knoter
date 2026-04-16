import { Command } from "commander";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { confirm } from "@clack/prompts";
import {
  loadGlobalConfig,
  saveGlobalConfig,
  setActiveVault,
  registerVault,
  unregisterVault,
  loadVaultConfig,
  saveVaultConfig,
  resolveVaultRoot,
} from "../core/config";
import { success, error, render } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";
import { MetaDB } from "../stores/meta-store";
import { createVaultCollection, type EmbeddingModel } from "../stores/vec-store";
import type { OutputFormat } from "../core/output";

export function registerVaultCommand(program: Command): void {
  const vaultCmd = program
    .command("vault")
    .description("Manage vaults (create, list, switch, delete, status)");

  vaultCmd
    .command("create <name>")
    .option("--path <dir>", "Vault directory path")
    .option("--model <model>", "Embedding model to use")
    .action(async (name, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        logger.debug(`Creating vault: ${name}`);

        // Resolve vault path: use --path or default to current directory
        const vaultPath = options.path ? options.path : join(process.cwd(), name);
        const modelStr = options.model || "nomic-embed-text";

        // Validate that the model is a supported embedding model
        const supportedModels = ["nomic-embed-text", "bge-m3"];
        if (!supportedModels.includes(modelStr)) {
          throw new KnError(
            ErrorCode.CONFIG_INVALID,
            `Unsupported embedding model: ${modelStr}. Supported: ${supportedModels.join(", ")}`
          );
        }
        const model = modelStr as EmbeddingModel;

        logger.debug(`Vault path: ${vaultPath}`);
        logger.debug(`Embedding model: ${model}`);

        // Check vault doesn't already exist in config
        const globalConfig = await loadGlobalConfig();
        if (globalConfig.vaults[name]) {
          throw new KnError(
            ErrorCode.VAULT_EXISTS,
            `Vault "${name}" already exists`
          );
        }

        // Create vault root + .kn/ dir
        mkdirSync(join(vaultPath, ".kn"), { recursive: true });
        logger.info(`Created .kn directory at ${vaultPath}`);

        // Create MetaDB - this creates .kn/meta.db
        const meta = new MetaDB(vaultPath);
        meta.setEmbeddingModel(name, model);
        logger.info(`Set embedding model: ${model}`);

        // Create zvec collection
        const vectorDir = join(vaultPath, ".kn", "vectors");
        createVaultCollection(vectorDir, name, model);
        logger.info(`Created zvec collection at ${vectorDir}`);

        // Register in global config
        await registerVault(name, vaultPath);
        logger.info(`Registered vault in global config`);

        // Save vault config with chosen model
        const defaultVaultConfig = {
          embedding: {
            model,
          },
          llm: {},
          modelProfiles: {},
          search: {
            fusionAlpha: 0.8,
          },
          preprocessor: null,
        };
        await saveVaultConfig(vaultPath, defaultVaultConfig);
        logger.info(`Saved vault configuration`);

        // Close MetaDB
        meta.close();

        const envelope = success(
          "vault create",
          {
            name,
            path: vaultPath,
            model,
          },
          name
        );
        render(envelope, format);
      } catch (err) {
        const format = cmd.optsWithGlobals?.()?.format || "text";
        if (err instanceof KnError) {
          render(error("vault create", err.code, err.message), format as OutputFormat);
          process.exit(err.exitCode);
        } else {
          render(
            error(
              "vault create",
              ErrorCode.UNKNOWN,
              err instanceof Error ? err.message : String(err)
            ),
            format as OutputFormat
          );
          process.exit(1);
        }
      }
    });

  vaultCmd
    .command("list")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        logger.debug("Listing all vaults");

        // Load global config
        const globalConfig = await loadGlobalConfig();

        // Format vault list with active marker
        const vaults = Object.values(globalConfig.vaults).map((vault) => ({
          name: vault.name,
          path: vault.path,
          active: vault.name === globalConfig.activeVault,
        }));

        logger.info(`Found ${vaults.length} vault(s)`);

        const envelope = success("vault list", {
          vaults,
          activeVault: globalConfig.activeVault,
        });
        render(envelope, format);
      } catch (err) {
        const format = cmd.optsWithGlobals?.()?.format || "text";
        if (err instanceof KnError) {
          render(error("vault list", err.code, err.message), format as OutputFormat);
          process.exit(err.exitCode);
        } else {
          render(
            error(
              "vault list",
              ErrorCode.UNKNOWN,
              err instanceof Error ? err.message : String(err)
            ),
            format as OutputFormat
          );
          process.exit(1);
        }
      }
    });

  vaultCmd
    .command("switch <name>")
    .action(async (name, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        logger.debug(`Switching to vault: ${name}`);

        // Call setActiveVault - throws VAULT_NOT_FOUND if missing
        await setActiveVault(name);
        logger.info(`Switched to vault: ${name}`);

        const envelope = success(
          "vault switch",
          {
            activeVault: name,
          },
          name
        );
        render(envelope, format);
      } catch (err) {
        const format = cmd.optsWithGlobals?.()?.format || "text";
        if (err instanceof KnError) {
          render(error("vault switch", err.code, err.message), format as OutputFormat);
          process.exit(err.exitCode);
        } else {
          render(
            error(
              "vault switch",
              ErrorCode.UNKNOWN,
              err instanceof Error ? err.message : String(err)
            ),
            format as OutputFormat
          );
          process.exit(1);
        }
      }
    });

  vaultCmd
    .command("delete <name>")
    .option("--confirm", "Skip confirmation prompt")
    .action(async (name, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        logger.debug(`Deleting vault: ${name}`);

        // If no --confirm, ask for confirmation
        if (!options.confirm) {
          const shouldDelete = await confirm({
            message: `Delete vault "${name}" and all its data?`,
          });
          if (!shouldDelete || typeof shouldDelete === "symbol") {
            logger.info("Deletion cancelled");
            const envelope = success("vault delete", {
              cancelled: true,
              name,
            });
            render(envelope, format);
            return;
          }
        }

        // Resolve vault path from config
        const vaultRoot = await resolveVaultRoot(name);
        logger.debug(`Vault root: ${vaultRoot}`);

        // Remove .kn/ directory recursively
        const knDir = join(vaultRoot, ".kn");
        if (existsSync(knDir)) {
          rmSync(knDir, { recursive: true, force: true });
          logger.info(`Removed .kn directory`);
        }

        // Unregister from global config
        await unregisterVault(name);
        logger.info(`Unregistered vault from global config`);

        const envelope = success(
          "vault delete",
          {
            deleted: true,
            name,
          },
          name
        );
        render(envelope, format);
      } catch (err) {
        const format = cmd.optsWithGlobals?.()?.format || "text";
        if (err instanceof KnError) {
          render(error("vault delete", err.code, err.message), format as OutputFormat);
          process.exit(err.exitCode);
        } else {
          render(
            error(
              "vault delete",
              ErrorCode.UNKNOWN,
              err instanceof Error ? err.message : String(err)
            ),
            format as OutputFormat
          );
          process.exit(1);
        }
      }
    });

  vaultCmd
    .command("status [name]")
    .action(async (name, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        logger.debug(`Getting status for vault: ${name || "(active)"}`);

        // Resolve vault root (by name or active)
        const vaultRoot = await resolveVaultRoot(name);
        const vaultName = name || (await loadGlobalConfig()).activeVault || "unknown";
        logger.debug(`Vault root: ${vaultRoot}`);

        // Open MetaDB at vault root
        const meta = new MetaDB(vaultRoot);

        // Get vault status - use the vault name as vaultId
        const vaultStatus = meta.getVaultStatus(vaultName);
        logger.debug(`Vault status: ${JSON.stringify(vaultStatus)}`);

        // Also load vault config for extra info
        const vaultConfig = await loadVaultConfig(vaultRoot);
        logger.debug(`Vault config loaded`);

        // Close MetaDB
        meta.close();

        const envelope = success(
          "vault status",
          {
            vault: vaultName,
            path: vaultRoot,
            status: vaultStatus,
            config: {
              embedding: vaultConfig.embedding,
              preprocessor: vaultConfig.preprocessor,
            },
          },
          vaultName
        );
        render(envelope, format);
      } catch (err) {
        const format = cmd.optsWithGlobals?.()?.format || "text";
        if (err instanceof KnError) {
          render(error("vault status", err.code, err.message), format as OutputFormat);
          process.exit(err.exitCode);
        } else {
          render(
            error(
              "vault status",
              ErrorCode.UNKNOWN,
              err instanceof Error ? err.message : String(err)
            ),
            format as OutputFormat
          );
          process.exit(1);
        }
      }
    });
}
