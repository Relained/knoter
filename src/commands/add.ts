import { Command } from "commander";

export function registerAddCommand(program: Command): void {
  program
    .command("add <target>")
    .description("Add files or directories to the vault")
    .option("--recursive", "Recursively add files from directory")
    .option("--tag <tag...>", "Tags to apply")
    .option("--dry-run", "Preview changes without applying")
    .option("--force", "Overwrite existing notes")
    .option("--chunk-strategy <strategy>", "Chunking strategy to use")
    .action((target, options) => {
      console.log("Not yet implemented: kn add");
    });
}
