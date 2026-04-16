#!/usr/bin/env bun
import { Command } from "commander";
import { registerVaultCommand } from "./commands/vault";
import { registerAddCommand } from "./commands/add";
import { registerSearchCommand } from "./commands/search";
import { registerSyncCommand } from "./commands/sync";
import { registerTagCommand } from "./commands/tag";
import { registerClusterCommand } from "./commands/cluster";
import { registerGetCommand } from "./commands/get";
import { registerContextCommand } from "./commands/context";
import { registerAskCommand } from "./commands/ask";
import { registerServeCommand } from "./commands/serve";
import { registerScheduleCommand } from "./commands/schedule";
import { registerPreprocessorCommand } from "./commands/preprocessor";

const program = new Command();

program
  .name("kn")
  .version("0.1.0")
  .description("Knowledge note CLI — index, search, and query your notes");

program
  .option("--format <type>", "Output format: text, json, jsonl", "text")
  .option("--vault <name>", "Vault name override")
  .option("--verbose", "Enable verbose logging");

// Register all subcommands
registerVaultCommand(program);
registerAddCommand(program);
registerSearchCommand(program);
registerSyncCommand(program);
registerTagCommand(program);
registerClusterCommand(program);
registerGetCommand(program);
registerContextCommand(program);
registerAskCommand(program);
registerServeCommand(program);
registerScheduleCommand(program);
registerPreprocessorCommand(program);

program.parse(process.argv);
