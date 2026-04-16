import { Command } from "commander";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Synchronize vault with source files")
    .option("--full", "Perform full re-indexing")
    .option("--prune", "Remove deleted notes from index")
    .option("--changed", "Only sync changed files")
    .action((options) => {
      console.log("Not yet implemented: kn sync");
    });
}
