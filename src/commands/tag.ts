import { Command } from "commander";

export function registerTagCommand(program: Command): void {
  const tagCmd = program
    .command("tag")
    .description("Manage tags (list, add, remove, auto)");

  tagCmd
    .command("list")
    .action(() => {
      console.log("Not yet implemented: kn tag list");
    });

  tagCmd
    .command("add <target> <tags...>")
    .action((target, tags) => {
      console.log("Not yet implemented: kn tag add");
    });

  tagCmd
    .command("remove <target> <tags...>")
    .action((target, tags) => {
      console.log("Not yet implemented: kn tag remove");
    });

  tagCmd
    .command("auto")
    .option("--dry-run", "Preview changes without applying")
    .action((options) => {
      console.log("Not yet implemented: kn tag auto");
    });
}
