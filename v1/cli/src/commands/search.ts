import { Command } from "commander";
import { search, type SearchMode } from "../search/hybrid";
import { resolveVaultRoot, resolveVaultName } from "../core/config";
import { ensureVaultSynced } from "../core/sync";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";
import type { SearchScope } from "../stores/meta-store";

const SEARCH_SCOPES: SearchScope[] = ["llm-wiki", "artifacts", "sources", "all"];

export function resolveHybridMinOption(options: { hybridMin?: string; threshold?: string }): number | undefined {
  const hybridMinRaw = options.hybridMin;
  const thresholdRaw = options.threshold;
  const raw = hybridMinRaw ?? thresholdRaw;
  if (!raw) return undefined;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search notes by semantic and keyword similarity")
    .option("--mode <mode>", "Search mode: semantic, keyword, or hybrid", "hybrid")
    .option("--top <n>", "Number of results to return", "10")
    .option("--semantic-min <f>", "Minimum semantic score")
    .option("--keyword-min <f>", "Minimum keyword score")
    .option("--hybrid-min <f>", "Minimum hybrid score")
    .option("--threshold <f>", "Deprecated alias for --hybrid-min")
    .option("--after <date>", "Results after date")
    .option("--before <date>", "Results before date")
    .option("--lang <lang>", "Filter by language (ko/ja/zh→cjk, en→latin, or cjk/latin)")
    .option(
      "--scope <scope>",
      "Search scope: llm-wiki (semantic+keyword), artifacts/sources/all (keyword only)",
      "llm-wiki",
    )
    .action(async (query, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = await resolveVaultName(vaultOpt);

        const scope = options.scope as SearchScope;
        if (!SEARCH_SCOPES.includes(scope)) {
          throw new KnError(
            ErrorCode.CONFIG_INVALID,
            `Invalid --scope. Use one of: ${SEARCH_SCOPES.join(", ")}.`,
          );
        }

        // Pick up direct file edits before querying.
        await ensureVaultSynced(vaultRoot, vaultName);

        // Map language codes to buckets
        let lang = options.lang;
        if (lang === "ko" || lang === "ja" || lang === "zh") {
          lang = "cjk";
        } else if (lang === "en") {
          lang = "latin";
        }

        const result = await search(vaultRoot, vaultName, query, {
          mode: (options.mode || "hybrid") as SearchMode,
          top: parseInt(options.top) || 10,
          semanticMin: options.semanticMin ? parseFloat(options.semanticMin) : undefined,
          keywordMin: options.keywordMin ? parseFloat(options.keywordMin) : undefined,
          hybridMin: resolveHybridMinOption(options),
          after: options.after,
          before: options.before,
          lang,
          scope,
        });

        const envelope = success("search", {
          query,
          scope,
          mode: result.mode,
          totalFound: result.totalFound,
          strongSignal: result.strongSignal,
          results: result.results.map(r => ({
            id: r.chunkId,
            noteId: r.noteId,
            filePath: r.filePath,
            title: r.title,
            heading: r.heading,
            headingPath: r.headingPath,
            content: r.content.substring(0, 200) + (r.content.length > 200 ? "..." : ""),
            createdAt: r.createdAt,
            score: r.score,
            scoreDetail: r.scoreDetail,
          })),
        }, vaultName);
        render(envelope, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("search", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
