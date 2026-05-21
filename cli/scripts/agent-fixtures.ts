#!/usr/bin/env bun
import { loadGlobalConfig, resolveVaultRoot } from "../src/core/config";
import { installAgentScenarioFixtures } from "../src/core/agent-fixtures";

interface Args {
  vault?: string;
  force: boolean;
  json: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  const vaultName = args.vault ?? (await loadGlobalConfig()).activeVault;
  if (!vaultName) {
    throw new Error("No active vault found. Pass --vault <name>.");
  }

  const vaultRoot = await resolveVaultRoot(vaultName);
  const result = await installAgentScenarioFixtures({
    vaultRoot,
    vaultName,
    force: args.force,
  });

  if (args.json) {
    console.log(JSON.stringify({ ok: true, data: result }, null, 2));
    return;
  }

  console.log("agent fixtures installed");
  console.log(`  template: ${result.templatePath}`);
  console.log(`  sources:  ${result.sourcesConsidered}`);
  console.log(
    `  rewritten: added ${result.rewritten.added}, updated ${result.rewritten.updated}, skipped ${result.rewritten.skipped}`,
  );
  console.log(
    `  artifacts:  added ${result.artifacts.added}, updated ${result.artifacts.updated}, skipped ${result.artifacts.skipped}`,
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--vault") {
      const value = argv[i + 1];
      if (!value) throw new Error("--vault requires a value");
      args.vault = value;
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
