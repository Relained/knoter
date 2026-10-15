import { Command } from "commander";
import { loadVaultConfig, resolveVaultName, resolveVaultRoot } from "../core/config";
import { runAgentForQueue } from "../core/agent-runner";
import { syncVaultStore } from "../core/sync";
import { withLock } from "../core/lock";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";
import { VaultStore } from "../stores/vault-store";

/**
 * kn sync: the periodic maintenance entry point (run manually or by the OS
 * service installed via `kn service install`).
 *
 * 1. Index pass — track source/artifact file changes, queue source changes.
 * 2. Agent pass — hand pending queue items to the configured agent backend,
 *    which updates llm-wiki and the other artifacts (md + html) in place.
 * 3. Re-index pass — chunk/embed the agent's edits (vectors for llm-wiki
 *    only) and mark the processed queue items done.
 */

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Index vault changes and run the maintenance agent on queued source changes")
    .option("--full", "Re-index every file even when hashes are unchanged")
    .option("--no-agent", "Index and queue only; skip agent invocation")
    .option("--reconcile", "Also verify llm-wiki chunks exist in the vector store")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault as string | undefined;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = await resolveVaultName(vaultOpt);
        const vaultConfig = await loadVaultConfig(vaultRoot);

        const store = new VaultStore({ vaultRoot, vaultName, vaultConfig });
        try {
          // Pass 1: index + queue.
          const indexResult = await withLock(vaultRoot, () =>
            syncVaultStore(store, {
              full: !!options.full,
              reconcile: !!options.reconcile,
            }),
          );

          const pendingItems = store.meta.listPendingAgentWork(vaultName);
          let agent = null as Awaited<ReturnType<typeof runAgentForQueue>> | null;
          let completed = 0;
          let reindex = null as Awaited<ReturnType<typeof syncVaultStore>> | null;

          // Pass 2: agent. The vault lock is intentionally released here —
          // the agent itself runs `kn search` against this vault.
          if (options.agent !== false && pendingItems.length > 0) {
            agent = await runAgentForQueue({ vaultRoot, vaultConfig, items: pendingItems });

            if (agent.ran && agent.exitCode === 0) {
              // Pass 3: index the agent's edits, then close out the queue.
              reindex = await withLock(vaultRoot, () =>
                syncVaultStore(store, { reconcile: false }),
              );
              completed = store.meta.completeAgentWork(
                vaultName,
                pendingItems.map((item) => item.id),
                `processed by ${agent.backend}`,
              );
            } else if (agent.ran) {
              logger.error(
                `Agent run failed (exit ${agent.exitCode}); queue items stay pending`,
              );
            } else {
              logger.warn(agent.skippedReason ?? "Agent run skipped");
            }
          }

          render(
            success(
              "sync",
              {
                index: indexResult,
                queue: {
                  pendingBeforeAgent: pendingItems.length,
                  completed,
                  remaining: store.meta.countPendingAgentWork(vaultName),
                },
                agent,
                ...(reindex ? { reindex } : {}),
              },
              vaultName,
            ),
            format,
          );

          if (agent?.ran && agent.exitCode !== 0) {
            process.exit(1);
          }
        } finally {
          store.close();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("sync", code, msg), format);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
