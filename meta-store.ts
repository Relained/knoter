import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NoteRow {
  id: string;
  vault_id: string;
  file_path: string;
  title: string | null;
  file_hash: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChunkRow {
  id: string;
  note_id: string;
  heading: string | null;
  content: string;
  offset_start: number | null;
  offset_end: number | null;
  token_count: number | null;
}

export interface ChunkInsert {
  id: string;
  noteId: string;
  heading?: string;
  content: string;
  offsetStart: number;
  offsetEnd: number;
  tokenCount: number;
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
}

export interface VaultConfigRow {
  vault_id: string;
  embedding_model: string;
  created_at: string;
}

export interface VaultStatus {
  noteCount: number;
  chunkCount: number;
  tagCount: number;
  lastIndexedAt: string | null;
  embeddingModel: string | null;
}

// ─── MetaDB ──────────────────────────────────────────────────────────────────

export class MetaDB {
  readonly db: Database;

  constructor(dbOrVaultRoot: Database | string) {
    if (dbOrVaultRoot instanceof Database) {
      this.db = dbOrVaultRoot;
    } else {
      const kmDir = join(dbOrVaultRoot, ".km");
      mkdirSync(kmDir, { recursive: true });
      this.db = new Database(join(kmDir, "meta.db"));
    }
    this.#configure();
    this.#initSchema();
  }

  /** 테스트용 in-memory DB */
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
          vault_id        TEXT PRIMARY KEY,
          embedding_model TEXT NOT NULL,
          created_at      TEXT NOT NULL
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id          TEXT PRIMARY KEY,
          vault_id    TEXT NOT NULL,
          file_path   TEXT NOT NULL,
          title       TEXT,
          file_hash   TEXT NOT NULL,
          created_at  TEXT,
          updated_at  TEXT,
          indexed_at  TEXT
        )
      `);
      this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_vault_path
        ON notes(vault_id, file_path)
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS chunks (
          id           TEXT PRIMARY KEY,
          note_id      TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          heading      TEXT,
          content      TEXT NOT NULL,
          offset_start INTEGER,
          offset_end   INTEGER,
          token_count  INTEGER
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

      // FTS5 external content table (trigram for Korean/CJK support)
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

  // ── Notes CRUD ────────────────────────────────────────────────────────────

  upsertNote(note: NoteInput): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO notes (id, vault_id, file_path, title, file_hash, created_at, updated_at, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_path  = excluded.file_path,
         title      = excluded.title,
         file_hash  = excluded.file_hash,
         updated_at = excluded.updated_at,
         indexed_at = excluded.indexed_at`,
      [
        note.id,
        note.vaultId,
        note.filePath,
        note.title ?? null,
        note.fileHash,
        note.createdAt?.toISOString() ?? now,
        note.updatedAt?.toISOString() ?? now,
        now,
      ],
    );
  }

  getNote(id: string): NoteRow | null {
    return this.db.query("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | null;
  }

  getNoteByPath(vaultId: string, filePath: string): NoteRow | null {
    return this.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path = ?")
      .get(vaultId, filePath) as NoteRow | null;
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
      `INSERT INTO chunks (id, note_id, heading, content, offset_start, offset_end, token_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of chunks) {
      insert.run(
        c.id,
        c.noteId,
        c.heading ?? null,
        c.content,
        c.offsetStart,
        c.offsetEnd,
        c.tokenCount,
      );
    }
  }

  getChunksByNote(noteId: string): ChunkRow[] {
    return this.db
      .query("SELECT * FROM chunks WHERE note_id = ? ORDER BY offset_start")
      .all(noteId) as ChunkRow[];
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

  searchFts(query: string, limit = 20, vaultId?: string, offset = 0): FtsResult[] {
    if (vaultId) {
      return this.db
        .query(
          `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
           FROM chunks_fts f
           JOIN chunks c ON c.rowid = f.rowid
           JOIN notes n ON c.note_id = n.id
           WHERE chunks_fts MATCH ? AND n.vault_id = ?
           ORDER BY f.rank
           LIMIT ? OFFSET ?`,
        )
        .all(query, vaultId, limit, offset) as FtsResult[];
    }
    return this.db
      .query(
        `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
         FROM chunks_fts f
         JOIN chunks c ON c.rowid = f.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY f.rank
         LIMIT ? OFFSET ?`,
      )
      .all(query, limit, offset) as FtsResult[];
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
         )
         SELECT
           ns.noteCount, cs.chunkCount, ts.tagCount, ns.lastIndexedAt,
           (SELECT embedding_model FROM vault_config WHERE vault_id = ?1) AS embeddingModel
         FROM note_stats ns, chunk_stats cs, tag_stats ts`,
      )
      .get(vaultId) as VaultStatus;
  }

  // ── Sync / Reindex ────────────────────────────────────────────────────────

  /**
   * 노트를 원자적으로 재인덱싱한다.
   * 기존 chunks/tags 삭제 → note upsert → chunks 삽입 → tags 삽입
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
