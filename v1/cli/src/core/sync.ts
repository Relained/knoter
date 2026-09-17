import { resolve, join } from "node:path";
import type { NoteRow } from "../stores/meta-store";
import { VaultStore } from "../stores/vault-store";
import { loadVaultConfig, type VaultConfig } from "./config";
import { withLock } from "./lock";
import { logger } from "./logger";
import { refreshDocumentGraph } from "./document-graph";

/**
 * Vault index synchronization.
 *
 * - `kn sync` runs the full flow: index pass -> queue pass -> agent
 *   invocation (commands/sync.ts) -> re-index.
 * - Read surfaces (search, vault status) call ensureVaultSynced() for an
 *   index-only pass so the index follows direct file edits.
 *
 * Source-layer changes land in the agent work queue (meta.db agent_queue);
 * the sync command hands them to the configured external agent backend.
 */

export interface SyncResult {
  recovered: number;
  added: number;
  updated: number;
  pruned: number;
  reconciled: number;
  queued: number;
  errors: string[];
}

export interface SyncOptions {
  /** Re-index every file even when hashes are unchanged. */
  full?: boolean;
  /** Only remove orphaned entries. */
  prune?: boolean;
  /** Only process changed files (skip new-file discovery). */
  changed?: boolean;
  /** Verify metadata chunks exist in the vector store (slow path). */
  reconcile?: boolean;
}

const ENSURE_DEBOUNCE_MS = 10_000;

/**
 * Best-effort incremental sync used as an implicit pre-read hook.
 * Debounced through meta.db sync_state so repeated one-shot CLI invocations
 * skip the scan. Never throws: lock contention or an unreachable embedding
 * endpoint must not block retrieval — the caller just sees a slightly stale
 * index.
 */
export async function ensureVaultSynced(
  vaultRoot: string,
  vaultName: string,
  options: { debounceMs?: number } = {},
): Promise<void> {
  const debounceMs = options.debounceMs ?? ENSURE_DEBOUNCE_MS;
  let store: VaultStore | null = null;
  try {
    const vaultConfig = await loadVaultConfig(vaultRoot);
    store = new VaultStore({ vaultRoot, vaultName, vaultConfig });

    const lastSyncAt = store.meta.getLastSyncAt(vaultName);
    if (lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < debounceMs) {
      return;
    }

    const openStore = store;
    const result = await withLock(vaultRoot, () =>
      syncVaultStore(openStore, { reconcile: false }),
    );
    if (result.errors.length > 0) {
      logger.warn(
        `Implicit sync finished with ${result.errors.length} error(s): ${result.errors[0]}`,
      );
    }
  } catch (err) {
    logger.warn(
      `Implicit sync skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    store?.close();
  }
}

/** Convenience wrapper that owns the VaultStore lifecycle. */
export async function syncVault(
  vaultRoot: string,
  vaultName: string,
  vaultConfig: VaultConfig,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const store = new VaultStore({ vaultRoot, vaultName, vaultConfig });
  try {
    return await syncVaultStore(store, options);
  } finally {
    store.close();
  }
}

export async function syncVaultStore(
  store: VaultStore,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    recovered: 0,
    added: 0,
    updated: 0,
    pruned: 0,
    reconciled: 0,
    queued: 0,
    errors: [],
  };

  // Step 1: Recovery — resume pending vector syncs
  if (!options.prune) {
    result.recovered = await store.recoverPending();
  }

  // Step 2: File scan — discover indexable markdown (sources/ + artifacts/).
  // templates/ is contract content and .db/ is index storage; neither is a note.
  const glob = new Bun.Glob("**/*.md");
  const fsFiles = new Set<string>();
  for (const file of glob.scanSync(store.vaultRoot)) {
    const normalized = file.replace(/\\/g, "/");
    if (!normalized.startsWith("sources/") && !normalized.startsWith("artifacts/")) continue;
    fsFiles.add(normalized);
  }
  logger.debug(`Found ${fsFiles.size} markdown file(s) in vault`);

  // Step 3: Snapshot indexed notes
  const allNotes = store.meta.listNotes(store.vaultName, 100000, 0);
  const notesByPath = new Map<string, NoteRow>();
  for (const note of allNotes) {
    notesByPath.set(note.file_path, note);
  }
  logger.debug(`Found ${allNotes.length} note(s) in metadata`);

  // Step 4: Process new/changed files (unless prune-only)
  if (!options.prune) {
    for (const relPath of fsFiles) {
      const absPath = resolve(join(store.vaultRoot, relPath));
      const existingNote = notesByPath.get(relPath);
      if (!existingNote && options.changed) continue;

      try {
        const content = await Bun.file(absPath).text();
        const upserted = await store.upsertNoteFromContent({
          relPath,
          content,
          force: options.full,
        });
        if (upserted.status === "skipped") continue;

        if (upserted.status === "updated") {
          logger.info(`Reindexed changed file: ${relPath}`);
          result.updated++;
        } else {
          logger.info(`Added new file: ${relPath}`);
          result.added++;
        }

        if (upserted.layer === "source") {
          store.meta.enqueueAgentWork(store.vaultName, {
            sourcePath: relPath,
            sourceNoteId: upserted.noteId,
            change: upserted.status,
          });
          result.queued++;
        }
      } catch (err) {
        const errMsg = `${relPath}: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(errMsg);
        result.errors.push(errMsg);
      }
    }
  }

  // Step 5: Prune deleted files
  if (!options.changed) {
    for (const [path, note] of notesByPath) {
      if (fsFiles.has(path)) continue;
      logger.info(`Pruning orphaned note: ${path}`);
      store.deleteNoteCascade(note);
      result.pruned++;
      if (note.layer === "source") {
        store.meta.enqueueAgentWork(store.vaultName, {
          sourcePath: path,
          sourceNoteId: note.id,
          change: "deleted",
        });
        result.queued++;
      }
    }
  }

  // Step 6: Reconciliation (opt-in slow path)
  if (options.reconcile !== false && !options.changed && !options.prune) {
    result.reconciled = store.reconcile();
  }

  refreshDocumentGraph(store.meta, { vaultId: store.vaultName, includeChunks: true });
  store.meta.setLastSyncAt(store.vaultName);

  return result;
}
