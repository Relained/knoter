import { Command } from "commander";
import { resolve } from "node:path";
import {
  getEffectiveTemplate,
  readTemplateFile,
  resolveTemplateSource,
  resolveVaultName,
  type TemplateSource,
} from "../core/template";
import {
  buildUnableToValidateResult,
  validateTemplateContract,
  type TemplateValidationResult,
} from "../core/template-validation";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";

export function registerTemplateCommand(program: Command): void {
  const templateCmd = program
    .command("template")
    .description("Manage vault-local templates");

  templateCmd
    .command("get")
    .description("Get effective template (vault-local with fallback)")
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);
      const vaultOpt = globalOpts.vault;

      try {
        const vaultName = await resolveVaultName(vaultOpt);
        const template = await getEffectiveTemplate(vaultOpt);
        const response = success("template get", template, vaultName);

        render(response, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("template get", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  templateCmd
    .command("list")
    .description("List effective template (vault-local with fallback)")
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);
      const vaultOpt = globalOpts.vault;

      try {
        const vaultName = await resolveVaultName(vaultOpt);
        const template = await getEffectiveTemplate(vaultOpt);
        const response = success("template list", template, vaultName);

        render(response, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("template list", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  templateCmd
    .command("validate [path]")
    .description("Validate a template file or the effective template")
    .action(async (path, _options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      let source: TemplateSource = "path";
      let templatePath = "";

      try {
        let parsed;
        if (path) {
          templatePath = resolve(path);
          source = "path";
          parsed = await readTemplateFile(templatePath);
        } else {
          const effective = await resolveTemplateSource(globalOpts.vault);
          source = effective.source;
          templatePath = effective.path;
          parsed = await readTemplateFile(templatePath);
        }

        const result = validateTemplateContract({
          source,
          path: templatePath,
          parsed,
        });

        render(success("template validate", result), format);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const result: TemplateValidationResult = buildUnableToValidateResult({
          source,
          path: templatePath,
          message: msg,
        });
        render(success("template validate", result), format);
      }
    });
}
