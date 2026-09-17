import { join } from "node:path";
import type { AgentWorkItem } from "../stores/meta-store";
import type { VaultConfig } from "./config";
import { logger } from "./logger";

/**
 * Agent invocation for `kn sync`: spawns the configured agent backend
 * (codex/claude CLI from the global/vault config) inside the vault directory
 * with a work prompt describing the queued source changes. The agent edits
 * vault files directly; the caller re-indexes afterwards and marks the queue
 * items done on success.
 */

export interface AgentRunResult {
  ran: boolean;
  backend: string | null;
  exitCode: number | null;
  durationMs: number;
  /** Reason when ran=false (no backend configured / unknown backend). */
  skippedReason?: string;
  stderrTail?: string;
}

export async function runAgentForQueue(input: {
  vaultRoot: string;
  vaultConfig: VaultConfig;
  items: AgentWorkItem[];
}): Promise<AgentRunResult> {
  const { agent } = input.vaultConfig;
  if (!agent.backend) {
    return {
      ran: false,
      backend: null,
      exitCode: null,
      durationMs: 0,
      skippedReason: "No agent backend configured (set agent.backend in the global or vault config)",
    };
  }
  const backend = agent.backends[agent.backend];
  if (!backend) {
    return {
      ran: false,
      backend: agent.backend,
      exitCode: null,
      durationMs: 0,
      skippedReason: `Agent backend "${agent.backend}" is not defined in agent.backends`,
    };
  }

  const prompt = await buildWorkPrompt(input.vaultRoot, input.items);
  const startedAt = performance.now();
  logger.info(`Running agent backend "${agent.backend}" for ${input.items.length} queued item(s)`);

  const child = Bun.spawn([backend.bin, ...backend.args, prompt], {
    cwd: input.vaultRoot,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => {
    logger.error(`Agent run timed out after ${agent.timeoutMs}ms, killing`);
    child.kill();
  }, agent.timeoutMs);

  let stderrText = "";
  try {
    stderrText = await new Response(child.stderr).text();
  } catch {
    // stderr capture is best-effort
  }
  const exitCode = await child.exited;
  clearTimeout(timeout);

  return {
    ran: true,
    backend: agent.backend,
    exitCode,
    durationMs: Math.round(performance.now() - startedAt),
    stderrTail: stderrText.slice(-2000) || undefined,
  };
}

async function buildWorkPrompt(vaultRoot: string, items: AgentWorkItem[]): Promise<string> {
  const changes = items
    .map((item) => `- [${item.change}] ${item.source_path}`)
    .join("\n");

  const workflowPath = join(vaultRoot, "templates", "workflow.md");
  let workflowNote = `Read templates/workflow.md for the full contract before writing anything.`;
  if (!(await Bun.file(workflowPath).exists())) {
    workflowNote =
      "templates/workflow.md is missing in this vault; follow the inline rules below conservatively.";
  }

  return [
    "You are the knoter vault maintenance agent. The working directory is a knoter vault:",
    "- sources/: raw user files (evidence only — never modify or delete)",
    "- artifacts/: durable documents you create/update/delete, each with an HTML display at the same path with .html",
    "- templates/: the workflow contract (workflow.md) and per-artifact templates with default HTML",
    "- .db/: knoter index storage — never touch it",
    "",
    workflowNote,
    "",
    "Queued source changes to process:",
    changes,
    "",
    "Tasks:",
    "1. Read each changed source. Use `kn search \"<query>\"` for llm-wiki context and `kn search \"<query>\" --scope all --mode keyword` for wider keyword lookup.",
    "2. Integrate durable knowledge into artifacts/llm-wiki.md per the wiki rules in the workflow contract.",
    "3. Create/update/delete the scenario artifacts justified by the evidence, following templates/.",
    "4. Keep every touched artifact's .html display in sync (create on create, update on change, delete on delete).",
    "5. For deleted sources, update or remove artifacts that depended on them.",
    "Only write inside artifacts/. When finished, print a one-paragraph summary of what changed.",
  ].join("\n");
}
