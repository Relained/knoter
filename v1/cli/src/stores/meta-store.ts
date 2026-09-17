import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getShortCjkFallbackTerms } from "../pipeline/preprocessor";

// ─── Types ───────────────────────────────────────────────────────────────────

export type VectorSyncStatus = "pending" | "synced";
export type DocumentLayer = "source" | "artifact";

/** Keyword search scope. Semantic/hybrid retrieval is llm-wiki only. */
export type SearchScope = "llm-wiki" | "artifacts" | "sources" | "all";

export interface NoteLineage {
  sourceNoteId?: string;
  sourcePath?: string;
  rewriteAgent?: string;
  rewritePromptHash?: string;
  artifactTemplateId?: string;
}

export interface NoteRow {
  id: string;
  vault_id: string;
  file_path: string;
  title: string | null;
  file_hash: string;
  frontmatter: string | null; // JSON object of parsed YAML frontmatter
  vector_sync_status: VectorSyncStatus;
  doc_date: string | null;    // logical document date, usually YYYY-MM-DD
  layer: DocumentLayer;       // source, rewritten, artifact
  kind: string | null;        // explicit user/agent-provided type only
  source_note_id: string | null;
  source_path: string | null;
  rewrite_agent: string | null;
  rewrite_prompt_hash: string | null;
  artifact_template_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  indexed_at: string | null;
  language: string | null;    // "cjk", "latin", "mixed", etc.
}

export interface NoteInput {
  id: string;
  vaultId: string;
  filePath: string;
  title?: string;
  fileHash: string;
  frontmatter?: Record<string, string>;
  docDate?: string | Date;
  layer?: DocumentLayer;
  kind?: string | null;
  lineage?: NoteLineage;
  createdAt?: Date;
  updatedAt?: Date;
  language?: string;         // "cjk", "latin", "mixed", etc.
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

export interface FtsResult {
  chunkId: string;
  noteId: string;
  content: string;
  rank: number;
  /** BM25 score normalized to [0, 1] */
  score: number;
}

export interface VaultStatus {
  noteCount: number;
  chunkCount: number;
  pendingCount: number;
  sourceCount: number;
  artifactCount: number;
  pendingWorkCount: number;
  lastIndexedAt: string | null;
  lastSyncAt: string | null;
  embeddingModel: string | null;
}

export type DocumentGraphEdgeKind =
  | "source_rewritten"
  | "artifact_template"
  | "note_chunk"
  | "chunk_prev"
  | "chunk_next";

export interface DocumentGraphEdgeInput {
  fromId: string;
  toId: string;
  kind: DocumentGraphEdgeKind;
  metadata?: Record<string, unknown>;
}

export interface DocumentGraphEdgeRow {
  vault_id: string;
  from_id: string;
  to_id: string;
  kind: DocumentGraphEdgeKind;
  metadata_json: string | null;
  created_at: string;
}

// ─── Agent work queue ────────────────────────────────────────────────────────
// Source-layer file changes detected by sync are queued here. A periodically
// invoked external agent (codex/claude over MCP) drains the queue and
// creates/updates/deletes artifacts accordingly.

export type AgentWorkChange = "added" | "updated" | "deleted";
export type AgentWorkStatus = "pending" | "done";

export interface AgentWorkItem {
  id: number;
  vault_id: string;
  source_path: string;
  source_note_id: string | null;
  change: AgentWorkChange;
  status: AgentWorkStatus;
  enqueued_at: string;
  completed_at: string | null;
  result_note: string | null;
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

function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
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

/** Build the note-scope SQL clause for keyword search. */
function scopeClause(scope: SearchScope): string {
  switch (scope) {
    case "llm-wiki":
      return "AND n.layer = 'artifact' AND n.kind = 'llm-wiki'";
    case "artifacts":
      return "AND n.layer = 'artifact'";
    case "sources":
      return "AND n.layer = 'source'";
    case "all":
      return "";
  }
}

function normalizeDocDate(input?: string | Date): string | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly?.[1]) return dateOnly[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// ─── MetaDB ──────────────────────────────────────────────────────────────────
// Unified SQLite CRUD for vault metadata: notes, chunks, FTS, document graph,
// agent work queue, and sync state. Vector storage lives in vec-store.
// Vault layout: <vault>/{templates,sources,artifacts}/ + <vault>/.db/.

export const VAULT_DB_DIR = ".db";

export class MetaDB {
  readonly db: Database;

  constructor(dbOrVaultRoot: Database | string) {
    if (dbOrVaultRoot instanceof Database) {
      this.db = dbOrVaultRoot;
    } else {
      const dbDir = join(dbOrVaultRoot, VAULT_DB_DIR);
      mkdirSync(dbDir, { recursive: true });
      this.db = new Database(join(dbDir, "meta.db"));
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
          doc_date            TEXT,
          layer               TEXT NOT NULL DEFAULT 'source',
          kind                TEXT,
          source_note_id      TEXT REFERENCES notes(id) ON DELETE SET NULL,
          source_path         TEXT,
          rewrite_agent       TEXT,
          rewrite_prompt_hash TEXT,
          artifact_template_id TEXT,
          created_at          TEXT,
          updated_at          TEXT,
          indexed_at          TEXT,
          language            TEXT
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
        CREATE INDEX IF NOT EXISTS idx_notes_vault_doc_date
        ON notes(vault_id, doc_date)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_vault_layer
        ON notes(vault_id, layer)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_vault_kind
        ON notes(vault_id, kind)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_source_note
        ON notes(source_note_id)
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

      this.db.run(`
        CREATE TABLE IF NOT EXISTS document_graph_edges (
          vault_id      TEXT NOT NULL,
          from_id       TEXT NOT NULL,
          to_id         TEXT NOT NULL,
          kind          TEXT NOT NULL,
          metadata_json TEXT,
          created_at    TEXT NOT NULL,
          PRIMARY KEY (vault_id, from_id, to_id, kind)
        )
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_document_graph_edges_from
        ON document_graph_edges(vault_id, from_id, kind)
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_document_graph_edges_to
        ON document_graph_edges(vault_id, to_id, kind)
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS agent_queue (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          vault_id        TEXT NOT NULL,
          source_path     TEXT NOT NULL,
          source_note_id  TEXT,
          change          TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'pending',
          enqueued_at     TEXT NOT NULL,
          completed_at    TEXT,
          result_note     TEXT
        )
      `);
      this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_queue_pending_path
        ON agent_queue(vault_id, source_path) WHERE status = 'pending'
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_agent_queue_status
        ON agent_queue(vault_id, status)
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS sync_state (
          vault_id     TEXT PRIMARY KEY,
          last_sync_at TEXT NOT NULL
        )
      `);

      // Removed subsystems (tags, structured signals, pageindex, preprocessor
      // registry, legacy rewritten layer). Dropping keeps long-lived dev
      // vaults consistent.
      this.db.run("DROP TABLE IF EXISTS tags");
      this.db.run("DROP TABLE IF EXISTS note_signals");
      this.db.run("DROP TABLE IF EXISTS pageindex_documents");
      this.db.run("DROP TABLE IF EXISTS pageindex_nodes");
      this.db.run("DROP TABLE IF EXISTS preprocessors");
      this.db.run("DELETE FROM notes WHERE layer = 'rewritten'");
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

  // ── Notes CRUD ────────────────────────────────────────────────────────────

  upsertNote(note: NoteInput): void {
    const now = new Date().toISOString();
    const fm = note.frontmatter ? JSON.stringify(note.frontmatter) : null;
    const docDate = normalizeDocDate(note.docDate);
    const layer = note.layer ?? "source";
    const kind = note.kind?.trim() || null;
    const lineage = note.lineage ?? {};
    const sourceNoteId =
      lineage.sourceNoteId && this.getNote(lineage.sourceNoteId)
        ? lineage.sourceNoteId
        : null;
    this.db.run(
      `INSERT INTO notes (
         id, vault_id, file_path, title, file_hash, frontmatter, vector_sync_status,
         doc_date, layer, kind, source_note_id, source_path, rewrite_agent,
         rewrite_prompt_hash, artifact_template_id,
         created_at, updated_at, indexed_at, language
       )
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_path            = excluded.file_path,
         title                = excluded.title,
         file_hash            = excluded.file_hash,
         frontmatter          = excluded.frontmatter,
         vector_sync_status   = 'pending',
         doc_date             = excluded.doc_date,
         layer                = excluded.layer,
         kind                 = excluded.kind,
         source_note_id       = excluded.source_note_id,
         source_path          = excluded.source_path,
         rewrite_agent        = excluded.rewrite_agent,
         rewrite_prompt_hash  = excluded.rewrite_prompt_hash,
         artifact_template_id = excluded.artifact_template_id,
         updated_at           = excluded.updated_at,
         indexed_at           = excluded.indexed_at,
         language             = excluded.language`,
      [
        note.id,
        note.vaultId,
        note.filePath,
        note.title ?? null,
        note.fileHash,
        fm,
        docDate,
        layer,
        kind,
        sourceNoteId,
        lineage.sourcePath ?? null,
        lineage.rewriteAgent ?? null,
        lineage.rewritePromptHash ?? null,
        lineage.artifactTemplateId ?? null,
        note.createdAt?.toISOString() ?? now,
        note.updatedAt?.toISOString() ?? now,
        now,
        note.language ?? null,
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

  /** Mark a note as needing vector recovery. */
  markPending(noteId: string): void {
    this.db.run(
      "UPDATE notes SET vector_sync_status = 'pending' WHERE id = ?",
      [noteId],
    );
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

  deleteNote(id: string): void {
    this.db.run("DELETE FROM notes WHERE id = ?", [id]);
  }

  listNotes(vaultId: string, limit = 50, offset = 0): NoteRow[] {
    return this.db
      .query("SELECT * FROM notes WHERE vault_id = ? ORDER BY file_path LIMIT ? OFFSET ?")
      .all(vaultId, limit, offset) as NoteRow[];
  }

  listNotesByLayer(
    vaultId: string,
    layer: DocumentLayer,
    limit = 50,
    offset = 0,
  ): NoteRow[] {
    return this.db
      .query(
        `SELECT * FROM notes
         WHERE vault_id = ? AND layer = ?
         ORDER BY doc_date DESC, file_path
         LIMIT ? OFFSET ?`,
      )
      .all(vaultId, layer, limit, offset) as NoteRow[];
  }

  listNotesByDate(
    vaultId: string,
    docDate: string,
    layer?: DocumentLayer,
    limit = 100,
    offset = 0,
  ): NoteRow[] {
    if (layer) {
      return this.db
        .query(
          `SELECT * FROM notes
           WHERE vault_id = ? AND doc_date = ? AND layer = ?
           ORDER BY kind, file_path
           LIMIT ? OFFSET ?`,
        )
        .all(vaultId, docDate, layer, limit, offset) as NoteRow[];
    }
    return this.db
      .query(
        `SELECT * FROM notes
         WHERE vault_id = ? AND doc_date = ?
         ORDER BY layer, kind, file_path
         LIMIT ? OFFSET ?`,
      )
      .all(vaultId, docDate, limit, offset) as NoteRow[];
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

  /**
   * Atomically reindex a note.
   * Deletes existing chunks -> upserts note (as pending) -> inserts new chunks.
   */
  reindexNote(note: NoteInput, chunks: ChunkInsert[]): void {
    this.db.transaction(() => {
      this.deleteChunksByNote(note.id);
      this.upsertNote(note);
      this.#insertChunksRaw(chunks);
    })();
  }

  // ── Agent Work Queue ──────────────────────────────────────────────────────

  /**
   * Record a source-layer change for the external agent. One pending item per
   * source path: re-changes collapse into the earliest meaningful state
   * ("added" beats "updated"; "deleted" cancels an unprocessed "added").
   */
  enqueueAgentWork(
    vaultId: string,
    input: { sourcePath: string; sourceNoteId?: string | null; change: AgentWorkChange },
  ): void {
    const now = new Date().toISOString();
    const pending = this.db
      .query(
        "SELECT * FROM agent_queue WHERE vault_id = ? AND source_path = ? AND status = 'pending'",
      )
      .get(vaultId, input.sourcePath) as AgentWorkItem | null;

    if (!pending) {
      this.db.run(
        `INSERT INTO agent_queue (vault_id, source_path, source_note_id, change, status, enqueued_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [vaultId, input.sourcePath, input.sourceNoteId ?? null, input.change, now],
      );
      return;
    }

    if (input.change === "deleted") {
      if (pending.change === "added") {
        // Source appeared and disappeared before the agent ever saw it.
        this.db.run("DELETE FROM agent_queue WHERE id = ?", [pending.id]);
      } else {
        this.db.run(
          "UPDATE agent_queue SET change = 'deleted', source_note_id = ?, enqueued_at = ? WHERE id = ?",
          [input.sourceNoteId ?? null, now, pending.id],
        );
      }
      return;
    }

    const change = pending.change === "added" ? "added" : input.change;
    this.db.run(
      "UPDATE agent_queue SET change = ?, source_note_id = ? WHERE id = ?",
      [change, input.sourceNoteId ?? pending.source_note_id, pending.id],
    );
  }

  listPendingAgentWork(vaultId: string, limit = 100): AgentWorkItem[] {
    return this.db
      .query(
        `SELECT * FROM agent_queue
         WHERE vault_id = ? AND status = 'pending'
         ORDER BY enqueued_at, id
         LIMIT ?`,
      )
      .all(vaultId, limit) as AgentWorkItem[];
  }

  /** Mark queue items done. Returns the number of items updated. */
  completeAgentWork(vaultId: string, ids: number[], resultNote?: string): number {
    if (ids.length === 0) return 0;
    const now = new Date().toISOString();
    let updated = 0;
    this.db.transaction(() => {
      const stmt = this.db.prepare(
        `UPDATE agent_queue SET status = 'done', completed_at = ?, result_note = ?
         WHERE vault_id = ? AND id = ? AND status = 'pending'`,
      );
      for (const id of ids) {
        const result = stmt.run(now, resultNote ?? null, vaultId, id);
        updated += result.changes;
      }
    })();
    return updated;
  }

  countPendingAgentWork(vaultId: string): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) AS count FROM agent_queue WHERE vault_id = ? AND status = 'pending'",
      )
      .get(vaultId) as { count: number };
    return row.count;
  }

  // ── Sync State ────────────────────────────────────────────────────────────
  // Persisted so the implicit pre-read sync can debounce across one-shot CLI
  // processes, not just within a long-lived MCP server.

  getLastSyncAt(vaultId: string): string | null {
    const row = this.db
      .query("SELECT last_sync_at FROM sync_state WHERE vault_id = ?")
      .get(vaultId) as { last_sync_at: string } | null;
    return row?.last_sync_at ?? null;
  }

  setLastSyncAt(vaultId: string, when: Date = new Date()): void {
    this.db.run(
      `INSERT INTO sync_state (vault_id, last_sync_at) VALUES (?, ?)
       ON CONFLICT(vault_id) DO UPDATE SET last_sync_at = excluded.last_sync_at`,
      [vaultId, when.toISOString()],
    );
  }

  // ── Document Graph Metadata ──────────────────────────────────────────────

  replaceDocumentGraphEdges(
    vaultId: string,
    edges: DocumentGraphEdgeInput[],
  ): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run("DELETE FROM document_graph_edges WHERE vault_id = ?", [vaultId]);
      const insert = this.db.prepare(
        `INSERT INTO document_graph_edges
           (vault_id, from_id, to_id, kind, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const edge of edges) {
        insert.run(
          vaultId,
          edge.fromId,
          edge.toId,
          edge.kind,
          edge.metadata ? JSON.stringify(edge.metadata) : null,
          now,
        );
      }
    })();
  }

  listDocumentGraphEdges(vaultId: string): DocumentGraphEdgeRow[] {
    return this.db
      .query(
        `SELECT * FROM document_graph_edges
         WHERE vault_id = ?
         ORDER BY from_id, kind, to_id`,
      )
      .all(vaultId) as DocumentGraphEdgeRow[];
  }

  // ── FTS5 Search ───────────────────────────────────────────────────────────

  /**
   * Search FTS5 with a safe query builder.
   * Raw user input is converted via buildFtsQuery() before MATCH.
   * Results include normalized BM25 scores.
   */
  searchFts(
    query: string,
    limit = 20,
    vaultId?: string,
    offset = 0,
    scope: SearchScope = "llm-wiki",
  ): FtsResult[] {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];
    const artifactClause = scopeClause(scope);

    const ftsRows = vaultId
      ? (
        this.db
          .query(
            `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
             FROM chunks_fts f
             JOIN chunks c ON c.rowid = f.rowid
             JOIN notes n ON c.note_id = n.id
             WHERE chunks_fts MATCH ? AND n.vault_id = ?
               AND n.vector_sync_status = 'synced'
               ${artifactClause}
             ORDER BY f.rank
             LIMIT ? OFFSET ?`,
          )
          .all(ftsQuery, vaultId, limit, offset) as Array<{ chunkId: string; noteId: string; content: string; rank: number }>
      )
      : (
        this.db
          .query(
            `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
             FROM chunks_fts f
             JOIN chunks c ON c.rowid = f.rowid
             JOIN notes n ON c.note_id = n.id
             WHERE chunks_fts MATCH ?
               AND n.vector_sync_status = 'synced'
               ${artifactClause}
             ORDER BY f.rank
             LIMIT ? OFFSET ?`,
          )
          .all(ftsQuery, limit, offset) as Array<{ chunkId: string; noteId: string; content: string; rank: number }>
      );

    if (ftsRows.length > 0) {
      return ftsRows.map((r) => ({ ...r, score: normalizeBM25(r.rank) }));
    }

    // FTS5 trigram cannot match sub-3-char CJK queries. When FTS returns no
    // rows, run a scoped LIKE fallback for short CJK terms.
    const shortCjkTerms = getShortCjkFallbackTerms(query);
    if (shortCjkTerms.length === 0) return [];

    const likeClauses = shortCjkTerms.map(() => "c.content LIKE ? ESCAPE char(92)").join(" OR ");
    const likeParams = shortCjkTerms.map((term) => `%${escapeLikePattern(term)}%`);
    const fallbackRank = -0.2; // conservative, deterministic, positive normalized score

    const fallbackRows = vaultId
      ? (
        this.db
          .query(
            `SELECT c.id AS chunkId, c.note_id AS noteId, c.content
             FROM chunks c
             JOIN notes n ON c.note_id = n.id
             WHERE (${likeClauses}) AND n.vault_id = ?
               AND n.vector_sync_status = 'synced'
               ${artifactClause}
             ORDER BY c.id
             LIMIT ? OFFSET ?`,
          )
          .all(...likeParams, vaultId, limit, offset) as Array<{ chunkId: string; noteId: string; content: string }>
      )
      : (
        this.db
          .query(
            `SELECT c.id AS chunkId, c.note_id AS noteId, c.content
             FROM chunks c
             JOIN notes n ON c.note_id = n.id
             WHERE (${likeClauses})
               AND n.vector_sync_status = 'synced'
               ${artifactClause}
             ORDER BY c.id
             LIMIT ? OFFSET ?`,
          )
          .all(...likeParams, limit, offset) as Array<{ chunkId: string; noteId: string; content: string }>
      );

    return fallbackRows.map((r) => ({
      ...r,
      rank: fallbackRank,
      score: normalizeBM25(fallbackRank),
    }));
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
         pending_stats AS (
           SELECT COUNT(*) AS pendingCount
           FROM notes WHERE vault_id = ?1 AND vector_sync_status = 'pending'
         ),
         work_stats AS (
           SELECT COUNT(*) AS pendingWorkCount
           FROM agent_queue WHERE vault_id = ?1 AND status = 'pending'
         ),
         layer_stats AS (
           SELECT
             SUM(CASE WHEN layer = 'source' THEN 1 ELSE 0 END) AS sourceCount,
             SUM(CASE WHEN layer = 'artifact' THEN 1 ELSE 0 END) AS artifactCount
           FROM notes WHERE vault_id = ?1
         )
         SELECT
           ns.noteCount, cs.chunkCount, ps.pendingCount,
           ws.pendingWorkCount,
           COALESCE(ls.sourceCount, 0) AS sourceCount,
           COALESCE(ls.artifactCount, 0) AS artifactCount,
           ns.lastIndexedAt,
           (SELECT last_sync_at FROM sync_state WHERE vault_id = ?1) AS lastSyncAt,
           (SELECT embedding_model FROM vault_config WHERE vault_id = ?1) AS embeddingModel
         FROM note_stats ns, chunk_stats cs, pending_stats ps, work_stats ws, layer_stats ls`,
      )
      .get(vaultId) as VaultStatus;
  }
}
