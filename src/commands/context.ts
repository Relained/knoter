import { Command } from "commander";
import { MetaDB } from "../stores/meta-store";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";

export function registerContextCommand(program: Command): void {
  const contextCmd = program
    .command("context")
    .description("Manage RAG context (add, list, remove, set-global)");

  // kn context add <path> <description>
  contextCmd
    .command("add <path> <description>")
    .action(async (path, description, _options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          metaDb.addContext(vaultName, path, description);
          logger.info(`Added context for path "${path}"`);

          render(
            success("context add", { path, description }, vaultName),
            format
          );
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("context add", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn context list
  contextCmd
    .command("list")
    .action(async (_options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          const contexts = metaDb.listContexts(vaultName);

          if (format === "text") {
            // Format as table in text mode
            const lines: string[] = [];
            if (contexts.length === 0) {
              lines.push("No contexts defined.");
            } else {
              lines.push("PATH PREFIX    DESCRIPTION");
              lines.push("─".repeat(60));
              for (const ctx of contexts) {
                const prefix =
                  ctx.path_prefix === "" ? "(global)" : ctx.path_prefix;
                lines.push(`${prefix.padEnd(15)} ${ctx.description}`);
              }
            }

            // Create custom output for text format
            console.log(lines.join("\n"));
          } else {
            // JSON output
            render(success("context list", { contexts }, vaultName), format);
          }
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("context list", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn context remove <path>
  contextCmd
    .command("remove <path>")
    .action(async (path, _options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          metaDb.removeContext(vaultName, path);
          logger.info(`Removed context for path "${path}"`);

          render(
            success("context remove", { path }, vaultName),
            format
          );
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("context remove", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn context set-global <description>
  contextCmd
    .command("set-global <description>")
    .action(async (description, _options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          // Global context uses empty string as path_prefix
          metaDb.addContext(vaultName, "", description);
          logger.info(`Set global context`);

          render(
            success("context set-global", { global: true, description }, vaultName),
            format
          );
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("context set-global", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
