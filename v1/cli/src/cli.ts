#!/usr/bin/env bun
import { Command } from "commander";
import { registerVaultCommand } from "./commands/vault";
import { registerSyncCommand } from "./commands/sync";
import { registerSearchCommand } from "./commands/search";
import { registerServiceCommand } from "./commands/service";

const program = new Command();

program
  .name("kn")
  .version("0.1.0")
  .description("Knowledge knot CLI — vault indexing, agent work queue, and search");

program
  .option("--format <type>", "Output format: text, json, jsonl", "text")
  .option("--vault <name>", "Vault name override")
  .option("--verbose", "Enable verbose logging");

// Command surface: vault (init/config), sync (index + queue + agent),
// search (llm-wiki hybrid by default), service (periodic sync scheduling).
registerVaultCommand(program);
registerSyncCommand(program);
registerSearchCommand(program);
registerServiceCommand(program);

program.parse(process.argv);
