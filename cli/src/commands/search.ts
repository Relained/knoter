import { Command } from "commander";
import { search, type SearchMode } from "../search/hybrid";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";

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
    .option("--tag <tag...>", "Filter by tags")
    .option("--after <date>", "Results after date")
    .option("--before <date>", "Results before date")
    .option("--lang <lang>", "Filter by language (ko/ja/zh→cjk, en→latin, or cjk/latin)")
    .option("--include-artifacts", "Include generated artifacts in search results")
    .action(async (query, options, cmd) => {
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
          tags: options.tag,
          after: options.after,
          before: options.before,
          lang,
          includeArtifacts: !!options.includeArtifacts,
        });

        const envelope = success("search", {
          query,
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
            tags: r.tags,
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
