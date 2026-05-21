#!/usr/bin/env bun
import { Command } from "commander";
import { registerVaultCommand } from "./commands/vault";
import { registerAddCommand } from "./commands/add";
import { registerSearchCommand } from "./commands/search";
import { registerSyncCommand } from "./commands/sync";
import { registerTagCommand } from "./commands/tag";
import { registerGetCommand } from "./commands/get";
import { registerTemplateCommand } from "./commands/template";
import { registerReportCommand } from "./commands/report";
import { registerMcpCommand } from "./commands/mcp";
import { registerServiceCommand } from "./commands/service";

const program = new Command();

program
  .name("kn")
  .version("0.1.0")
  .description("Knowledge knot CLI — index, search, and query your notes");

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
registerGetCommand(program);
registerTemplateCommand(program);
registerReportCommand(program);
registerMcpCommand(program);
registerServiceCommand(program);

program.parse(process.argv);
