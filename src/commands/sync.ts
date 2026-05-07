import { Command } from "commander";
import { resolve, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import ora from "ora";
import { parseNote } from "../pipeline/parser";
import { chunkDocument } from "../pipeline/chunker";
import { hashContent } from "../pipeline/hasher";
import { Embedder, formatForEmbedding } from "../pipeline/embedder";
import { createEmbeddingProvider } from "../providers/factory";
import { MetaDB, type NoteRow, type ChunkInsert, type ChunkRow } from "../stores/meta-store";
import { openVaultCollection, toZVecDoc, type ChunkInput } from "../stores/vec-store";
import type { ZVecCollection } from "@zvec/zvec";
import { resolveVaultRoot, loadVaultConfig, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { withLock } from "../core/lock";
import { setVerbose, logger } from "../core/logger";

interface SyncResult {
  recovered: number;
  added: number;
  updated: number;
  pruned: number;
  reconciled: number;
  errors: string[];
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Synchronize vault with source files")
    .option("--full", "Rebuild full index")
    .option("--prune", "Only remove orphaned entries")
    .option("--changed", "Only process changed files")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultConfig = await loadVaultConfig(vaultRoot);

        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const result = await withLock(vaultRoot, async () => {
          return await processSync(vaultRoot, vaultName, vaultConfig, options);
        });

        render(success("sync", result, vaultName), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        const errorEnvelope = error("sync", code, msg);
        render(errorEnvelope, fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

async function processSync(
  vaultRoot: string,
  vaultId: string,
  vaultConfig: any,
  options: any
): Promise<SyncResult> {
  const metaDb = new MetaDB(vaultRoot);
  const vectorPath = join(vaultRoot, ".kn", "vectors");
  let collection: ZVecCollection | null = null;

  try {
    try {
      collection = openVaultCollection(vectorPath, {});
      logger.debug("Opened existing vector collection");
    } catch {
      logger.warn("No vector collection found, skipping vector operations");
      collection = null;
    }

    const result: SyncResult = {
      recovered: 0,
      added: 0,
      updated: 0,
      pruned: 0,
      reconciled: 0,
      errors: [],
    };

    const embedder = new Embedder({
      provider: createEmbeddingProvider(vaultConfig),
    });

    // Step 1: Recovery — resume pending vector syncs
    if (!options.prune) {
      result.recovered = await recoverPending(metaDb, collection, vaultId, embedder);
    }

    // Step 2: File scan — discover all markdown files
    const glob = new Bun.Glob("**/*.md");
    const fsFiles = new Set<string>();
    for (const file of glob.scanSync(vaultRoot)) {
      // Skip .kn directory
      if (file.startsWith(".kn/") || file.startsWith(".kn\\")) continue;
      fsFiles.add(file);
    }

    logger.info(`Found ${fsFiles.size} markdown file(s) in vault`);

    // Step 3: Get all notes from metadata
    const allNotes = metaDb.listNotes(vaultId, 100000, 0);
    const notesByPath = new Map<string, NoteRow>();
    for (const note of allNotes) {
      notesByPath.set(note.file_path, note);
    }

    logger.info(`Found ${allNotes.length} note(s) in metadata`);

    // Step 4: Process new/changed files (unless --prune only)
    if (!options.prune) {
      for (const relPath of fsFiles) {
        const absPath = resolve(join(vaultRoot, relPath));
        const existingNote = notesByPath.get(relPath);

        try {
          const content = await Bun.file(absPath).text();
          const fileHash = hashContent(content);

          if (existingNote) {
            // File exists in metadata
            if (existingNote.file_hash === fileHash && !options.full) {
              logger.debug(`Skipping unchanged file: ${relPath}`);
              continue;
            }
            // Changed (or --full) — delete old and re-add
            logger.info(`Reindexing changed file: ${relPath}`);
            const oldChunkIds = metaDb.getChunkIdsByNote(existingNote.id);
            metaDb.deleteNote(existingNote.id);
            if (collection && oldChunkIds.length > 0) {
              try {
                collection.deleteSync(oldChunkIds);
              } catch (e) {
                logger.warn(
                  `Failed to delete vectors for ${relPath}: ${
                    e instanceof Error ? e.message : String(e)
                  }`
                );
              }
            }
            await addFile(metaDb, collection, embedder, vaultId, vaultRoot, relPath, content, fileHash);
            result.updated++;
          } else if (!options.changed) {
            // New file (skip if --changed mode)
            logger.info(`Adding new file: ${relPath}`);
            await addFile(metaDb, collection, embedder, vaultId, vaultRoot, relPath, content, fileHash);
            result.added++;
          }
        } catch (err) {
          const errMsg = `${relPath}: ${
            err instanceof Error ? err.message : String(err)
          }`;
          logger.error(errMsg);
          result.errors.push(errMsg);
        }
      }
    }

    // Step 5: Prune deleted files
    if (!options.changed) {
      for (const [path, note] of notesByPath) {
        if (!fsFiles.has(path)) {
          logger.info(`Pruning orphaned note: ${path}`);
          const chunkIds = metaDb.getChunkIdsByNote(note.id);
          metaDb.deleteNote(note.id);
          if (collection && chunkIds.length > 0) {
            try {
              collection.deleteSync(chunkIds);
            } catch (e) {
              logger.warn(
                `Failed to delete vectors for ${path}: ${
                  e instanceof Error ? e.message : String(e)
                }`
              );
            }
          }
          result.pruned++;
        }
      }
    }

    // Step 6: Reconciliation (unless --changed or --prune)
    if (!options.changed && !options.prune && collection) {
      result.reconciled = reconcile(metaDb, collection, vaultId);
    }

    return result;
  } finally {
    metaDb.close();
  }
}

async function recoverPending(
  metaDb: MetaDB,
  collection: ZVecCollection | null,
  vaultId: string,
  embedder: Embedder
): Promise<number> {
  const pending = metaDb.listPendingNotes(vaultId);

  if (pending.length === 0) return 0;
  logger.info(`Found ${pending.length} pending note(s), recovering...`);

  let recovered = 0;
  for (const note of pending) {
    try {
      const chunks = metaDb.getChunksByNote(note.id);
      if (chunks.length === 0) {
        logger.debug(`Skipping note ${note.id} with no chunks`);
        continue;
      }

      // Format and embed chunks
      const tags = metaDb.getTagsByNote(note.id).map((t) => t.tag);
      const textsToEmbed = chunks.map((chunk) => {
        const headingPath = chunk.heading_path
          ? JSON.parse(chunk.heading_path)
          : [];
        return formatForEmbedding({
          docTitle: note.title ?? undefined,
          headingPath,
          tags,
          content: chunk.content,
        });
      });

      const embeddings = await embedder.embedAll(textsToEmbed);

      // Build and upsert vector documents
      if (collection) {
        const zvecDocs = chunks.map((chunk, idx) => {
          const embedding = embeddings[idx];
          if (!embedding) {
            throw new Error(`No embedding for pending chunk ${idx}`);
          }
          const headingPath = chunk.heading_path
            ? JSON.parse(chunk.heading_path)
            : undefined;
          return toZVecDoc({
            id: chunk.id,
            noteId: chunk.note_id,
            filePath: note.file_path,
            title: note.title ?? undefined,
            heading: chunk.heading ?? undefined,
            headingPath,
            content: chunk.content,
            offsetStart: chunk.offset_start ?? 0,
            offsetEnd: chunk.offset_end ?? 0,
            tokenCount: chunk.token_count ?? 0,
            seqIndex: chunk.seq_index ?? 0,
            docTitle: note.title ?? undefined,
            tags,
            createdAt: note.created_at ? new Date(note.created_at) : undefined,
            embedding,
          });
        });
        collection.upsertSync(zvecDocs);
      }

      metaDb.markSynced(note.id);
      recovered++;
      logger.debug(`Recovered ${note.file_path}`);
    } catch (err) {
      logger.error(
        `Recovery failed for ${note.file_path}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return recovered;
}

async function addFile(
  metaDb: MetaDB,
  collection: ZVecCollection | null,
  embedder: Embedder,
  vaultId: string,
  vaultRoot: string,
  relPath: string,
  content: string,
  fileHash: string
): Promise<void> {
  const parsed = parseNote(content, relPath);
  const allTags = parsed.tags.map((tag) => ({
    tag,
    source: "frontmatter" as const,
  }));
  const now = new Date();
  const language = undefined;
  const noteId = randomUUID();

  if (parsed.layer === "source") {
    metaDb.reindexNote(
      {
        id: noteId,
        vaultId,
        filePath: relPath,
        title: parsed.title,
        fileHash,
        frontmatter: parsed.frontmatter as Record<string, string>,
        docDate: parsed.docDate ?? undefined,
        layer: parsed.layer,
        kind: parsed.kind,
        createdAt: now,
        updatedAt: now,
        language,
      },
      [],
      allTags
    );
    metaDb.markSynced(noteId);
    logger.info(`Stored source metadata for ${relPath} (no chunks)`);
    return;
  }

  const chunks = chunkDocument(parsed.content);
  if (chunks.length === 0) {
    logger.warn(`No chunks generated for ${relPath}`);
    return;
  }

  const chunkInserts: ChunkInsert[] = chunks.map((chunk, idx) => ({
    id: randomUUID(),
    noteId,
    heading: chunk.heading ?? undefined,
    headingPath: chunk.headingPath,
    content: chunk.content,
    offsetStart: chunk.offsetStart,
    offsetEnd: chunk.offsetEnd,
    tokenCount: chunk.tokenCount,
    seqIndex: chunk.seqIndex,
  }));

  // Link chunks
  for (let i = 0; i < chunkInserts.length; i++) {
    const curr = chunkInserts[i];
    if (!curr) continue;
    if (i > 0) {
      const prev = chunkInserts[i - 1];
      if (prev) curr.prevChunkId = prev.id;
    }
    if (i < chunkInserts.length - 1) {
      const next = chunkInserts[i + 1];
      if (next) curr.nextChunkId = next.id;
    }
  }

  metaDb.reindexNote(
    {
      id: noteId,
      vaultId,
      filePath: relPath,
      title: parsed.title,
      fileHash,
      frontmatter: parsed.frontmatter as Record<string, string>,
      docDate: parsed.docDate ?? undefined,
      layer: parsed.layer,
      kind: parsed.kind,
      createdAt: now,
      updatedAt: now,
    },
    chunkInserts,
    allTags
  );

  // Format and embed chunks
  const textsToEmbed = chunkInserts.map((chunk, idx) => {
      const originalChunk = chunks[idx];
      if (!originalChunk) {
        return formatForEmbedding({
          docTitle: parsed.title,
          headingPath: [],
          tags: parsed.tags,
          content: chunk.content,
        });
      }
      return formatForEmbedding({
      docTitle: parsed.title,
      headingPath: originalChunk.headingPath,
      tags: parsed.tags,
      content: chunk.content,
    });
  });

  const spinner = ora(`Embedding ${chunkInserts.length} chunks...`).start();
  const embeddings = await embedder.embedAll(textsToEmbed);
  spinner.succeed(`Embedded ${chunkInserts.length} chunks`);

  // Build and upsert vector documents
  if (collection) {
    const zvecDocs = chunkInserts.map((chunk, idx) => {
      const embedding = embeddings[idx];
      if (!embedding) {
        throw new Error(`No embedding for chunk ${idx}`);
      }
      const chunkInput: ChunkInput = {
        id: chunk.id,
        noteId: chunk.noteId,
        filePath: relPath,
        title: parsed.title,
        layer: parsed.layer === "artifact" ? "artifact" : "rewritten",
        heading: chunk.heading,
        headingPath: chunk.headingPath,
        content: chunk.content,
        offsetStart: chunk.offsetStart,
        offsetEnd: chunk.offsetEnd,
        tokenCount: chunk.tokenCount,
        seqIndex: chunk.seqIndex,
        docTitle: parsed.title,
        tags: parsed.tags,
        createdAt: now,
        embedding,
      };
      return toZVecDoc(chunkInput);
    });

    try {
      collection.upsertSync(zvecDocs);
      logger.debug(`Upserted ${zvecDocs.length} vectors`);
    } catch (vecErr) {
      logger.error(
        `Vector upsert failed: ${
          vecErr instanceof Error ? vecErr.message : String(vecErr)
        }`
      );
      metaDb.deleteNote(noteId);
      throw new KnError(
        ErrorCode.SYNC_FAILED,
        `Failed to sync vectors for ${relPath}`
      );
    }
  }

  metaDb.markSynced(noteId);
  logger.info(`Successfully added ${relPath} (${chunkInserts.length} chunks)`);
}

function reconcile(
  metaDb: MetaDB,
  collection: ZVecCollection,
  vaultId: string
): number {
  let fixed = 0;
  const allNotes = metaDb.listNotes(vaultId, 100000, 0);

  for (const note of allNotes) {
    const metaChunkIds = metaDb.getChunkIdsByNote(note.id);

    // Check which chunks exist in vector store
    for (const chunkId of metaChunkIds) {
      try {
        const fetched = collection.fetchSync([chunkId]);
        if (!fetched || Object.keys(fetched).length === 0) {
          // Metadata has chunk but vector doesn't — mark note as pending for next recovery
          logger.debug(
            `Reconciliation: chunk ${chunkId} missing from vector store, marking note pending`
          );
          metaDb.db.run(
            "UPDATE notes SET vector_sync_status = 'pending' WHERE id = ?",
            [note.id]
          );
          fixed++;
          break; // One fix per note is enough to trigger recovery
        }
      } catch (e) {
        logger.debug(
          `Failed to fetch chunk ${chunkId}: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  }

  return fixed;
}
