import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type VectorSyncStatus = "pending" | "synced";

export interface NoteRow {
  id: string;
  vault_id: string;
  file_path: string;
  title: string | null;
  file_hash: string;
  frontmatter: string | null; // JSON object of parsed YAML frontmatter
  vector_sync_status: VectorSyncStatus;
  created_at: string | null;
  updated_at: string | null;
  indexed_at: string | null;
}

export interface NoteInput {
  id: string;
  vaultId: string;
  filePath: string;
  title?: string;
  fileHash: string;
  frontmatter?: Record<string, string>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChunkRow {
  id: string;
  note_id: string;
  heading: string | null;
  heading_path: string | null; // JSON array: ["# Intro", "## Setup"]
  content: string;
  offset_start: number | null;
  offset_end: number | null;
  token_count: number | null;
  seq_index: number | null;
  prev_chunk_id: string | null;
  next_chunk_id: string | null;
}

export interface ChunkInsert {
  id: string;
  noteId: string;
  heading?: string;
  headingPath?: string[];
  content: string;
  offsetStart: number;
  offsetEnd: number;
  tokenCount: number;
  seqIndex: number;
  prevChunkId?: string;
  nextChunkId?: string;
}

export interface TagRow {
  note_id: string;
  tag: string;
  source: string;
}

export type TagSource = "manual" | "auto" | "frontmatter";

export interface FtsResult {
  chunkId: string;
  noteId: string;
  content: string;
  rank: number;
  /** BM25 score normalized to [0, 1] */
  score: number;
}

export interface VaultConfigRow {
  vault_id: string;
  embedding_model: string;
  preprocessor_alias: string | null;
  created_at: string;
}

export interface VaultStatus {
  noteCount: number;
  chunkCount: number;
  tagCount: number;
  pendingCount: number;
  lastIndexedAt: string | null;
  embeddingModel: string | null;
  preprocessorAlias: string | null;
}

export interface ContextRow {
  vault_id: string;
  path_prefix: string;
  description: string;
}

export interface PreprocessorRow {
  alias: string;
  command: string;
  language: string | null;
}

export interface LlmCacheRow {
  cache_key: string;
  cache_type: string;
  value: string;
  created_at: string;
}

// ─── FTS5 Query Builder ─────────────────────────────────────────────────────

/**
 * Escape a string for use inside FTS5 double-quoted terms.
 * FTS5 only requires `"` to be doubled.
 */
function fts5Escape(s: string): string {
  return s.replace(/"/g, '""');
}

/**
 * Build a safe FTS5 query from user input.
 * - Bare terms become prefix matches: `"term"*`
 * - "quoted phrases" stay exact: `"phrase"`
 * - -negation becomes `NOT "term"`
 * - All positive terms are ANDed.
 */
export function buildFtsQuery(input: string): string {
  const parts: string[] = [];
  const negParts: string[] = [];

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "-" && i + 1 < input.length && input[i + 1] !== " ") {
      i++; // skip -
      const term = readTerm(input, i);
      i += term.length;
      if (term) {
        negParts.push(`NOT "${fts5Escape(term)}"`);
      }
      continue;
    }
    if (ch === '"') {
      i++; // skip opening quote
      const end = input.indexOf('"', i);
      const phrase = end >= 0 ? input.slice(i, end) : input.slice(i);
      i = end >= 0 ? end + 1 : input.length;
      if (phrase) {
        parts.push(`"${fts5Escape(phrase)}"`);
      }
      continue;
    }
    const term = readTerm(input, i);
    i += term.length;
    if (term) {
      parts.push(`"${fts5Escape(term)}"*`);
    }
  }

  const pos = parts.join(" AND ");
  if (negParts.length === 0) return pos;
  const neg = negParts.join(" ");
  return pos ? `${pos} ${neg}` : neg;
}

function readTerm(input: string, start: number): string {
  let end = start;
  while (end < input.length && input[end] !== " " && input[end] !== "\t") {
    end++;
  }
  return input.slice(start, end);
}

// ─── BM25 Score Normalization ───────────────────────────────────────────────

/**
 * Normalize FTS5 BM25 raw score to [0, 1].
 * FTS5 returns negative values (more negative = better match).
 * Formula: pos / (1 + pos) where pos = -raw
 */
export function normalizeBM25(raw: number): number {
  const pos = -raw;
  return pos / (1 + pos);
}

// ─── MetaDB ──────────────────────────────────────────────────────────────────

export class MetaDB {
  readonly db: Database;

  constructor(dbOrVaultRoot: Database | string) {
    if (dbOrVaultRoot instanceof Database) {
      this.db = dbOrVaultRoot;
    } else {
      const knDir = join(dbOrVaultRoot, ".kn");
      mkdirSync(knDir, { recursive: true });
      this.db = new Database(join(knDir, "meta.db"));
    }
    this.#configure();
    this.#initSchema();
  }

  static openInMemory(): MetaDB {
    return new MetaDB(new Database(":memory:"));
  }

  close(): void {
    this.db.close();
  }

  // ── Private setup ─────────────────────────────────────────────────────────

  #configure(): void {
    this.db.run("PRAGMA journal_mode=WAL");
    this.db.run("PRAGMA foreign_keys=ON");
  }

  #initSchema(): void {
    this.db.transaction(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS vault_config (
          vault_id           TEXT PRIMARY KEY,
          embedding_model    TEXT NOT NULL,
          preprocessor_alias TEXT,
          created_at         TEXT NOT NULL
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id                  TEXT PRIMARY KEY,
          vault_id            TEXT NOT NULL,
          file_path           TEXT NOT NULL,
          title               TEXT,
          file_hash           TEXT NOT NULL,
          frontmatter         TEXT,
          vector_sync_status  TEXT NOT NULL DEFAULT 'pending',
          created_at          TEXT,
          updated_at          TEXT,
          indexed_at          TEXT
        )
      `);
      this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_vault_path
        ON notes(vault_id, file_path)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_vault_hash
        ON notes(vault_id, file_hash)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_sync_status
        ON notes(vector_sync_status) WHERE vector_sync_status = 'pending'
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS chunks (
          id             TEXT PRIMARY KEY,
          note_id        TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          heading        TEXT,
          heading_path   TEXT,
          content        TEXT NOT NULL,
          offset_start   INTEGER,
          offset_end     INTEGER,
          token_count    INTEGER,
          seq_index      INTEGER NOT NULL DEFAULT 0,
          prev_chunk_id  TEXT,
          next_chunk_id  TEXT
        )
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_chunks_note_id ON chunks(note_id)
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tags (
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          tag     TEXT NOT NULL,
          source  TEXT DEFAULT 'manual',
          PRIMARY KEY (note_id, tag)
        )
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)
      `);

      // FTS5 external content table (trigram as default for CJK baseline)
      this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          content, content=chunks, content_rowid=rowid, tokenize="trigram"
        )
      `);

      // FTS5 sync triggers
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
          INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END
      `);
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, content)
            VALUES('delete', old.rowid, old.content);
        END
      `);
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, content)
            VALUES('delete', old.rowid, old.content);
          INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END
      `);

      // ── Path context descriptions ─────────────────────────────────────────
      this.db.run(`
        CREATE TABLE IF NOT EXISTS contexts (
          vault_id    TEXT NOT NULL,
          path_prefix TEXT NOT NULL,
          description TEXT NOT NULL,
          PRIMARY KEY (vault_id, path_prefix)
        )
      `);

      // ── Preprocessor registry ─────────────────────────────────────────────
      this.db.run(`
        CREATE TABLE IF NOT EXISTS preprocessors (
          alias    TEXT PRIMARY KEY,
          command  TEXT NOT NULL,
          language TEXT
        )
      `);

      // ── LLM cache (reranker scores, expander outputs) ────────────────────
      this.db.run(`
        CREATE TABLE IF NOT EXISTS llm_cache (
          cache_key  TEXT PRIMARY KEY,
          cache_type TEXT NOT NULL,
          value      TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_llm_cache_type
        ON llm_cache(cache_type)
      `);
    })();
  }

  // ── Vault Config ──────────────────────────────────────────────────────────

  setEmbeddingModel(vaultId: string, model: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO vault_config (vault_id, embedding_model, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(vault_id) DO UPDATE SET embedding_model = excluded.embedding_model`,
      [vaultId, model, now],
    );
  }

  getEmbeddingModel(vaultId: string): string | null {
    const row = this.db
      .query("SELECT embedding_model FROM vault_config WHERE vault_id = ?")
      .get(vaultId) as { embedding_model: string } | null;
    return row?.embedding_model ?? null;
  }

  setPreprocessor(vaultId: string, alias: string | null): void {
    this.db.run(
      "UPDATE vault_config SET preprocessor_alias = ? WHERE vault_id = ?",
      [alias, vaultId],
    );
  }

  getPreprocessor(vaultId: string): string | null {
    const row = this.db
      .query("SELECT preprocessor_alias FROM vault_config WHERE vault_id = ?")
      .get(vaultId) as { preprocessor_alias: string | null } | null;
    return row?.preprocessor_alias ?? null;
  }

  // ── Notes CRUD ────────────────────────────────────────────────────────────

  upsertNote(note: NoteInput): void {
    const now = new Date().toISOString();
    const fm = note.frontmatter ? JSON.stringify(note.frontmatter) : null;
    this.db.run(
      `INSERT INTO notes (id, vault_id, file_path, title, file_hash, frontmatter, vector_sync_status, created_at, updated_at, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_path          = excluded.file_path,
         title              = excluded.title,
         file_hash          = excluded.file_hash,
         frontmatter        = excluded.frontmatter,
         vector_sync_status = 'pending',
         updated_at         = excluded.updated_at,
         indexed_at         = excluded.indexed_at`,
      [
        note.id,
        note.vaultId,
        note.filePath,
        note.title ?? null,
        note.fileHash,
        fm,
        note.createdAt?.toISOString() ?? now,
        note.updatedAt?.toISOString() ?? now,
        now,
      ],
    );
  }

  /** Mark a note's vector sync as complete. */
  markSynced(noteId: string): void {
    this.db.run(
      "UPDATE notes SET vector_sync_status = 'synced' WHERE id = ?",
      [noteId],
    );
  }

  /** Mark multiple notes as synced in a transaction. */
  markSyncedBatch(noteIds: string[]): void {
    this.db.transaction(() => {
      const stmt = this.db.prepare(
        "UPDATE notes SET vector_sync_status = 'synced' WHERE id = ?",
      );
      for (const id of noteIds) {
        stmt.run(id);
      }
    })();
  }

  /** List notes that have pending vector sync. */
  listPendingNotes(vaultId: string): NoteRow[] {
    return this.db
      .query(
        "SELECT * FROM notes WHERE vault_id = ? AND vector_sync_status = 'pending' ORDER BY file_path",
      )
      .all(vaultId) as NoteRow[];
  }

  getNote(id: string): NoteRow | null {
    return this.db.query("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | null;
  }

  getNoteByPath(vaultId: string, filePath: string): NoteRow | null {
    return this.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path = ?")
      .get(vaultId, filePath) as NoteRow | null;
  }

  /** Content-addressed dedup: check if a file with this hash already exists and is synced. */
  getNoteByHash(vaultId: string, fileHash: string): NoteRow | null {
    return this.db
      .query(
        "SELECT * FROM notes WHERE vault_id = ? AND file_hash = ? AND vector_sync_status = 'synced' LIMIT 1",
      )
      .get(vaultId, fileHash) as NoteRow | null;
  }

  deleteNote(id: string): void {
    this.db.run("DELETE FROM notes WHERE id = ?", [id]);
  }

  deleteNotesBatch(ids: string[]): void {
    this.db.transaction(() => {
      const del = this.db.prepare("DELETE FROM notes WHERE id = ?");
      for (const id of ids) {
        del.run(id);
      }
    })();
  }

  listNotes(vaultId: string, limit = 50, offset = 0): NoteRow[] {
    return this.db
      .query("SELECT * FROM notes WHERE vault_id = ? ORDER BY file_path LIMIT ? OFFSET ?")
      .all(vaultId, limit, offset) as NoteRow[];
  }

  // ── Chunks CRUD ───────────────────────────────────────────────────────────

  insertChunks(chunks: ChunkInsert[]): void {
    this.db.transaction(() => {
      this.#insertChunksRaw(chunks);
    })();
  }

  #insertChunksRaw(chunks: ChunkInsert[]): void {
    const insert = this.db.prepare(
      `INSERT INTO chunks (id, note_id, heading, heading_path, content, offset_start, offset_end, token_count, seq_index, prev_chunk_id, next_chunk_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of chunks) {
      insert.run(
        c.id,
        c.noteId,
        c.heading ?? null,
        c.headingPath ? JSON.stringify(c.headingPath) : null,
        c.content,
        c.offsetStart,
        c.offsetEnd,
        c.tokenCount,
        c.seqIndex,
        c.prevChunkId ?? null,
        c.nextChunkId ?? null,
      );
    }
  }

  getChunk(chunkId: string): ChunkRow | null {
    return this.db
      .query("SELECT * FROM chunks WHERE id = ?")
      .get(chunkId) as ChunkRow | null;
  }

  getChunksByNote(noteId: string): ChunkRow[] {
    return this.db
      .query("SELECT * FROM chunks WHERE note_id = ? ORDER BY seq_index")
      .all(noteId) as ChunkRow[];
  }

  /** Get chunk IDs for a note (for reconciliation with vector store). */
  getChunkIdsByNote(noteId: string): string[] {
    return (
      this.db
        .query("SELECT id FROM chunks WHERE note_id = ? ORDER BY seq_index")
        .all(noteId) as { id: string }[]
    ).map((r) => r.id);
  }

  deleteChunksByNote(noteId: string): void {
    this.db.run("DELETE FROM chunks WHERE note_id = ?", [noteId]);
  }

  // ── Tags CRUD ─────────────────────────────────────────────────────────────

  setTags(
    noteId: string,
    tags: Array<{ tag: string; source?: TagSource }>,
  ): void {
    this.db.transaction(() => {
      this.#setTagsRaw(noteId, tags);
    })();
  }

  #setTagsRaw(
    noteId: string,
    tags: Array<{ tag: string; source?: TagSource }>,
  ): void {
    this.db.run("DELETE FROM tags WHERE note_id = ?", [noteId]);
    const insert = this.db.prepare(
      "INSERT INTO tags (note_id, tag, source) VALUES (?, ?, ?)",
    );
    for (const t of tags) {
      insert.run(noteId, t.tag, t.source ?? "manual");
    }
  }

  addTag(noteId: string, tag: string, source: TagSource = "manual"): void {
    this.db.run(
      "INSERT OR IGNORE INTO tags (note_id, tag, source) VALUES (?, ?, ?)",
      [noteId, tag, source],
    );
  }

  removeTag(noteId: string, tag: string): void {
    this.db.run("DELETE FROM tags WHERE note_id = ? AND tag = ?", [
      noteId,
      tag,
    ]);
  }

  getTagsByNote(noteId: string): TagRow[] {
    return this.db
      .query("SELECT * FROM tags WHERE note_id = ? ORDER BY tag")
      .all(noteId) as TagRow[];
  }

  getNotesByTag(tag: string, vaultId?: string, limit = 50, offset = 0): NoteRow[] {
    if (vaultId) {
      return this.db
        .query(
          `SELECT n.* FROM notes n
           JOIN tags t ON n.id = t.note_id
           WHERE t.tag = ? AND n.vault_id = ?
           ORDER BY n.file_path
           LIMIT ? OFFSET ?`,
        )
        .all(tag, vaultId, limit, offset) as NoteRow[];
    }
    return this.db
      .query(
        `SELECT n.* FROM notes n
         JOIN tags t ON n.id = t.note_id
         WHERE t.tag = ?
         ORDER BY n.file_path
         LIMIT ? OFFSET ?`,
      )
      .all(tag, limit, offset) as NoteRow[];
  }

  listAllTags(vaultId: string, limit = 50, offset = 0): Array<{ tag: string; count: number }> {
    return this.db
      .query(
        `SELECT t.tag, COUNT(*) as count
         FROM tags t
         JOIN notes n ON t.note_id = n.id
         WHERE n.vault_id = ?
         GROUP BY t.tag
         ORDER BY count DESC
         LIMIT ? OFFSET ?`,
      )
      .all(vaultId, limit, offset) as Array<{ tag: string; count: number }>;
  }

  // ── FTS5 Search ───────────────────────────────────────────────────────────

  /**
   * Search FTS5 with a safe query builder.
   * Raw user input is converted via buildFtsQuery() before MATCH.
   * Results include normalized BM25 scores.
   */
  searchFts(query: string, limit = 20, vaultId?: string, offset = 0): FtsResult[] {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];

    if (vaultId) {
      return (
        this.db
          .query(
            `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
             FROM chunks_fts f
             JOIN chunks c ON c.rowid = f.rowid
             JOIN notes n ON c.note_id = n.id
             WHERE chunks_fts MATCH ? AND n.vault_id = ?
               AND n.vector_sync_status = 'synced'
             ORDER BY f.rank
             LIMIT ? OFFSET ?`,
          )
          .all(ftsQuery, vaultId, limit, offset) as Array<{ chunkId: string; noteId: string; content: string; rank: number }>
      ).map((r) => ({ ...r, score: normalizeBM25(r.rank) }));
    }
    return (
      this.db
        .query(
          `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
           FROM chunks_fts f
           JOIN chunks c ON c.rowid = f.rowid
           JOIN notes n ON c.note_id = n.id
           WHERE chunks_fts MATCH ?
             AND n.vector_sync_status = 'synced'
           ORDER BY f.rank
           LIMIT ? OFFSET ?`,
        )
        .all(ftsQuery, limit, offset) as Array<{ chunkId: string; noteId: string; content: string; rank: number }>
    ).map((r) => ({ ...r, score: normalizeBM25(r.rank) }));
  }

  // ── Context CRUD ──────────────────────────────────────────────────────────

  addContext(vaultId: string, pathPrefix: string, description: string): void {
    this.db.run(
      `INSERT INTO contexts (vault_id, path_prefix, description)
       VALUES (?, ?, ?)
       ON CONFLICT(vault_id, path_prefix) DO UPDATE SET description = excluded.description`,
      [vaultId, pathPrefix, description],
    );
  }

  removeContext(vaultId: string, pathPrefix: string): void {
    this.db.run(
      "DELETE FROM contexts WHERE vault_id = ? AND path_prefix = ?",
      [vaultId, pathPrefix],
    );
  }

  listContexts(vaultId: string): ContextRow[] {
    return this.db
      .query("SELECT * FROM contexts WHERE vault_id = ? ORDER BY path_prefix")
      .all(vaultId) as ContextRow[];
  }

  /** Find the most specific context matching a file path. */
  getContextForPath(vaultId: string, filePath: string): string | null {
    const row = this.db
      .query(
        `SELECT description FROM contexts
         WHERE vault_id = ? AND ? LIKE (path_prefix || '%')
         ORDER BY length(path_prefix) DESC
         LIMIT 1`,
      )
      .get(vaultId, filePath) as { description: string } | null;
    return row?.description ?? null;
  }

  // ── Preprocessor Registry ─────────────────────────────────────────────────

  registerPreprocessor(alias: string, command: string, language?: string): void {
    this.db.run(
      `INSERT INTO preprocessors (alias, command, language)
       VALUES (?, ?, ?)
       ON CONFLICT(alias) DO UPDATE SET command = excluded.command, language = excluded.language`,
      [alias, command, language ?? null],
    );
  }

  removePreprocessor(alias: string): void {
    this.db.run("DELETE FROM preprocessors WHERE alias = ?", [alias]);
  }

  getPreprocessorCommand(alias: string): string | null {
    const row = this.db
      .query("SELECT command FROM preprocessors WHERE alias = ?")
      .get(alias) as { command: string } | null;
    return row?.command ?? null;
  }

  listPreprocessors(): PreprocessorRow[] {
    return this.db
      .query("SELECT * FROM preprocessors ORDER BY alias")
      .all() as PreprocessorRow[];
  }

  // ── LLM Cache ─────────────────────────────────────────────────────────────

  getLlmCache(cacheKey: string): string | null {
    const row = this.db
      .query("SELECT value FROM llm_cache WHERE cache_key = ?")
      .get(cacheKey) as { value: string } | null;
    return row?.value ?? null;
  }

  setLlmCache(cacheKey: string, cacheType: string, value: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO llm_cache (cache_key, cache_type, value, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
      [cacheKey, cacheType, value, now],
    );
  }

  getLlmCacheBatch(cacheKeys: string[]): Map<string, string> {
    const result = new Map<string, string>();
    if (cacheKeys.length === 0) return result;
    const placeholders = cacheKeys.map(() => "?").join(",");
    const rows = this.db
      .query(
        `SELECT cache_key, value FROM llm_cache WHERE cache_key IN (${placeholders})`,
      )
      .all(...cacheKeys) as Array<{ cache_key: string; value: string }>;
    for (const row of rows) {
      result.set(row.cache_key, row.value);
    }
    return result;
  }

  deleteLlmCache(cacheType?: string): void {
    if (cacheType) {
      this.db.run("DELETE FROM llm_cache WHERE cache_type = ?", [cacheType]);
    } else {
      this.db.run("DELETE FROM llm_cache");
    }
  }

  // ── Vault Status ──────────────────────────────────────────────────────────

  getVaultStatus(vaultId: string): VaultStatus {
    return this.db
      .query(
        `WITH note_stats AS (
           SELECT COUNT(*) AS noteCount, MAX(indexed_at) AS lastIndexedAt
           FROM notes WHERE vault_id = ?1
         ),
         chunk_stats AS (
           SELECT COUNT(*) AS chunkCount
           FROM chunks c JOIN notes n ON c.note_id = n.id WHERE n.vault_id = ?1
         ),
         tag_stats AS (
           SELECT COUNT(DISTINCT t.tag) AS tagCount
           FROM tags t JOIN notes n ON t.note_id = n.id WHERE n.vault_id = ?1
         ),
         pending_stats AS (
           SELECT COUNT(*) AS pendingCount
           FROM notes WHERE vault_id = ?1 AND vector_sync_status = 'pending'
         )
         SELECT
           ns.noteCount, cs.chunkCount, ts.tagCount, ps.pendingCount, ns.lastIndexedAt,
           (SELECT embedding_model FROM vault_config WHERE vault_id = ?1) AS embeddingModel,
           (SELECT preprocessor_alias FROM vault_config WHERE vault_id = ?1) AS preprocessorAlias
         FROM note_stats ns, chunk_stats cs, tag_stats ts, pending_stats ps`,
      )
      .get(vaultId) as VaultStatus;
  }

  // ── Sync / Reindex ────────────────────────────────────────────────────────

  /**
   * Atomically reindex a note.
   * Deletes existing chunks/tags -> upserts note (as pending) -> inserts new chunks -> sets tags.
   */
  reindexNote(
    note: NoteInput,
    chunks: ChunkInsert[],
    tags: Array<{ tag: string; source?: TagSource }>,
  ): void {
    this.db.transaction(() => {
      this.deleteChunksByNote(note.id);
      this.upsertNote(note);
      this.#insertChunksRaw(chunks);
      this.#setTagsRaw(note.id, tags);
    })();
  }
}
