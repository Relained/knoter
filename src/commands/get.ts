import { Command } from "commander";

export function registerGetCommand(program: Command): void {
  program
    .command("get <targets...>")
    .description("Retrieve full note content")
    .option("--section <heading>", "Return specific section")
    .option("--offset <n>", "Character offset to start from")
    .option("--max-chars <n>", "Maximum characters to return")
    .option("--json", "Output as JSON")
    .action((targets, options) => {
      console.log("Not yet implemented: kn get");
    });
}
