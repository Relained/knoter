import { Command } from "commander";

export function registerVaultCommand(program: Command): void {
  const vaultCmd = program
    .command("vault")
    .description("Manage vaults (create, list, switch, delete, status)");

  vaultCmd
    .command("create <name>")
    .option("--path <dir>", "Vault directory path")
    .option("--model <model>", "Embedding model to use")
    .action((name, options) => {
      console.log("Not yet implemented: kn vault create");
    });

  vaultCmd
    .command("list")
    .action(() => {
      console.log("Not yet implemented: kn vault list");
    });

  vaultCmd
    .command("switch <name>")
    .action((name) => {
      console.log("Not yet implemented: kn vault switch");
    });

  vaultCmd
    .command("delete <name>")
    .option("--confirm", "Skip confirmation prompt")
    .action((name, options) => {
      console.log("Not yet implemented: kn vault delete");
    });

  vaultCmd
    .command("status [name]")
    .action((name) => {
      console.log("Not yet implemented: kn vault status");
    });
}
