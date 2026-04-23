import { Command } from "commander";
import { resolve, relative, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ora from "ora";
import { parseNote } from "../pipeline/parser";
import { chunkDocument, detectLanguage } from "../pipeline/chunker";
import { hashContent } from "../pipeline/hasher";
import { Embedder, formatForEmbedding } from "../pipeline/embedder";
import { createEmbeddingProvider } from "../providers/factory";
import { MetaDB, type ChunkInsert } from "../stores/meta-store";
import { openVaultCollection, toZVecDoc, createVaultCollection, createChunkSchema, type ChunkInput } from "../stores/vec-store";
import { resolveVaultRoot, loadVaultConfig, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { withLock } from "../core/lock";
import { setVerbose, logger } from "../core/logger";

// File discovery
function discoverFiles(target: string, recursive: boolean): string[] {
  const resolved = resolve(target);
  const stat = statSync(resolved, { throwIfNoEntry: false });

  if (!stat) {
    // Try as glob
    const glob = new Bun.Glob(target);
    return [...glob.scanSync(".")].map(f => resolve(f));
  }

  if (stat.isFile()) return [resolved];

  if (stat.isDirectory()) {
    // Scan for markdown files
    const pattern = recursive ? "**/*.md" : "*.md";
    const glob = new Bun.Glob(pattern);
    return [...glob.scanSync(resolved)].map(f => resolve(join(resolved, f)));
  }

  return [];
}

interface AddResult {
  filesProcessed: number;
  filesAdded: number;
  filesSkipped: number;
  filesUpdated: number;
  totalChunks: number;
  details: {
    filePath: string;
    status: "added" | "updated" | "skipped";
    chunkCount: number;
    noteId: string;
  }[];
}

export function registerAddCommand(program: Command): void {
  program
    .command("add <target>")
    .description("Add files or directories to the vault")
    .option("--recursive", "Recursively add files from directory")
    .option("--tag <tag...>", "Tags to apply")
    .option("--dry-run", "Preview changes without applying")
    .option("--force", "Overwrite existing notes")
    .action(async (target, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        // Resolve vault (global --vault takes priority)
        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultConfig = await loadVaultConfig(vaultRoot);

        // Derive vault name
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        // Discover files
        const files = discoverFiles(target, options.recursive ?? false);
        if (files.length === 0) {
          const err = error("add", ErrorCode.FILE_NOT_FOUND, `No markdown files found in "${target}"`);
          render(err, format);
          process.exit(1);
        }

        logger.info(`Discovered ${files.length} file(s)`);

        // Run with lock
        const result = await withLock(vaultRoot, async () => {
          return await processAdd(
            vaultRoot,
            files,
            {
              ...options,
              vaultName,
              vaultConfig,
              embeddingModel: vaultConfig.embedding.model,
            }
          );
        });

        const response = success("add", result, vaultName);
        render(response, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        const errorEnvelope = error("add", code, msg);
        render(errorEnvelope, fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

async function processAdd(
  vaultRoot: string,
  files: string[],
  options: any
): Promise<AddResult> {
  const metaDb = new MetaDB(vaultRoot);
  const vaultId = options.vaultName || "default";
  const result: AddResult = {
    filesProcessed: 0,
    filesAdded: 0,
    filesSkipped: 0,
    filesUpdated: 0,
    totalChunks: 0,
    details: [],
  };

  try {
    // Initialize or open vector collection
    const vectorIndexPath = join(vaultRoot, ".kn", "vectors");
    let collection: any;
    try {
      collection = openVaultCollection(vectorIndexPath, {});
      logger.debug("Opened existing vector collection");
    } catch (e) {
      try {
        logger.warn("Vector collection not found, creating new one");
        collection = createVaultCollection(
          vectorIndexPath,
          "vault",
          options.embeddingModel || "nomic-embed-text"
        );
      } catch (createErr) {
        logger.debug(`Create failed (may already exist), trying open: ${createErr instanceof Error ? createErr.message : String(createErr)}`);
        collection = openVaultCollection(vectorIndexPath, {});
      }
    }

    // Create embedder with real provider from vault config
    const embedder = new Embedder({
      provider: createEmbeddingProvider(options.vaultConfig),
    });

    // Process each file
    for (const filePath of files) {
      result.filesProcessed++;
      const relPath = relative(vaultRoot, filePath);
      logger.info(`Processing ${relPath}`);

      try {
        // Read and hash content
        const fileContent = await Bun.file(filePath).text();
        const fileHash = hashContent(fileContent);

        // Check for existing note
        const existingNote = metaDb.getNoteByPath(vaultId, relPath);
        if (existingNote && existingNote.file_hash === fileHash && !options.force) {
          logger.info(`Skipping ${relPath} (hash unchanged)`);
          result.filesSkipped++;
          result.details.push({
            filePath: relPath,
            status: "skipped",
            chunkCount: 0,
            noteId: existingNote.id,
          });
          continue;
        }

        // If forcing update or note exists, delete it first
        let noteId: string;
        const isUpdate = !!existingNote;
        if (isUpdate) {
          logger.info(`Deleting existing note for ${relPath} before reindexing`);
          metaDb.deleteNote(existingNote.id);
          noteId = existingNote.id;
        } else {
          noteId = randomUUID();
        }

        // Parse note
        const parsed = parseNote(fileContent, filePath);

        // Chunk document
        const chunks = chunkDocument(parsed.content);
        if (chunks.length === 0) {
          logger.warn(`No chunks generated for ${relPath}`);
          result.filesSkipped++;
          continue;
        }

        // Build chunk IDs and links
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
          prevChunkId: idx > 0 ? undefined : undefined, // Will be populated after ID generation
          nextChunkId: idx < chunks.length - 1 ? undefined : undefined,
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

        // Merge tags
        const allTags = new Set([...parsed.tags, ...(options.tag || [])]);
        const tagList = Array.from(allTags).map(tag => ({
          tag,
          source: (options.tag?.includes(tag) ? "manual" : "frontmatter") as "manual" | "frontmatter",
        }));

        // If dry-run, just log and skip persistence
        if (options.dryRun) {
          logger.info(`[DRY-RUN] Would add ${relPath} with ${chunkInserts.length} chunks`);
          result.details.push({
            filePath: relPath,
            status: "added",
            chunkCount: chunkInserts.length,
            noteId,
          });
          result.filesAdded++;
          result.totalChunks += chunkInserts.length;
          continue;
        }

        // Detect language from content
        const language = detectLanguage(parsed.content);

        // Write metadata (with pending status)
        const now = new Date();
        metaDb.reindexNote(
          {
            id: noteId,
            vaultId,
            filePath: relPath,
            title: parsed.title,
            fileHash,
            frontmatter: parsed.frontmatter as Record<string, string>,
            createdAt: now,
            updatedAt: now,
            language,
          },
          chunkInserts,
          tagList
        );

        // Format and embed chunks
        const textsToEmbed = chunkInserts.map((chunk, idx) => {
          const originalChunk = chunks[idx];
          if (!originalChunk) {
            return formatForEmbedding({
              docTitle: parsed.title,
              headingPath: [],
              tags: Array.from(allTags),
              content: chunk.content,
            });
          }
          return formatForEmbedding({
            docTitle: parsed.title,
            headingPath: originalChunk.headingPath,
            tags: Array.from(allTags),
            content: chunk.content,
          });
        });

        const spinner = ora(`Embedding ${chunkInserts.length} chunks...`).start();
        const embeddings = await embedder.embedAll(textsToEmbed);
        spinner.succeed(`Embedded ${chunkInserts.length} chunks`);

        // Build and upsert vector documents
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
            heading: chunk.heading,
            headingPath: chunk.headingPath,
            content: chunk.content,
            offsetStart: chunk.offsetStart,
            offsetEnd: chunk.offsetEnd,
            tokenCount: chunk.tokenCount,
            seqIndex: chunk.seqIndex,
            docTitle: parsed.title,
            tags: Array.from(allTags),
            createdAt: now,
            embedding: embedding,
          };
          return toZVecDoc(chunkInput);
        });

        try {
          collection.upsertSync(zvecDocs);
          logger.debug(`Upserted ${zvecDocs.length} vectors`);
        } catch (vecErr) {
          // Rollback metadata on vector write failure
          logger.error(`Vector upsert failed: ${vecErr instanceof Error ? vecErr.message : String(vecErr)}`);
          metaDb.deleteNote(noteId);
          throw new KnError(ErrorCode.SYNC_FAILED, `Failed to sync vectors for ${relPath}`);
        }

        // Mark as synced
        metaDb.markSynced(noteId);

        const status = isUpdate ? "updated" : "added";
        result.details.push({
          filePath: relPath,
          status: status as "added" | "updated",
          chunkCount: chunkInserts.length,
          noteId,
        });

        if (status === "added") {
          result.filesAdded++;
        } else {
          result.filesUpdated++;
        }
        result.totalChunks += chunkInserts.length;

        logger.info(`Successfully ${status} ${relPath} (${chunkInserts.length} chunks)`);
      } catch (fileErr) {
        logger.error(`Error processing ${relPath}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`);
        if (fileErr instanceof KnError) {
          throw fileErr;
        }
      }
    }

    return result;
  } finally {
    metaDb.close();
  }
}
