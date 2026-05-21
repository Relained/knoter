import { Command } from "commander";
import { resolveVaultRoot, loadGlobalConfig, loadVaultConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";
import { createEmbeddingProvider } from "../providers/factory";
import { checkEmbeddingHealth } from "../providers/health";

export function registerServiceCommand(program: Command): void {
  const serviceCmd = program
    .command("service")
    .description("Inspect external services used by kn");

  serviceCmd
    .command("status")
    .description("Check configured external service endpoints")
    .option("--check", "Probe service health")
    .action(async (options, cmd) => {
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

        const vaultConfig = await loadVaultConfig(vaultRoot);
        const data: Record<string, unknown> = {
          embedding: {
            baseUrl: vaultConfig.embedding.baseUrl ?? "https://api.openai.com",
            model: vaultConfig.embedding.model,
            managedBy: "external",
          },
        };

        if (options.check) {
          const provider = createEmbeddingProvider(vaultConfig);
          data.health = {
            embedding: await checkEmbeddingHealth(provider),
          };
        }

        render(success("service status", data, vaultName), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("service status", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
