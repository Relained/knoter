import { Command } from "commander";
import { join } from "node:path";
import { MetaDB, type TagRow } from "../stores/meta-store";
import { openVaultCollection } from "../stores/vec-store";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { withLock } from "../core/lock";
import { setVerbose, logger } from "../core/logger";

export function registerTagCommand(program: Command): void {
  const tagCmd = program
    .command("tag")
    .description("Manage explicit tags (list, add, remove)");

  // kn tag list
  tagCmd
    .command("list")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          // Get tag distribution using existing method
          const tagDistribution = metaDb.listAllTags(vaultName);

          render(success("tag list", { tags: tagDistribution }, vaultName), format);
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("tag list", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn tag add <target> <tags...>
  tagCmd
    .command("add <target> <tags...>")
    .action(async (target, tags, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const result = await withLock(vaultRoot, async () => {
          const metaDb = new MetaDB(vaultRoot);
          try {
            // Find the note by path
            const note = metaDb.getNoteByPath(vaultName, target);
            if (!note) {
              throw new KnError(ErrorCode.FILE_NOT_FOUND, `Note not found: ${target}`);
            }

            // Add tags
            for (const tag of tags) {
              metaDb.addTag(note.id, tag, "manual");
              logger.info(`Added tag "${tag}" to ${target}`);
            }

            // Sync vector store tags
            await syncVectorTags(metaDb, vaultRoot, note.id);

            return { target, tagsAdded: tags, noteId: note.id };
          } finally {
            metaDb.close();
          }
        });

        render(success("tag add", result, vaultName), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("tag add", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn tag remove <target> <tags...>
  tagCmd
    .command("remove <target> <tags...>")
    .action(async (target, tags, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const result = await withLock(vaultRoot, async () => {
          const metaDb = new MetaDB(vaultRoot);
          try {
            const note = metaDb.getNoteByPath(vaultName, target);
            if (!note) {
              throw new KnError(ErrorCode.FILE_NOT_FOUND, `Note not found: ${target}`);
            }

            for (const tag of tags) {
              metaDb.removeTag(note.id, tag);
              logger.info(`Removed tag "${tag}" from ${target}`);
            }

            await syncVectorTags(metaDb, vaultRoot, note.id);

            return { target, tagsRemoved: tags, noteId: note.id };
          } finally {
            metaDb.close();
          }
        });

        render(success("tag remove", result, vaultName), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("tag remove", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

/**
 * Sync tag changes to the vector store for all chunks of a note.
 * Safely handles cases where vector collection doesn't exist yet.
 */
async function syncVectorTags(metaDb: MetaDB, vaultRoot: string, noteId: string): Promise<void> {
  try {
    const vectorPath = join(vaultRoot, ".kn", "vectors");
    const collection = openVaultCollection(vectorPath, {});
    const chunkIds = metaDb.getChunkIdsByNote(noteId);
    const currentTags = metaDb.getTagsByNote(noteId).map(t => t.tag);

    if (chunkIds.length === 0) return;

    // Fetch existing vector docs
    const docs = collection.fetchSync(chunkIds);
    if (!docs || docs.length === 0) return;

    // Update tags field and upsert
    const updatedDocs = docs.map((doc: any) => ({
      ...doc,
      fields: { ...doc.fields, tags: currentTags },
    }));

    collection.upsertSync(updatedDocs);
    logger.debug(`Synced tags for ${chunkIds.length} chunks: [${currentTags.join(", ")}]`);
  } catch (err) {
    logger.warn(`Failed to sync vector tags: ${err instanceof Error ? err.message : String(err)}`);
  }
}
