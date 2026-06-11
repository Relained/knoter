import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ZVecCollection } from "@zvec/zvec";
import { parseNote } from "../pipeline/parser";
import { chunkDocument, detectLanguage } from "../pipeline/chunker";
import { hashContent } from "../pipeline/hasher";
import { Embedder, formatForEmbedding, type EmbeddingProvider } from "../pipeline/embedder";
import { createEmbeddingProvider } from "../providers/factory";
import type { VaultConfig } from "../core/config";
import { KnError, ErrorCode } from "../core/errors";
import { logger } from "../core/logger";
import { extractLineageFromFrontmatter } from "../core/note-lineage";
import {
  MetaDB,
  VAULT_DB_DIR,
  type ChunkInsert,
  type ChunkRow,
  type NoteRow,
} from "./meta-store";
import {
  createVaultCollection,
  openVaultCollection,
  toZVecDoc,
  type ChunkInput,
} from "./vec-store";

/**
 * Unified vault CRUD: one entry point for note create/read/update/delete that
 * keeps SQLite metadata (MetaDB), FTS, and the zvec vector index consistent.
 *
 * Indexing policy: every markdown note is chunked into FTS for keyword
 * search; only the llm-wiki artifact is embedded into the vector store, so
 * semantic retrieval is llm-wiki-scoped by construction.
 */

export interface VaultStoreInput {
  vaultRoot: string;
  vaultName: string;
  vaultConfig: VaultConfig;
  /** Override the embedding provider (deterministic embeddings in smoke tests). */
  embedProvider?: EmbeddingProvider;
}

export interface UpsertNoteResult {
  filePath: string;
  status: "added" | "updated" | "skipped";
  noteId: string;
  chunkCount: number;
  layer: NoteRow["layer"];
  kind: string | null;
  docDate: string | null;
}

export interface NotePayload {
  id: string;
  filePath: string;
  title: string | null;
  chunkCount: number;
  content: string;
  createdAt: string | null;
  updatedAt: string | null;
  frontmatter: unknown;
}

interface NoteSnapshot {
  note: NoteRow;
  chunks: ChunkRow[];
}

export class VaultStore {
  readonly vaultRoot: string;
  readonly vaultName: string;
  readonly meta: MetaDB;
  readonly #vaultConfig: VaultConfig;
  readonly #embedProvider?: EmbeddingProvider;
  #collection: ZVecCollection | null | undefined;
  #embedder: Embedder | undefined;

  constructor(input: VaultStoreInput) {
    this.vaultRoot = input.vaultRoot;
    this.vaultName = input.vaultName;
    this.#vaultConfig = input.vaultConfig;
    this.#embedProvider = input.embedProvider;
    this.meta = new MetaDB(input.vaultRoot);
  }

  close(): void {
    this.meta.close();
    if (this.#collection) {
      try {
        this.#collection.closeSync();
      } catch {
        // Collection close is best-effort.
      }
    }
    this.#collection = undefined;
  }

  // ── Vector collection / embedder (lazy) ───────────────────────────────────

  /** Open (or create) the vault vector collection. Null when unavailable. */
  collection(): ZVecCollection | null {
    if (this.#collection !== undefined) return this.#collection;
    const vectorIndexPath = join(this.vaultRoot, VAULT_DB_DIR, "vectors");
    try {
      this.#collection = openVaultCollection(vectorIndexPath, {});
    } catch {
      try {
        this.#collection = createVaultCollection(
          vectorIndexPath,
          "vault",
          this.#vaultConfig.embedding.model,
        );
      } catch {
        try {
          this.#collection = openVaultCollection(vectorIndexPath, {});
        } catch {
          logger.warn("Vector collection unavailable, skipping vector operations");
          this.#collection = null;
        }
      }
    }
    return this.#collection;
  }

  #getEmbedder(): Embedder {
    if (!this.#embedder) {
      this.#embedder = this.#embedProvider
        ? new Embedder({ provider: this.#embedProvider, maxRetries: 0 })
        : new Embedder({ provider: createEmbeddingProvider(this.#vaultConfig) });
    }
    return this.#embedder;
  }

  // ── Note upsert ────────────────────────────────────────────────────────────

  /**
   * Index a note from markdown content. All notes are chunked for keyword
   * (FTS) search; only the llm-wiki artifact is embedded and written to the
   * vector store. Metadata is restored (or removed) when the vector write
   * fails.
   */
  async upsertNoteFromContent(input: {
    relPath: string;
    content: string;
    force?: boolean;
  }): Promise<UpsertNoteResult> {
    const parsed = parseNote(input.content, input.relPath);
    const fileHash = hashContent(input.content);
    const existing = this.meta.getNoteByPath(this.vaultName, input.relPath);

    if (existing && existing.file_hash === fileHash && !input.force) {
      return {
        filePath: input.relPath,
        status: "skipped",
        noteId: existing.id,
        chunkCount: 0,
        layer: parsed.layer,
        kind: parsed.kind,
        docDate: parsed.docDate,
      };
    }

    const noteId = existing ? existing.id : randomUUID();
    const isUpdate = !!existing;
    const snapshot: NoteSnapshot | null = existing
      ? { note: existing, chunks: this.meta.getChunksByNote(existing.id) }
      : null;
    const oldChunkIds = existing ? this.meta.getChunkIdsByNote(existing.id) : [];
    const now = new Date();

    const noteInput = {
      id: noteId,
      vaultId: this.vaultName,
      filePath: input.relPath,
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
    };

    const isWiki = parsed.layer === "artifact" && parsed.kind === "llm-wiki";
    const chunks = chunkDocument(parsed.content);
    if (chunks.length === 0) {
      this.meta.reindexNote(noteInput, []);
      this.deleteVectors(oldChunkIds);
      this.meta.markSynced(noteId);
      return {
        filePath: input.relPath,
        status: isUpdate ? "updated" : "added",
        noteId,
        chunkCount: 0,
        layer: parsed.layer,
        kind: parsed.kind,
        docDate: parsed.docDate,
      };
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
    for (let i = 0; i < chunkInserts.length; i++) {
      const curr = chunkInserts[i];
      if (!curr) continue;
      if (i > 0) curr.prevChunkId = chunkInserts[i - 1]?.id;
      if (i < chunkInserts.length - 1) curr.nextChunkId = chunkInserts[i + 1]?.id;
    }

    // Keyword-only documents (sources, non-wiki artifacts): FTS chunks, no
    // embeddings, no vector writes.
    if (!isWiki) {
      this.meta.reindexNote(noteInput, chunkInserts);
      this.deleteVectors(oldChunkIds);
      this.meta.markSynced(noteId);
      return {
        filePath: input.relPath,
        status: isUpdate ? "updated" : "added",
        noteId,
        chunkCount: chunkInserts.length,
        layer: parsed.layer,
        kind: parsed.kind,
        docDate: parsed.docDate,
      };
    }

    const textsToEmbed = chunkInserts.map((chunk, idx) =>
      formatForEmbedding({
        docTitle: parsed.title,
        headingPath: chunks[idx]?.headingPath ?? [],
        content: chunk.content,
      }),
    );
    let embeddings: number[][];
    try {
      embeddings = await this.#getEmbedder().embedAll(textsToEmbed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new KnError(
        ErrorCode.SYNC_FAILED,
        `Failed to embed chunks for ${input.relPath}: ${msg}`,
      );
    }

    this.meta.reindexNote(noteInput, chunkInserts);

    const collection = this.collection();
    if (collection) {
      try {
        const zvecDocs = chunkInserts.map((chunk, idx) => {
          const embedding = embeddings[idx];
          if (!embedding) throw new Error(`No embedding for chunk ${idx}`);
          const chunkInput: ChunkInput = {
            id: chunk.id,
            noteId: chunk.noteId,
            filePath: input.relPath,
            title: parsed.title,
            heading: chunk.heading,
            headingPath: chunk.headingPath,
            content: chunk.content,
            offsetStart: chunk.offsetStart,
            offsetEnd: chunk.offsetEnd,
            tokenCount: chunk.tokenCount,
            seqIndex: chunk.seqIndex,
            docTitle: parsed.title,
            createdAt: now,
            embedding,
          };
          return toZVecDoc(chunkInput);
        });
        collection.upsertSync(zvecDocs);
        this.deleteVectors(oldChunkIds);
      } catch (err) {
        this.#restoreSnapshot(noteId, snapshot);
        const msg = err instanceof Error ? err.message : String(err);
        throw new KnError(
          ErrorCode.SYNC_FAILED,
          `Failed to sync vectors for ${input.relPath}: ${msg}`,
        );
      }
    }

    this.meta.markSynced(noteId);
    return {
      filePath: input.relPath,
      status: isUpdate ? "updated" : "added",
      noteId,
      chunkCount: chunkInserts.length,
      layer: parsed.layer,
      kind: parsed.kind,
      docDate: parsed.docDate,
    };
  }

  // ── Note delete ────────────────────────────────────────────────────────────

  /** Delete a note from metadata and remove its chunk vectors. */
  deleteNoteCascade(note: NoteRow): void {
    const chunkIds = this.meta.getChunkIdsByNote(note.id);
    this.meta.deleteNote(note.id);
    this.deleteVectors(chunkIds);
  }

  /** Best-effort vector deletion; index stays recoverable via reconcile. */
  deleteVectors(chunkIds: string[]): void {
    if (chunkIds.length === 0) return;
    const collection = this.collection();
    if (!collection) return;
    try {
      collection.deleteSync(chunkIds);
    } catch (err) {
      logger.warn(
        `Failed to delete vectors: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Note read ──────────────────────────────────────────────────────────────

  /** Resolve a note by exact path, path suffix, substring, then note id. */
  resolveNote(target: string): NoteRow | null {
    let note = this.meta.getNoteByPath(this.vaultName, target);
    if (!note) {
      note = this.meta.db
        .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
        .get(this.vaultName, `%/${target}`) as NoteRow | null;
    }
    if (!note) {
      note = this.meta.db
        .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
        .get(this.vaultName, `%${target}%`) as NoteRow | null;
    }
    if (!note) {
      note = this.meta.getNote(target);
    }
    return note;
  }

  /** Full note payload with content read from disk. Null when not found. */
  async buildNotePayload(
    target: string,
    options: { section?: string; maxChars?: number } = {},
  ): Promise<NotePayload | null> {
    const note = this.resolveNote(target);
    if (!note) return null;

    let content: string;
    try {
      content = await Bun.file(join(this.vaultRoot, note.file_path)).text();
    } catch {
      content = "[File not found on disk]";
    }

    if (options.section) {
      content = extractSection(content, options.section);
    }
    if (options.maxChars && options.maxChars > 0) {
      content = content.substring(0, options.maxChars);
    }

    return {
      id: note.id,
      filePath: note.file_path,
      title: note.title,
      chunkCount: this.meta.getChunkIdsByNote(note.id).length,
      content,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      frontmatter: note.frontmatter ? JSON.parse(note.frontmatter) : null,
    };
  }

  /** Path suggestions for a missed lookup. */
  pathSuggestions(target: string, limit = 5): string[] {
    const targetLower = target.toLowerCase();
    return this.meta
      .listNotes(this.vaultName, 1000, 0)
      .map((note) => note.file_path)
      .filter((path) => {
        const lower = path.toLowerCase();
        return (
          lower.includes(targetLower) ||
          targetLower.split("/").some((part) => lower.includes(part))
        );
      })
      .slice(0, limit);
  }

  // ── Recovery / reconciliation ─────────────────────────────────────────────

  /** Re-embed and upsert llm-wiki notes whose vector sync is still pending. */
  async recoverPending(): Promise<number> {
    const pending = this.meta.listPendingNotes(this.vaultName);
    if (pending.length === 0) return 0;
    logger.info(`Found ${pending.length} pending note(s), recovering...`);

    let recovered = 0;
    for (const note of pending) {
      try {
        // Only llm-wiki chunks carry vectors; everything else just needs the
        // synced flag.
        if (!(note.layer === "artifact" && note.kind === "llm-wiki")) {
          this.meta.markSynced(note.id);
          recovered++;
          continue;
        }

        const chunks = this.meta.getChunksByNote(note.id);
        if (chunks.length === 0) {
          this.meta.markSynced(note.id);
          recovered++;
          continue;
        }

        const textsToEmbed = chunks.map((chunk) =>
          formatForEmbedding({
            docTitle: note.title ?? undefined,
            headingPath: chunk.heading_path ? JSON.parse(chunk.heading_path) : [],
            content: chunk.content,
          }),
        );
        const embeddings = await this.#getEmbedder().embedAll(textsToEmbed);

        const collection = this.collection();
        if (collection) {
          const zvecDocs = chunks.map((chunk, idx) => {
            const embedding = embeddings[idx];
            if (!embedding) throw new Error(`No embedding for pending chunk ${idx}`);
            return toZVecDoc({
              id: chunk.id,
              noteId: chunk.note_id,
              filePath: note.file_path,
              title: note.title ?? undefined,
              heading: chunk.heading ?? undefined,
              headingPath: chunk.heading_path ? JSON.parse(chunk.heading_path) : undefined,
              content: chunk.content,
              offsetStart: chunk.offset_start ?? 0,
              offsetEnd: chunk.offset_end ?? 0,
              tokenCount: chunk.token_count ?? 0,
              seqIndex: chunk.seq_index ?? 0,
              docTitle: note.title ?? undefined,
              createdAt: note.created_at ? new Date(note.created_at) : undefined,
              embedding,
            });
          });
          collection.upsertSync(zvecDocs);
        }

        this.meta.markSynced(note.id);
        recovered++;
        logger.debug(`Recovered ${note.file_path}`);
      } catch (err) {
        logger.error(
          `Recovery failed for ${note.file_path}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return recovered;
  }

  /** Mark llm-wiki notes whose chunks are missing from the vector store as pending. */
  reconcile(): number {
    const collection = this.collection();
    if (!collection) return 0;

    let fixed = 0;
    const allNotes = this.meta
      .listNotes(this.vaultName, 100000, 0)
      .filter((note) => note.layer === "artifact" && note.kind === "llm-wiki");
    for (const note of allNotes) {
      for (const chunkId of this.meta.getChunkIdsByNote(note.id)) {
        try {
          const fetched = collection.fetchSync([chunkId]);
          if (!fetched || Object.keys(fetched).length === 0) {
            logger.debug(
              `Reconciliation: chunk ${chunkId} missing from vector store, marking note pending`,
            );
            this.meta.markPending(note.id);
            fixed++;
            break; // One fix per note is enough to trigger recovery
          }
        } catch (err) {
          logger.debug(
            `Failed to fetch chunk ${chunkId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
    return fixed;
  }

  #restoreSnapshot(noteId: string, snapshot: NoteSnapshot | null): void {
    if (!snapshot) {
      this.meta.deleteNote(noteId);
      return;
    }
    this.meta.db.transaction(() => {
      this.meta.deleteNote(snapshot.note.id);
      this.meta.db
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

      const insertChunk = this.meta.db.prepare(
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
    })();
  }
}

/**
 * Extract a section from markdown content by heading name (case-insensitive).
 * Returns content from the matching heading to the next heading of same or
 * higher level.
 */
export function extractSection(content: string, headingName: string): string {
  const lines = content.split("\n");
  let collecting = false;
  let matchLevel = 0;
  const result: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim();

      if (collecting && level <= matchLevel) break;

      if (text.toLowerCase() === headingName.toLowerCase()) {
        collecting = true;
        matchLevel = level;
      }
    }

    if (collecting) {
      result.push(line);
    }
  }

  return result.length > 0 ? result.join("\n") : `[Section "${headingName}" not found]`;
}
