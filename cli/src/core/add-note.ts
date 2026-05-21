import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseNote } from "../pipeline/parser";
import { chunkDocument, detectLanguage } from "../pipeline/chunker";
import { hashContent } from "../pipeline/hasher";
import { Embedder, formatForEmbedding, type EmbeddingProvider } from "../pipeline/embedder";
import { createEmbeddingProvider } from "../providers/factory";
import { MetaDB, type ChunkInsert, type ChunkRow, type NoteRow, type TagRow } from "../stores/meta-store";
import { openVaultCollection, toZVecDoc, createVaultCollection, type ChunkInput } from "../stores/vec-store";
import type { VaultConfig } from "./config";
import { KnError, ErrorCode } from "./errors";
import { refreshDocumentGraph } from "./document-graph";
import { extractLineageFromFrontmatter } from "./note-lineage";

export interface AddMarkdownNoteInput {
  vaultRoot: string;
  vaultName: string;
  relPath: string;
  content: string;
  tags?: string[];
  force?: boolean;
  vaultConfig?: VaultConfig;
  embedProvider?: EmbeddingProvider;
  vectorCollection?: {
    upsertSync: (docs: unknown[]) => void;
    deleteSync?: (ids: string[]) => void;
  };
}

export interface AddMarkdownNoteResult {
  filePath: string;
  status: "added" | "updated" | "skipped";
  noteId: string;
  chunkCount: number;
  layer: "rewritten" | "artifact";
  kind: string | null;
  docDate: string | null;
}

interface ExistingNoteSnapshot {
  note: NoteRow;
  chunks: ChunkRow[];
  tags: TagRow[];
}

export async function addMarkdownNoteToVault(input: AddMarkdownNoteInput): Promise<AddMarkdownNoteResult> {
  const relPath = validateRelativeVaultPath(input.vaultRoot, input.relPath);
  const absolutePath = join(input.vaultRoot, relPath);
  const fileHash = hashContent(input.content);
  const parsed = parseNote(input.content, relPath);

  if (parsed.layer === "source") {
    throw new KnError(ErrorCode.CONFIG_INVALID, "MCP add-note only supports rewritten/artifact; source is rejected");
  }
  if (parsed.layer === "rewritten" && !relPath.startsWith("rewritten/")) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "rewritten notes must be stored under rewritten/");
  }
  if (parsed.layer === "artifact" && !relPath.startsWith("artifacts/")) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "artifact notes must be stored under artifacts/");
  }
  const indexedLayer: "rewritten" | "artifact" = parsed.layer;

  const metaDb = new MetaDB(input.vaultRoot);
  try {
    const existingNote = metaDb.getNoteByPath(input.vaultName, relPath);
    if (existingNote && existingNote.file_hash === fileHash && !input.force) {
      return {
        filePath: relPath,
        status: "skipped",
        noteId: existingNote.id,
        chunkCount: 0,
        layer: parsed.layer,
        kind: parsed.kind,
        docDate: parsed.docDate,
      };
    }

    const noteId = existingNote ? existingNote.id : randomUUID();
    const isUpdate = !!existingNote;
    const existingSnapshot = existingNote
      ? {
          note: existingNote,
          chunks: metaDb.getChunksByNote(existingNote.id),
          tags: metaDb.getTagsByNote(existingNote.id),
        }
      : null;
    const oldChunkIds = existingNote ? metaDb.getChunkIdsByNote(existingNote.id) : [];
    const previousFileContent = await readExistingFile(absolutePath);

    const allTags = new Set([...parsed.tags, ...(input.tags || [])]);
    const tagList = Array.from(allTags).map((tag) => ({
      tag,
      source: (input.tags?.includes(tag) ? "manual" : "frontmatter") as "manual" | "frontmatter",
    }));

    const chunks = chunkDocument(parsed.content);
    if (chunks.length === 0) {
      throw new KnError(ErrorCode.CONFIG_INVALID, `No chunks generated for ${relPath}`);
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
      prevChunkId: idx > 0 ? undefined : undefined,
      nextChunkId: idx < chunks.length - 1 ? undefined : undefined,
    }));

    for (let i = 0; i < chunkInserts.length; i++) {
      const curr = chunkInserts[i];
      if (!curr) continue;
      if (i > 0) curr.prevChunkId = chunkInserts[i - 1]?.id;
      if (i < chunkInserts.length - 1) curr.nextChunkId = chunkInserts[i + 1]?.id;
    }

    const embedder = input.embedProvider
      ? new Embedder({ provider: input.embedProvider, maxRetries: 0 })
      : (() => {
          if (!input.vaultConfig) {
            throw new KnError(ErrorCode.CONFIG_INVALID, "vaultConfig is required when embedProvider is not provided");
          }
          return new Embedder({
            provider: createEmbeddingProvider(input.vaultConfig),
          });
        })();

    const textsToEmbed = chunkInserts.map((chunk, idx) =>
      formatForEmbedding({
        docTitle: parsed.title,
        headingPath: chunks[idx]?.headingPath ?? [],
        tags: Array.from(allTags),
        content: chunk.content,
      }),
    );
    let embeddings: number[][];
    try {
      embeddings = await embedder.embedAll(textsToEmbed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new KnError(ErrorCode.SYNC_FAILED, `Failed to embed chunks for ${relPath}: ${msg}`);
    }

    mkdirSync(dirname(absolutePath), { recursive: true });
    await Bun.write(absolutePath, input.content);

    const now = new Date();
    metaDb.reindexNote(
      {
        id: noteId,
        vaultId: input.vaultName,
        filePath: relPath,
        title: parsed.title,
        fileHash,
        frontmatter: parsed.frontmatter as Record<string, string>,
        docDate: parsed.docDate ?? undefined,
        layer: parsed.layer,
        kind: parsed.kind,
        lineage: extractLineageFromFrontmatter(parsed.frontmatter),
        createdAt: now,
        updatedAt: now,
        language: detectLanguage(parsed.content),
      },
      chunkInserts,
      tagList,
    );

    const collection =
      input.vectorCollection ??
      (() => {
        const vectorIndexPath = join(input.vaultRoot, ".kn", "vectors");
        try {
          return openVaultCollection(vectorIndexPath, {});
        } catch {
          return createVaultCollection(
            vectorIndexPath,
            "vault",
            input.vaultConfig?.embedding.model || "nomic-embed-text",
          );
        }
      })();

    try {
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
          layer: indexedLayer,
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
          embedding,
        };
        return toZVecDoc(chunkInput);
      });
      collection.upsertSync(zvecDocs);
      if (oldChunkIds.length > 0 && collection.deleteSync) {
        try {
          collection.deleteSync(oldChunkIds);
        } catch {
          // Best effort cleanup. New vectors and metadata are already in sync.
        }
      }
    } catch (err) {
      await restoreFile(absolutePath, previousFileContent);
      if (existingSnapshot) {
        restoreExistingNote(metaDb, existingSnapshot);
      } else {
        metaDb.deleteNote(noteId);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new KnError(ErrorCode.SYNC_FAILED, `Failed to sync vectors for ${relPath}: ${msg}`);
    }

    metaDb.markSynced(noteId);
    refreshDocumentGraph(metaDb, { vaultId: input.vaultName, includeChunks: true });

    return {
      filePath: relPath,
      status: isUpdate ? "updated" : "added",
      noteId,
      chunkCount: chunkInserts.length,
          layer: indexedLayer,
      kind: parsed.kind,
      docDate: parsed.docDate,
    };
  } finally {
    metaDb.close();
  }
}

function validateRelativeVaultPath(vaultRoot: string, relPath: string): string {
  if (!relPath || !relPath.trim()) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "path is required");
  }
  const normalized = normalize(relPath.replace(/\\/g, "/"));
  if (isAbsolute(normalized)) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "path must be relative to vault root");
  }
  const resolvedPath = resolve(vaultRoot, normalized);
  const relToVault = relative(vaultRoot, resolvedPath);
  if (relToVault === ".." || relToVault.startsWith(`..${sep}`) || isAbsolute(relToVault)) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "path must stay inside vault root");
  }
  return relToVault.replace(/\\/g, "/");
}

async function readExistingFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return await file.text();
}

async function restoreFile(path: string, previousContent: string | null): Promise<void> {
  if (previousContent === null) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, previousContent);
}

function restoreExistingNote(metaDb: MetaDB, snapshot: ExistingNoteSnapshot): void {
  metaDb.db.transaction(() => {
    metaDb.deleteNote(snapshot.note.id);
    metaDb.db
      .query(
        `INSERT INTO notes (
           id, vault_id, file_path, title, file_hash, frontmatter,
           vector_sync_status, doc_date, layer, kind, source_note_id, source_path,
           rewrite_agent, rewrite_prompt_hash, artifact_template_id,
           created_at, updated_at, indexed_at, language
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.note.id,
        snapshot.note.vault_id,
        snapshot.note.file_path,
        snapshot.note.title,
        snapshot.note.file_hash,
        snapshot.note.frontmatter,
        snapshot.note.vector_sync_status,
        snapshot.note.doc_date,
        snapshot.note.layer,
        snapshot.note.kind,
        snapshot.note.source_note_id,
        snapshot.note.source_path,
        snapshot.note.rewrite_agent,
        snapshot.note.rewrite_prompt_hash,
        snapshot.note.artifact_template_id,
        snapshot.note.created_at,
        snapshot.note.updated_at,
        snapshot.note.indexed_at,
        snapshot.note.language,
      );

    const insertChunk = metaDb.db.prepare(
      `INSERT INTO chunks (
         id, note_id, heading, heading_path, content, offset_start, offset_end,
         token_count, seq_index, prev_chunk_id, next_chunk_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of snapshot.chunks) {
      insertChunk.run(
        chunk.id,
        chunk.note_id,
        chunk.heading,
        chunk.heading_path,
        chunk.content,
        chunk.offset_start,
        chunk.offset_end,
        chunk.token_count,
        chunk.seq_index,
        chunk.prev_chunk_id,
        chunk.next_chunk_id,
      );
    }

    const insertTag = metaDb.db.prepare(
      "INSERT INTO tags (note_id, tag, source) VALUES (?, ?, ?)",
    );
    for (const tag of snapshot.tags) {
      insertTag.run(tag.note_id, tag.tag, tag.source);
    }
  })();
}
