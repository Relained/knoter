import { Command } from "commander";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search notes by semantic and keyword similarity")
    .option("--mode <mode>", "Search mode: semantic, keyword, or hybrid")
    .option("--top <n>", "Number of results to return")
    .option("--semantic-min <f>", "Minimum semantic similarity score")
    .option("--keyword-min <f>", "Minimum keyword similarity score")
    .option("--hybrid-min <f>", "Minimum hybrid similarity score")
    .option("--tag <tag...>", "Filter by tags")
    .option("--after <date>", "Results after date")
    .option("--before <date>", "Results before date")
    .option("--rerank", "Apply reranking to results")
    .option("--expand", "Expand results with related notes")
    .action((query, options) => {
      console.log("Not yet implemented: kn search");
    });
}
