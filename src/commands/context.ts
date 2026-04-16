import { Command } from "commander";

export function registerContextCommand(program: Command): void {
  const contextCmd = program
    .command("context")
    .description("Manage RAG context (add, list, remove, set-global)");

  contextCmd
    .command("add <path> <description>")
    .action((path, description) => {
      console.log("Not yet implemented: kn context add");
    });

  contextCmd
    .command("list")
    .action(() => {
      console.log("Not yet implemented: kn context list");
    });

  contextCmd
    .command("remove <path>")
    .action((path) => {
      console.log("Not yet implemented: kn context remove");
    });

  contextCmd
    .command("set-global <description>")
    .action((description) => {
      console.log("Not yet implemented: kn context set-global");
    });
}
