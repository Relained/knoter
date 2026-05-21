import { Command } from "commander";
import { resolveVaultRoot } from "../core/config";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";
import { error, render, success, type OutputFormat } from "../core/output";
import { resolveVaultName } from "../core/template";
import {
  buildReportContextBundle,
  parseDateOption,
  parseLayerOption,
  parseTopOption,
} from "../core/report-context";
import { MetaDB } from "../stores/meta-store";

export function registerReportCommand(program: Command): void {
  const reportCmd = program.command("report").description("Build report context bundles");

  reportCmd
    .command("context")
    .description("Build JSON-ready context bundle for external report agents")
    .requiredOption("--date <YYYY-MM-DD>", "Target logical date")
    .option("--template <id>", "Template label to echo in output")
    .option("--layer <source|rewritten|artifact|all>", "Document layer filter for retrieval", "rewritten")
    .option("--top <n>", "FTS results per retrieval query", "20")
    .option("--include-artifacts", "Include artifact notes in dailyNotes and retrieval")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault as string | undefined;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = (await resolveVaultName(vaultOpt)) ?? "default";
        const date = parseDateOption(options.date);
        const documentLayer = parseLayerOption(options.layer);
        const top = parseTopOption(options.top);
        const includeArtifacts = !!options.includeArtifacts;
        const metaDb = new MetaDB(vaultRoot);
        try {
          const bundle = await buildReportContextBundle({
            metaDb,
            vaultName,
            date,
            templateArg: options.template,
            templateVaultOpt: vaultOpt,
            top,
            layer: documentLayer,
            includeArtifacts,
          });

          render(
            success(
              "report context",
              bundle,
              vaultName,
            ),
            format,
          );
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("report context", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
