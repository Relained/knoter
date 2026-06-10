import { Command } from "commander";
import { resolveVaultRoot } from "../core/config";
import { KnError, ErrorCode } from "../core/errors";
import { runLlmRewrite } from "../core/llm-rewrite";
import { setVerbose } from "../core/logger";
import { error, render, success, type OutputFormat } from "../core/output";
import { resolveVaultName } from "../core/template";

export function registerLlmCommand(program: Command): void {
  const llmCmd = program
    .command("llm")
    .description("Run explicit external LLM agent workflows");

  llmCmd
    .command("rewrite")
    .description("Call an external agent (Codex or Claude CLI) to create rewritten and artifact notes from a source note")
    .requiredOption("--source <path>", "Vault-relative source note path")
    .option("--agent <agent>", "External agent runtime: codex or claude", "codex")
    .option("--codex-bin <path>", "Codex CLI binary", process.env.KN_CODEX_BIN || "codex")
    .option("--claude-bin <path>", "Claude Code CLI binary", process.env.KN_CLAUDE_BIN || "claude")
    .option("--timeout-ms <n>", "Agent CLI timeout in milliseconds", "240000")
    .option("--rewritten-path <path>", "Vault-relative rewritten output path")
    .option("--workspace <path>", "Agent working directory")
    .option("--test-embeddings", "Use deterministic local embeddings for live agent smoke tests")
    .option("--force", "Overwrite existing rewritten/artifact notes")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault as string | undefined;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = (await resolveVaultName(vaultOpt)) ?? "default";
        const timeoutMs = parsePositiveInteger(options.timeoutMs, "--timeout-ms");
        if (options.agent !== "codex" && options.agent !== "claude") {
          throw new KnError(ErrorCode.CONFIG_INVALID, "Only --agent codex or --agent claude is supported.");
        }

        const result = await runLlmRewrite({
          vaultRoot,
          vaultName,
          sourcePath: options.source,
          agent: options.agent,
          codexBin: options.codexBin,
          claudeBin: options.claudeBin,
          timeoutMs,
          rewrittenPath: options.rewrittenPath,
          workspace: options.workspace,
          useDeterministicEmbeddings: !!options.testEmbeddings,
          force: !!options.force,
        });

        render(success("llm rewrite", result, vaultName), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("llm rewrite", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

function parsePositiveInteger(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new KnError(ErrorCode.CONFIG_INVALID, `${label} must be a positive integer.`);
  }
  return parsed;
}
