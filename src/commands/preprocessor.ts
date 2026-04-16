import { Command } from "commander";

export function registerPreprocessorCommand(program: Command): void {
  const preprocessorCmd = program
    .command("preprocessor")
    .description("Manage preprocessors for file conversion (install, add, bind, list, remove)");

  preprocessorCmd
    .command("install <language>")
    .action((language) => {
      console.log("Not yet implemented: kn preprocessor install");
    });

  preprocessorCmd
    .command("add <alias> <command>")
    .action((alias, command) => {
      console.log("Not yet implemented: kn preprocessor add");
    });

  preprocessorCmd
    .command("bind <alias> [vault]")
    .action((alias, vault) => {
      console.log("Not yet implemented: kn preprocessor bind");
    });

  preprocessorCmd
    .command("list")
    .action(() => {
      console.log("Not yet implemented: kn preprocessor list");
    });

  preprocessorCmd
    .command("remove <alias>")
    .option("--delete", "Delete preprocessor configuration")
    .action((alias, options) => {
      console.log("Not yet implemented: kn preprocessor remove");
    });
}
