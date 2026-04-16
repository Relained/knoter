import { Command } from "commander";

export function registerClusterCommand(program: Command): void {
  program
    .command("cluster")
    .description("Analyze and manage note clusters")
    .option("--algorithm <alg>", "Clustering algorithm to use")
    .option("--min-cluster <n>", "Minimum cluster size")
    .option("--tag <tag...>", "Filter by tags")
    .option("--suggest-merge", "Suggest cluster merges")
    .option("--apply", "Apply suggested merges")
    .action((options) => {
      console.log("Not yet implemented: kn cluster");
    });
}
