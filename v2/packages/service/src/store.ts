import Database from 'better-sqlite3';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  WikiDocument,
  WorkspaceSnapshot,
  Revision,
  Source,
  TrashedDocument,
} from '@knoter/contracts';
import {
  DAILY_RUN_LIMIT,
  MAX_SOURCE_BYTES,
  MAX_TAGS,
  PIPELINE,
  providerProfiles,
  type WorkerInfo,
  proposalSchema,
  type EvidenceVersion,
  type JobInfo,
  type Proposal,
  type Citation,
  type WatchInfo,
  type ReferenceEvidence,
} from '@knoter/contracts/native';
import {
  atomicWrite,
  secureDir,
  sha,
  uuid,
  now,
  requireThat,
  localDay,
  nextDay,
} from './common.js';
import { extract, validateWikiMarkdown, resolveWikiLinks, insertWikiLink } from './markdown.js';
import { normalize, rank, snippet, terms } from './search.js';
import { sameReference } from './references.js';

export interface SourceRow {
  id: string;
  path: string;
  watch_id: string | null;
  filename: string;
  latest: string;
  processed: string | null;
  availability: string;
  detected_at: string;
  added_at: string;
  missing_since: string | null;
}
/** A missing file becomes a removal after this grace, so moves and saves settle first. */
export const REMOVAL_GRACE_MS = 120_000;
export interface JobRow {
  id: string;
  source_id: string;
  version_id: string;
  status: JobInfo['status'];
  stage: string;
  attempts: number;
  next_run: number;
  error: string | null;
  created_at: string;
  successor: string | null;
  generation: number;
  lease_until: number;
  owner: string | null;
  cancel: number;
  skill_hash: string;
  pipeline: string;
}
interface DocumentRow {
  data: string;
  deleted_at: string | null;
  deleted_by: string | null;
  trash_reason: string | null;
}
/** A document row; trashed ones carry who moved them (NULL from v1 meant the user). */
export type StoredDocument = WikiDocument & Partial<Omit<TrashedDocument, keyof WikiDocument>>;
function storedDocument(r: DocumentRow): StoredDocument {
  return {
    ...JSON.parse(r.data),
    ...(r.deleted_at
      ? {
          deletedAt: r.deleted_at,
          deletedBy: r.deleted_by === 'knoter' ? 'knoter' : 'you',
          ...(r.trash_reason ? { trashReason: r.trash_reason } : {}),
        }
      : {}),
  };
}
/**
 * What one attempt was given and what it read. Versions are immutable, so the corpus is no
 * longer frozen per job; replacements are fenced by the revision recorded when read.
 */
export interface AttemptContext {
  workspaceId: string;
  jobId: string;
  generation: number;
  changedVersionId: string;
  previousVersionId: string | null;
  requiredDocumentIds: string[];
  /** Append-only read log. */
  readVersions: string[];
  readDocuments: Record<string, number>;
  references?: ReferenceEvidence[];
}
/** Proposals saved for review before v2 carried a frozen corpus instead of a read log. */
interface LegacyManifest {
  workspaceId: string;
  jobId: string;
  generation: number;
  changedVersionId: string;
  sources: EvidenceVersion[];
  documents: StoredDocument[];
  requiredDocumentIds: string[];
  references?: ReferenceEvidence[];
}
export function contextOf(data: { context?: AttemptContext; manifest?: LegacyManifest }) {
  if (data.context) return data.context;
  const m = data.manifest!;
  return {
    workspaceId: m.workspaceId,
    jobId: m.jobId,
    generation: m.generation,
    changedVersionId: m.changedVersionId,
    previousVersionId: null,
    requiredDocumentIds: m.requiredDocumentIds,
    readVersions: m.sources.map((v) => v.id),
    readDocuments: Object.fromEntries(m.documents.map((d) => [d.id, d.revision])),
    references: m.references,
  } satisfies AttemptContext;
}
/**
 * Tags as labels: NFKC, no leading '#', single spaces, at most 32 characters and MAX_TAGS per
 * page. A tag matching an existing one apart from case takes the existing spelling, so the
 * vocabulary converges instead of splitting into near-duplicates.
 */
const titleKey = (title: string) => title.normalize('NFKC').trim().toLowerCase();
export function normalizeTags(tags: string[], vocabulary: string[] = []) {
  const known = new Map(vocabulary.map((t) => [t.toLocaleLowerCase(), t]));
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.normalize('NFKC').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    const key = tag.toLocaleLowerCase();
    if (tag && !out.some((o) => o.toLocaleLowerCase() === key)) out.push(known.get(key) ?? tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
/** A visible link may be written with or without percent-encoding. */
export function containsUrl(body: string, url: string) {
  const variants = new Set([url, encodeURI(url)]);
  try {
    variants.add(decodeURI(url));
  } catch {}
  return [...variants].some((v) => body.includes(v));
}
export class Store {
  db: Database.Database;
  workspaceId: string;
  constructor(
    public dir: string,
    public skillHash: string,
  ) {
    secureDir(dir);
    secureDir(join(dir, 'blobs'));
    secureDir(join(dir, 'attempts'));
    this.db = new Database(join(dir, 'wiki.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = FULL');
    let version = this.db.pragma('user_version', { simple: true }) as number;
    requireThat(version <= 2, 'SCHEMA', 'This database requires a newer knoter version.');
    if (!version) {
      this.db.transaction(() => {
        this.db.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE watches (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, last_scan TEXT, error TEXT);
        CREATE TABLE sources (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, watch_id TEXT REFERENCES watches(id), filename TEXT NOT NULL, latest TEXT NOT NULL, processed TEXT, availability TEXT NOT NULL, detected_at TEXT NOT NULL, added_at TEXT NOT NULL);
        CREATE TABLE versions (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) DEFERRABLE INITIALLY DEFERRED, version INTEGER NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(source_id,version));
        CREATE TABLE jobs (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), version_id TEXT NOT NULL REFERENCES versions(id), pipeline TEXT NOT NULL, skill_hash TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_run INTEGER NOT NULL, error TEXT, created_at TEXT NOT NULL, successor TEXT, generation INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, owner TEXT, cancel INTEGER NOT NULL DEFAULT 0, UNIQUE(version_id,pipeline,skill_hash));
        CREATE TABLE attempts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), generation INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, cli_version TEXT, pid INTEGER, skill_hash TEXT NOT NULL, model TEXT NOT NULL, manifest TEXT NOT NULL, result TEXT, error TEXT, usage TEXT, tools TEXT);
        CREATE TABLE documents (id TEXT PRIMARY KEY, data TEXT NOT NULL, deleted_at TEXT);
        CREATE TABLE revisions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), revision INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(document_id,revision));
        CREATE TABLE citations (revision_id TEXT NOT NULL REFERENCES revisions(id), source_id TEXT NOT NULL REFERENCES sources(id), version_id TEXT NOT NULL REFERENCES versions(id), segment_id TEXT NOT NULL, PRIMARY KEY(revision_id,version_id,segment_id));
        CREATE TABLE dependencies (document_id TEXT NOT NULL REFERENCES documents(id), source_id TEXT NOT NULL REFERENCES sources(id), PRIMARY KEY(document_id,source_id));
        CREATE TABLE proposals (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), data TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT);
        CREATE TABLE applications (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id));
        CREATE TABLE events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
        CREATE TABLE usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
        PRAGMA user_version = 1;
      `);
        this.set('workspaceId', uuid());
        this.set('settings', { theme: 'light', workerPaused: false });
        this.set('cli', {
          provider: 'codex',
          path: '',
          version: '',
          status: 'missing',
          message: 'Select an installed Codex CLI or Claude Code in Worker settings.',
        });
      })();
      version = 1;
    }
    if (version === 1)
      // v2: deletion provenance and removal grace. The unused v1 full-text index is dropped;
      // worker retrieval searches in memory so two-character Korean terms still match.
      this.db.transaction(() => {
        this.db.exec(`
        ALTER TABLE documents ADD COLUMN deleted_by TEXT;
        ALTER TABLE documents ADD COLUMN trash_reason TEXT;
        ALTER TABLE sources ADD COLUMN missing_since TEXT;
        DROP TABLE IF EXISTS wiki_search;
        PRAGMA user_version = 2;
      `);
      })();
    this.workspaceId = this.get<string>('workspaceId');
    // Only abandoned staging files are disposable. Referenced immutable blobs remain untouched.
    for (const file of readdirSync(join(dir, 'blobs')))
      if (file.endsWith('.tmp')) unlinkSync(join(dir, 'blobs', file));
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET status=CASE WHEN cancel=1 THEN 'cancelled' WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END, stage='recovered', generation=generation+1, owner=NULL, lease_until=0, error='Service restarted during execution', next_run=? WHERE status='running'",
        )
        .run(Date.now());
      this.db
        .prepare(
          "UPDATE attempts SET finished_at=?, error='Service restarted during execution' WHERE finished_at IS NULL",
        )
        .run(now());
      // A queued job must identify the skill and pipeline actually used by its next attempt.
      for (const row of this.all<{ source_id: string }>(
        "SELECT DISTINCT source_id FROM jobs WHERE status IN ('queued','retry_wait') AND (skill_hash<>? OR pipeline<>?)",
        this.skillHash,
        PIPELINE,
      ))
        this.enqueue(row.source_id, this.source(row.source_id).latest);
    })();
  }
  all<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  one<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  get<T>(key: string): T {
    return JSON.parse(
      this.one<{ value: string }>('SELECT value FROM settings WHERE key=?', key)!.value,
    ) as T;
  }
  /** Connections saved before provider selection existed were Codex. */
  cli(): WorkerInfo['cli'] {
    return {
      provider: 'codex',
      ...this.get<Partial<WorkerInfo['cli']>>('cli'),
    } as WorkerInfo['cli'];
  }
  set(key: string, value: unknown) {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, JSON.stringify(value));
  }
  reference(id: string): ReferenceEvidence {
    const row = this.one<{ value: string }>(
      'SELECT value FROM settings WHERE key=?',
      `reference:${id}`,
    );
    requireThat(row, 'NOT_FOUND', 'Official reference snapshot not found.');
    return JSON.parse(row.value);
  }
  event(title: string, detail: string, documentId?: string) {
    this.db.prepare('INSERT INTO events(data) VALUES (?)').run(
      JSON.stringify({
        id: uuid(),
        title,
        detail,
        documentId,
        kind: documentId ? 'document' : 'source',
        createdAt: now(),
      }),
    );
  }
  documents(): StoredDocument[] {
    return this.all<DocumentRow>(
      'SELECT data,deleted_at,deleted_by,trash_reason FROM documents',
    ).map(storedDocument);
  }
  document(id: string): StoredDocument {
    const r = this.one<DocumentRow>(
      'SELECT data,deleted_at,deleted_by,trash_reason FROM documents WHERE id=?',
      id,
    );
    requireThat(r, 'NOT_FOUND', 'Document does not exist.');
    return storedDocument(r);
  }
  version(id: string): EvidenceVersion {
    const r = this.one<{ data: string }>('SELECT data FROM versions WHERE id=?', id);
    requireThat(r, 'NOT_FOUND', 'Source version does not exist.');
    return JSON.parse(r.data);
  }
  // Versions are immutable, so their snapshot preview can be cached for the process.
  private previews = new Map<string, { version: number; size: number; excerpt: string }>();
  versionPreview(id: string) {
    let preview = this.previews.get(id);
    if (!preview) {
      const v = this.version(id);
      preview = {
        version: v.version,
        size: statSync(join(this.dir, 'blobs', v.hash)).size,
        excerpt: v.segments
          .map((s) => s.text)
          .join('\n\n')
          .slice(0, 2000),
      };
      this.previews.set(id, preview);
    }
    return preview;
  }
  source(id: string) {
    const s = this.one<SourceRow>('SELECT * FROM sources WHERE id=?', id);
    requireThat(s, 'NOT_FOUND', 'Source does not exist.');
    return s;
  }
  job(id: string) {
    const j = this.one<JobRow>('SELECT * FROM jobs WHERE id=?', id);
    requireThat(j, 'NOT_FOUND', 'Job does not exist.');
    return j;
  }
  watches(): WatchInfo[] {
    return this.all<WatchInfo>('SELECT id,path,last_scan AS lastScan,error FROM watches');
  }
  addWatch(path: string) {
    const existing = this.one<WatchInfo>('SELECT * FROM watches WHERE path=?', path);
    if (existing) return existing.id;
    const id = uuid();
    this.db.prepare('INSERT INTO watches VALUES (?,?,NULL,NULL)').run(id, path);
    return id;
  }
  enqueue(sourceId: string, versionId: string) {
    const existing = this.one<JobRow>(
      'SELECT * FROM jobs WHERE version_id=? AND pipeline=? AND skill_hash=?',
      versionId,
      PIPELINE,
      this.skillHash,
    );
    if (existing) return existing.id;
    const id = uuid();
    this.db
      .prepare(
        "INSERT INTO jobs(id,source_id,version_id,pipeline,skill_hash,model,status,stage,next_run,created_at) VALUES (?,?,?,?,?,?,'queued','queued',?,?)",
      )
      .run(
        id,
        sourceId,
        versionId,
        PIPELINE,
        this.skillHash,
        providerProfiles[this.cli().provider].model,
        Date.now(),
        now(),
      );
    this.db
      .prepare(
        "UPDATE jobs SET status='cancelled',stage='superseded',successor=?,error='Superseded by a newer source version' WHERE source_id=? AND id<>? AND status IN ('queued','retry_wait')",
      )
      .run(id, sourceId, id);
    return id;
  }
  ingest(input: {
    watchId: string | null;
    path: string;
    filename: string;
    bytes: string;
    hash: string;
  }) {
    const bytes = Buffer.from(input.bytes, 'base64');
    requireThat(
      bytes.length <= MAX_SOURCE_BYTES && bytes.toString('base64') === input.bytes,
      'FORMAT',
      'Invalid or oversized Markdown bytes.',
    );
    requireThat(sha(bytes) === input.hash, 'HASH', 'Source snapshot checksum mismatch.');
    requireThat(/\.md$/i.test(input.filename), 'FORMAT', 'This demo accepts Markdown (.md) only.');
    if (input.watchId)
      requireThat(
        this.watches().some((w) => w.id === input.watchId),
        'WATCH',
        'Unknown watched folder.',
      );
    const old = this.one<SourceRow>('SELECT * FROM sources WHERE path=?', input.path);
    const oldVersion = old ? this.version(old.latest) : undefined;
    if (old && oldVersion!.hash === input.hash && !oldVersion!.removed) {
      // Every scan re-registers unchanged files; write only when something changed.
      if (
        old.availability !== 'available' ||
        old.missing_since ||
        (input.watchId && input.watchId !== old.watch_id)
      )
        this.db
          .prepare(
            "UPDATE sources SET availability='available',missing_since=NULL,detected_at=?,watch_id=coalesce(?,watch_id) WHERE id=?",
          )
          .run(now(), input.watchId, old.id);
      return { sourceId: old.id, versionId: old.latest, duplicate: true };
    }
    if (!old && input.watchId) {
      // A moved or renamed file has the same bytes as exactly one note that just went missing
      // from this folder: keep that note's identity instead of removing and re-adding it.
      const moved = this.all<SourceRow>(
        'SELECT * FROM sources WHERE watch_id=? AND missing_since IS NOT NULL',
        input.watchId,
      ).filter((s) => {
        const v = this.version(s.latest);
        return !v.removed && v.hash === input.hash;
      });
      if (moved.length === 1) {
        this.db
          .prepare(
            "UPDATE sources SET path=?,filename=?,availability='available',missing_since=NULL,detected_at=? WHERE id=?",
          )
          .run(input.path, input.filename, now(), moved[0].id);
        this.event('Source moved', this.relPath({ ...moved[0], path: input.path }));
        return { sourceId: moved[0].id, versionId: moved[0].latest, duplicate: true };
      }
    }
    const sourceId = old?.id ?? uuid(),
      versionId = uuid();
    const evidence: EvidenceVersion = {
      id: versionId,
      sourceId,
      version: old ? this.version(old.latest).version + 1 : 1,
      hash: input.hash,
      filename: input.filename,
      segments: extract(bytes),
    };
    const blob = join(this.dir, 'blobs', input.hash);
    // Atomic replacement with identical bytes is safe even for A -> B -> A.
    atomicWrite(blob, bytes);
    return this.db.transaction(() => {
      if (old) {
        this.db
          .prepare(
            "UPDATE sources SET latest=?,filename=?,availability='available',missing_since=NULL,detected_at=?,watch_id=coalesce(?,watch_id) WHERE id=?",
          )
          .run(versionId, input.filename, now(), input.watchId, sourceId);
        if (oldVersion!.removed) this.restoreRemovedPages(sourceId);
      } else
        this.db
          .prepare(
            'INSERT INTO sources(id,path,watch_id,filename,latest,processed,availability,detected_at,added_at) VALUES (?,?,?,?,?,NULL,?,?,?)',
          )
          .run(
            sourceId,
            input.path,
            input.watchId,
            input.filename,
            versionId,
            'available',
            now(),
            now(),
          );
      this.db
        .prepare('INSERT INTO versions VALUES (?,?,?,?,?)')
        .run(versionId, sourceId, evidence.version, input.hash, JSON.stringify(evidence));
      const jobId = this.enqueue(sourceId, versionId);
      this.event('Source snapshot registered', `${input.filename} · version ${evidence.version}`);
      return { sourceId, versionId, jobId, duplicate: false };
    })();
  }
  scanComplete(watchId: string, paths: string[], error: string | null) {
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE watches SET last_scan=?,error=? WHERE id=?')
        .run(now(), error, watchId);
      const rows = this.all<SourceRow>('SELECT * FROM sources WHERE watch_id=?', watchId);
      // An unreadable folder (unmounted, renamed, denied) never counts as deleted notes.
      if (error) {
        this.db
          .prepare(
            "UPDATE sources SET availability='unavailable',missing_since=NULL WHERE watch_id=?",
          )
          .run(watchId);
        return;
      }
      const present = new Set(paths),
        stamp = now(),
        due: SourceRow[] = [];
      for (const s of rows) {
        if (this.searchable(s.latest).removed) continue;
        if (present.has(s.path)) {
          if (s.availability !== 'available' || s.missing_since)
            this.db
              .prepare("UPDATE sources SET availability='available',missing_since=NULL WHERE id=?")
              .run(s.id);
        } else if (!s.missing_since)
          this.db
            .prepare("UPDATE sources SET availability='missing',missing_since=? WHERE id=?")
            .run(stamp, s.id);
        else if (Date.now() - Date.parse(s.missing_since) >= REMOVAL_GRACE_MS) due.push(s);
      }
      const live = rows.filter((s) => !this.searchable(s.latest).removed).length;
      const held = due.length > Math.max(10, Math.ceil(live * 0.25));
      for (const s of due) this.tombstone(s, held);
    })();
  }
  /** Record that a note is gone: a new version without content, then a removal job. */
  private tombstone(s: SourceRow, held: boolean) {
    const prev = this.version(s.latest),
      versionId = uuid();
    // The hash repeats the last content so backups and integrity checks keep working.
    const evidence: EvidenceVersion = {
      id: versionId,
      sourceId: s.id,
      version: prev.version + 1,
      hash: prev.hash,
      filename: prev.filename,
      segments: [],
      removed: true,
    };
    this.db
      .prepare('INSERT INTO versions VALUES (?,?,?,?,?)')
      .run(versionId, s.id, evidence.version, evidence.hash, JSON.stringify(evidence));
    this.db.prepare('UPDATE sources SET latest=? WHERE id=?').run(versionId, s.id);
    const jobId = this.enqueue(s.id, versionId);
    if (held)
      this.db
        .prepare("UPDATE jobs SET status='needs_review',stage='mass removal',error=? WHERE id=?")
        .run('Many notes disappeared at once. Retry to remove their wiki content.', jobId);
    this.event(held ? 'Removal held for review' : 'Source removed', this.relPath(s));
  }
  /** Close a job that needs no model run, such as an empty note with no pages yet. */
  finishWithoutRun(j: JobRow, stage: string) {
    this.db.transaction(() => {
      this.lease(j);
      this.db
        .prepare(
          "UPDATE jobs SET status='succeeded',stage=?,error=NULL,owner=NULL,lease_until=0 WHERE id=?",
        )
        .run(stage, j.id);
      this.db.prepare('UPDATE sources SET processed=? WHERE id=?').run(j.version_id, j.source_id);
    })();
  }
  /** A returning note brings back the pages knoter moved to Trash when it disappeared. */
  private restoreRemovedPages(sourceId: string) {
    for (const d of this.documents())
      if (d.deletedBy === 'knoter' && d.sourceIds.includes(sourceId)) {
        this.db
          .prepare(
            'UPDATE documents SET deleted_at=NULL,deleted_by=NULL,trash_reason=NULL WHERE id=?',
          )
          .run(d.id);
        this.event('Restored with its source', d.title, d.id);
      }
  }
  /**
   * Settle a removal job's pages without a model where the outcome is certain: a page whose
   * every source is gone moves to Trash (a protected one becomes a review proposal). Returns
   * the pages that still need the worker: partly supported pages and hubs with subpages.
   */
  prepareRemoval(j: JobRow): string[] {
    return this.db.transaction(() => {
      this.lease(j);
      const active = this.documents().filter((d) => !d.deletedAt);
      const gone = (sourceId: string) => !!this.version(this.source(sourceId).latest).removed;
      const remaining: string[] = [],
        review: { documentId: string; expectedRevision: number; reason: string }[] = [];
      const reason = `Its source note was deleted: ${this.relPath(this.source(j.source_id))}`;
      for (const d of active.filter((d) => d.sourceIds.includes(j.source_id))) {
        const hasChildren = active.some((c) => c.title.startsWith(`${d.title}/`));
        if (!d.sourceIds.every(gone) || hasChildren) remaining.push(d.id);
        else if (d.protected)
          review.push({ documentId: d.id, expectedRevision: d.revision, reason });
        else {
          this.db
            .prepare(
              "UPDATE documents SET deleted_at=?,deleted_by='knoter',trash_reason=? WHERE id=?",
            )
            .run(now(), reason, d.id);
          this.event('Moved to Trash', d.title, d.id);
        }
      }
      if (review.length) {
        const proposal: Proposal = {
          outcome: 'needs_review',
          summary: `${review.length} protected page(s) lost every source note. Accept to move them to Trash.`,
          operations: [],
          trash: review,
          warnings: [],
        };
        this.db
          .prepare('INSERT INTO proposals VALUES (?,?,?,?,NULL)')
          .run(
            uuid(),
            j.id,
            JSON.stringify({ proposal, context: this.attemptContext(j, []) }),
            now(),
          );
        this.event('Wiki proposal ready', proposal.summary);
      }
      if (!remaining.length) {
        this.db
          .prepare('UPDATE jobs SET status=?,stage=?,error=?,owner=NULL,lease_until=0 WHERE id=?')
          .run(
            review.length ? 'needs_review' : 'succeeded',
            review.length ? 'removal review' : 'removed',
            review.length ? 'Protected pages need review before removal.' : null,
            j.id,
          );
        this.db.prepare('UPDATE sources SET processed=? WHERE id=?').run(j.version_id, j.source_id);
      }
      return remaining;
    })();
  }
  retry(sourceId: string) {
    this.db.transaction(() => {
      const source = this.source(sourceId),
        jobId = this.enqueue(sourceId, source.latest),
        j = this.job(jobId);
      requireThat(j.status !== 'running', 'BUSY', 'This source is already running.');
      requireThat(
        j.status !== 'succeeded' ||
          (this.jobResult(j.id)?.outcome === 'no_change' && !this.hasActiveWiki(sourceId)),
        'DONE',
        'This version is already processed.',
      );
      this.db
        .prepare(
          "UPDATE jobs SET status='queued',stage='manual retry',attempts=0,cancel=0,error=NULL,next_run=? WHERE id=?",
        )
        .run(Date.now(), jobId);
      this.db
        .prepare('UPDATE proposals SET resolved_at=? WHERE job_id=? AND resolved_at IS NULL')
        .run(now(), jobId);
      this.event('Retry requested', source.filename);
    })();
  }
  jobResult(jobId: string): JobInfo['result'] {
    const row = this.one<{ result: string | null }>(
      'SELECT result FROM attempts WHERE job_id=? ORDER BY rowid DESC LIMIT 1',
      jobId,
    );
    if (!row?.result) return undefined;
    const { outcome, summary, warnings } = JSON.parse(row.result) as Proposal;
    return { outcome, summary, warnings };
  }
  hasActiveWiki(sourceId: string) {
    return this.documents().some((d) => !d.deletedAt && d.sourceIds.includes(sourceId));
  }
  cancel(id: string) {
    const j = this.job(id);
    requireThat(
      j.status !== 'succeeded',
      'COMMITTED',
      'Already committed. Restore a document revision to undo it.',
    );
    requireThat(
      ['queued', 'retry_wait', 'running'].includes(j.status),
      'TERMINAL',
      'This job is already finished.',
    );
    this.db
      .prepare(
        "UPDATE jobs SET cancel=1,status=CASE WHEN status='running' THEN status ELSE 'cancelled' END WHERE id=?",
      )
      .run(id);
  }
  reserve(owner: string): JobRow | null {
    return this.db.transaction(() => {
      if (this.get<WorkspaceSnapshot['settings']>('settings').workerPaused) return null;
      if (this.one("SELECT id FROM jobs WHERE status='running'")) return null;
      const j = this.one<JobRow>(
        "SELECT * FROM jobs WHERE status IN ('queued','retry_wait') AND next_run<=? AND cancel=0 ORDER BY created_at LIMIT 1",
        Date.now(),
      );
      if (!j) return null;
      const usage =
        this.one<{ calls: number }>('SELECT calls FROM usage WHERE day=?', localDay())?.calls ?? 0;
      if (usage >= 20) {
        this.db
          .prepare("UPDATE jobs SET stage='daily limit',next_run=? WHERE id=?")
          .run(Date.parse(nextDay()), j.id);
        return null;
      }
      this.db
        .prepare(
          "UPDATE jobs SET status='running',stage='starting',attempts=attempts+1,generation=generation+1,owner=?,lease_until=?,error=NULL WHERE id=?",
        )
        .run(owner, Date.now() + 45_000, j.id);
      return this.job(j.id);
    })();
  }
  startAttempt(j: JobRow) {
    return this.db.transaction(() => {
      this.lease(j);
      const calls =
        this.one<{ calls: number }>('SELECT calls FROM usage WHERE day=?', localDay())?.calls ?? 0;
      if (calls >= DAILY_RUN_LIMIT) {
        this.db
          .prepare(
            "UPDATE jobs SET status='queued',stage='daily limit',attempts=attempts-1,owner=NULL,lease_until=0,next_run=? WHERE id=?",
          )
          .run(Date.parse(nextDay()), j.id);
        return false;
      }
      // Reserve immediately before spawn; a crash in this gap counts conservatively.
      this.db
        .prepare('INSERT INTO usage VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1')
        .run(localDay());
      return true;
    })();
  }
  lease(j: JobRow) {
    const current = this.job(j.id);
    requireThat(
      current.status === 'running' &&
        current.owner === j.owner &&
        current.generation === j.generation &&
        current.lease_until > Date.now() &&
        !current.cancel,
      'LEASE',
      'Job cancelled or lease expired.',
    );
    return current;
  }
  heartbeat(j: JobRow) {
    this.lease(j);
    this.db
      .prepare('UPDATE jobs SET lease_until=? WHERE id=? AND generation=?')
      .run(Date.now() + 45_000, j.id, j.generation);
  }
  /** Tags on active pages with their use counts, most used first. */
  tagVocabulary() {
    const counts = new Map<string, number>();
    for (const d of this.documents())
      if (!d.deletedAt) for (const t of d.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
  attemptContext(j: JobRow, required?: string[]): AttemptContext {
    const changed = this.verifiedVersion(j.version_id);
    const previous = this.one<{ id: string }>(
      'SELECT id FROM versions WHERE source_id=? AND version=?',
      j.source_id,
      changed.version - 1,
    );
    return {
      workspaceId: this.workspaceId,
      jobId: j.id,
      generation: j.generation,
      changedVersionId: j.version_id,
      previousVersionId: previous?.id ?? null,
      requiredDocumentIds:
        required ??
        this.all<{ document_id: string }>(
          'SELECT document_id FROM dependencies WHERE source_id=?',
          j.source_id,
        ).map((r) => r.document_id),
      readVersions: [],
      readDocuments: {},
    };
  }
  private verified = new Set<string>();
  /** A version whose stored original still matches its hash (checked once per process). */
  verifiedVersion(id: string) {
    const v = this.version(id);
    if (!this.verified.has(v.hash)) {
      requireThat(
        sha(readFileSync(join(this.dir, 'blobs', v.hash))) === v.hash,
        'HASH',
        'Stored source checksum mismatch.',
      );
      this.verified.add(v.hash);
    }
    return v;
  }
  relPath(s: Pick<SourceRow, 'path' | 'filename' | 'watch_id'>) {
    const w = s.watch_id
      ? this.one<{ path: string }>('SELECT path FROM watches WHERE id=?', s.watch_id)
      : undefined;
    return w ? relative(w.path, s.path) : s.filename;
  }
  /** Latest version IDs of sources that still exist: the only versions a citation may use. */
  latestVersionIds() {
    return this.all<SourceRow>('SELECT * FROM sources')
      .filter((s) => !this.searchable(s.latest).removed)
      .map((s) => s.latest);
  }
  private searchCache = new Map<
    string,
    { removed: boolean; headings: string; text: string; segments: EvidenceVersion['segments'] }
  >();
  private searchable(versionId: string) {
    let entry = this.searchCache.get(versionId);
    if (!entry) {
      const v = this.version(versionId);
      entry = {
        removed: !!v.removed,
        headings: normalize([...new Set(v.segments.map((s) => s.heading))].join('\n')),
        text: normalize(v.segments.map((s) => s.text).join('\n')),
        segments: v.segments,
      };
      this.searchCache.set(versionId, entry);
    }
    return entry;
  }
  searchSources(query: string, limit = 10) {
    const q = terms(query);
    if (!q.length) return [];
    const items = this.all<SourceRow>('SELECT * FROM sources')
      .map((row) => ({ row, rel: this.relPath(row), v: this.searchable(row.latest) }))
      .filter((i) => !i.v.removed);
    return rank(
      items,
      q,
      (i) => [
        { text: normalize(i.rel), weight: 4 },
        { text: i.v.headings, weight: 2 },
        { text: i.v.text, weight: 1 },
      ],
      limit,
    ).map(({ item, score }) => ({
      sourceId: item.row.id,
      versionId: item.row.latest,
      relPath: item.rel,
      score,
      snippets: item.v.segments
        .filter((seg) => q.some((t) => normalize(`${seg.heading}\n${seg.text}`).includes(t)))
        .slice(0, 2)
        .map((seg) => ({
          segmentId: seg.id,
          heading: seg.heading,
          text: snippet(seg.text, q),
        })),
    }));
  }
  private docCache = new Map<
    string,
    { title: string; description: string; tags: string; body: string }
  >();
  /** Matching pages, Trash tombstones included; an empty query lists recent page titles. */
  searchDocuments(query: string, limit = 12) {
    const docs = this.documents();
    const summary = (d: StoredDocument) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      tags: d.tags ?? [],
      revision: d.revision,
      protected: d.protected,
      deletedAt: d.deletedAt ?? null,
    });
    const q = terms(query);
    if (!q.length)
      return docs
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 200)
        .map((d) => ({
          id: d.id,
          title: d.title,
          revision: d.revision,
          deletedAt: d.deletedAt ?? null,
        }));
    return rank(
      docs,
      q,
      (d) => {
        const key = `${d.id}:${d.revision}`;
        let n = this.docCache.get(key);
        if (!n) {
          n = {
            title: normalize(d.title),
            description: normalize(d.description),
            tags: normalize((d.tags ?? []).join('\n')),
            body: normalize(d.body),
          };
          this.docCache.set(key, n);
        }
        return [
          { text: n.title, weight: 4 },
          { text: n.description, weight: 2 },
          { text: n.tags, weight: 2 },
          { text: n.body, weight: 1 },
        ];
      },
      limit,
    ).map(({ item, score }) => ({ ...summary(item), score, snippet: snippet(item.body, q) }));
  }
  stage(j: JobRow, stage: string) {
    this.lease(j);
    this.db.prepare('UPDATE jobs SET stage=? WHERE id=?').run(stage, j.id);
  }
  finishError(j: JobRow, code: string, message: string) {
    const current = this.job(j.id);
    if (current.status !== 'running' || current.generation !== j.generation) return;
    const retry = ['TRANSIENT', 'TIMEOUT'].includes(code) && current.attempts < 3;
    const status = current.cancel
      ? 'cancelled'
      : retry
        ? 'retry_wait'
        : ['AUTH', 'CLI', 'MODEL', 'CONFLICT', 'EVIDENCE', 'CORPUS_LIMIT'].includes(code)
          ? 'needs_review'
          : 'failed';
    this.db
      .prepare(
        'UPDATE jobs SET status=?,stage=?,error=?,owner=NULL,lease_until=0,next_run=? WHERE id=?',
      )
      .run(status, code, message, Date.now() + 30_000 * 2 ** (current.attempts - 1), j.id);
    this.event('Worker stopped', `${code}: ${message}`);
  }
  recordRevision(
    doc: WikiDocument,
    author: 'You' | 'knoter',
    summary: string,
    citations: Citation[] = [],
  ) {
    const revision: Revision = {
      id: uuid(),
      documentId: doc.id,
      revision: doc.revision,
      title: doc.title,
      body: doc.body,
      createdAt: doc.updatedAt,
      author,
      summary,
      references: doc.references,
    };
    this.db
      .prepare(
        'INSERT INTO documents(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(doc.id, JSON.stringify(doc));
    this.db
      .prepare('INSERT INTO revisions VALUES (?,?,?,?)')
      .run(revision.id, doc.id, doc.revision, JSON.stringify(revision));
    for (const c of citations)
      this.db
        .prepare('INSERT OR IGNORE INTO citations VALUES (?,?,?,?)')
        .run(revision.id, c.sourceId, c.versionId, c.segmentId);
    this.db.prepare('DELETE FROM dependencies WHERE document_id=?').run(doc.id);
    for (const sourceId of doc.sourceIds)
      this.db.prepare('INSERT OR IGNORE INTO dependencies VALUES (?,?)').run(doc.id, sourceId);
    this.event(summary, doc.title, doc.id);
  }
  citations(id: string, revision?: number): Citation[] {
    return this.all<Citation>(
      'SELECT c.source_id AS sourceId,c.version_id AS versionId,c.segment_id AS segmentId FROM citations c JOIN revisions r ON r.id=c.revision_id WHERE r.document_id=? AND r.revision=?',
      id,
      revision ?? this.document(id).revision,
    );
  }
  saveDocument(input: { id: string; title: string; body: string; baseRevision: number }) {
    this.db.transaction(() => {
      const doc = this.document(input.id);
      requireThat(!doc.deletedAt, 'TRASH', 'Restore this document before editing.');
      requireThat(
        doc.revision === input.baseRevision,
        'CONFLICT',
        'A newer revision exists. Your draft is still open; copy it before reloading.',
      );
      this.recordRevision(
        {
          ...doc,
          title: input.title,
          body: input.body,
          revision: doc.revision + 1,
          updatedAt: now(),
          protected: true,
        },
        'You',
        'Manual edit',
        this.citations(doc.id),
      );
    })();
  }
  createDocument() {
    const id = uuid();
    this.db.transaction(() =>
      this.recordRevision(
        {
          id,
          title: 'Untitled note',
          body: '',
          description: '',
          category: 'Personal',
          icon: 'book',
          sourceIds: [],
          relatedIds: [],
          favorite: false,
          revision: 1,
          updatedAt: now(),
          protected: true,
        },
        'You',
        'Created note',
      ),
    )();
    return id;
  }
  mutateDocument(id: string, action: 'deleteDocument' | 'restoreDocument' | 'toggleFavorite') {
    this.db.transaction(() => {
      const doc = this.document(id);
      if (action === 'toggleFavorite')
        this.db
          .prepare('UPDATE documents SET data=? WHERE id=?')
          .run(JSON.stringify({ ...doc, favorite: !doc.favorite }), id);
      else if (action === 'deleteDocument')
        this.db
          .prepare(
            "UPDATE documents SET deleted_at=?,deleted_by='you',trash_reason=NULL WHERE id=?",
          )
          .run(now(), id);
      else
        this.db
          .prepare(
            'UPDATE documents SET deleted_at=NULL,deleted_by=NULL,trash_reason=NULL WHERE id=?',
          )
          .run(id);
      this.event(action, doc.title, id);
    })();
  }
  restoreRevision(id: string) {
    const row = this.one<{ data: string }>('SELECT data FROM revisions WHERE id=?', id);
    requireThat(row, 'NOT_FOUND', 'Revision not found.');
    const r = JSON.parse(row.data) as Revision;
    const d = this.document(r.documentId);
    this.db.transaction(() => {
      requireThat(!d.deletedAt, 'TRASH', 'Restore the document first.');
      const citations = this.citations(d.id, r.revision);
      this.recordRevision(
        {
          ...d,
          title: r.title,
          body: r.body,
          references: r.references,
          sourceIds: [...new Set(citations.map((c) => c.sourceId))],
          protected: true,
          revision: d.revision + 1,
          updatedAt: now(),
        },
        'You',
        `Restored revision ${r.revision}`,
        citations,
      );
    })();
  }
  validateProposal(proposal: Proposal, context: AttemptContext) {
    proposalSchema.parse(proposal);
    const links = proposal.links ?? [];
    requireThat(
      proposal.outcome === 'changes'
        ? proposal.operations.length + links.length > 0
        : proposal.operations.length === 0 && links.length === 0,
      'FORMAT',
      'Proposal outcome and operations disagree.',
    );
    requireThat(
      links.reduce((n, l) => n + l.documents.length, 0) <= 30,
      'FORMAT',
      'Link at most 30 pages per proposal.',
    );
    const touched = new Set<string>();
    const documents = this.documents();
    const targets = [
      ...documents.filter((d) => !proposal.operations.some((o) => o.documentId === d.id)),
      ...proposal.operations.map((o) => ({ id: o.documentId ?? `new:${o.title}`, title: o.title })),
    ];
    for (const op of proposal.operations) {
      if (op.title.includes('/')) {
        const parent = op.title.slice(0, op.title.lastIndexOf('/'));
        requireThat(
          targets.some((d) => d.title === parent && !('deletedAt' in d && d.deletedAt)),
          'EVIDENCE',
          `Subtopic ${op.title} needs an active or proposed parent titled ${parent}. Rename an unprotected summary hub when appropriate.`,
        );
      }
      validateWikiMarkdown(op.body);
      resolveWikiLinks(op.body, targets);
      for (const c of op.referenceCitations ?? []) {
        const reference = context.references?.find((r) => sameReference(r.path, c.path));
        requireThat(
          reference && reference.segments.some((s) => s.id === c.segmentId),
          'EVIDENCE',
          'Reference citation was not read in this attempt.',
        );
        requireThat(
          containsUrl(op.body, reference.url),
          'EVIDENCE',
          'Supplemented knowledge needs a visible reference link.',
        );
      }
      requireThat(op.citations.length > 0, 'EVIDENCE', 'Each change needs source evidence.');
      for (const c of op.citations) {
        requireThat(
          context.readVersions.includes(c.versionId),
          'EVIDENCE',
          'Worker cited a source it did not read.',
        );
        const v = this.one<{ data: string }>('SELECT data FROM versions WHERE id=?', c.versionId);
        const version = v ? (JSON.parse(v.data) as EvidenceVersion) : undefined;
        requireThat(
          version &&
            version.sourceId === c.sourceId &&
            !version.removed &&
            version.segments.some((s) => s.id === c.segmentId),
          'EVIDENCE',
          'Citation does not match a read source segment.',
        );
      }
      const carried = op.documentId ? this.carriedCitations(op.documentId) : [];
      for (const m of op.body.matchAll(/\]\(source:([^\s)]+)\)/g))
        requireThat(
          op.citations.some((c) => c.sourceId === m[1]) || carried.some((c) => c.sourceId === m[1]),
          'EVIDENCE',
          'Citation link has no versioned evidence.',
        );
      const key = op.documentId ?? titleKey(op.title);
      requireThat(!touched.has(key), 'FORMAT', 'Duplicate document operation.');
      touched.add(key);
      if (op.op === 'create') {
        requireThat(
          op.documentId === null && op.expectedRevision === 0,
          'FORMAT',
          'Invalid create operation.',
        );
        requireThat(
          !documents.some(
            (d) =>
              d.title.normalize('NFKC').toLowerCase() === op.title.normalize('NFKC').toLowerCase(),
          ),
          'CONFLICT',
          'A document or Trash entry already uses this title.',
        );
      } else {
        requireThat(op.documentId, 'FORMAT', 'Invalid replace operation.');
        requireThat(
          context.readDocuments[op.documentId] === op.expectedRevision,
          'EVIDENCE',
          'Read a document at the revision you replace.',
        );
        const current = this.document(op.documentId);
        requireThat(!current.deletedAt, 'CONFLICT', 'Target is in Trash.');
        requireThat(
          current.revision === op.expectedRevision,
          'CONFLICT',
          'Document was edited during generation.',
        );
      }
    }
    for (const l of links)
      requireThat(
        this.linkTarget(l.target, proposal),
        'EVIDENCE',
        `Link target must be an active page ID or a page created in this proposal: ${l.target}`,
      );
  }
  /** The page a link request points to: an active page ID or a title created in the proposal. */
  private linkTarget(target: string, proposal: Proposal, assigned?: Map<string, string>) {
    const existing = this.one<DocumentRow>(
      'SELECT data,deleted_at,deleted_by,trash_reason FROM documents WHERE id=?',
      target,
    );
    if (existing && !existing.deleted_at) return target;
    const created = proposal.operations.find(
      (o) => o.op === 'create' && titleKey(o.title) === titleKey(target),
    );
    return created ? (assigned?.get(titleKey(created.title)) ?? `new:${created.title}`) : null;
  }
  /** Current citations that may carry into a replacement: their versions are still latest. */
  carriedCitations(documentId: string) {
    return this.citations(documentId).filter((c) => this.source(c.sourceId).latest === c.versionId);
  }
  apply(j: JobRow, context: AttemptContext, proposal: Proposal, applicationId: string) {
    return this.db.transaction(() => {
      if (this.one('SELECT id FROM applications WHERE id=?', applicationId)) return;
      this.lease(j);
      if (this.source(j.source_id).latest !== j.version_id) {
        const next = this.one<JobRow>(
          'SELECT * FROM jobs WHERE version_id=? ORDER BY created_at DESC LIMIT 1',
          this.source(j.source_id).latest,
        );
        this.db
          .prepare(
            "UPDATE jobs SET status='cancelled',stage='superseded',successor=?,error='Newer source version queued during generation',owner=NULL,lease_until=0 WHERE id=?",
          )
          .run(next?.id ?? null, j.id);
        this.event('Outdated result discarded', 'The latest source version remains queued.');
        return;
      }
      // Every cited version must still be current, including other sources used for integration.
      for (const c of proposal.operations.flatMap((o) => o.citations))
        requireThat(
          this.source(c.sourceId).latest === c.versionId,
          'CONFLICT',
          'Supporting evidence changed during generation.',
        );
      this.validateProposal(proposal, context);
      const removal = !!this.version(j.version_id).removed;
      if (proposal.outcome === 'no_change' && !removal && !this.hasActiveWiki(j.source_id)) {
        proposal = {
          ...proposal,
          outcome: 'needs_review',
          summary:
            `No wiki is linked to this source. Retry or review why no topic was created. ${proposal.summary}`.slice(
              0,
              3000,
            ),
        };
      }
      const protectedTarget = proposal.operations.some(
        (o) => o.documentId && this.document(o.documentId).protected,
      );
      // Only the user's own Trash is a tombstone; knoter's removals can be recreated.
      const userTrash = this.documents().filter((d) => d.deletedAt && d.deletedBy !== 'knoter');
      const trashOverlap = proposal.operations.some(
        (o) =>
          o.op === 'create' &&
          userTrash.some((d) => d.sourceIds.some((s) => o.citations.some((c) => c.sourceId === s))),
      );
      requireThat(
        !trashOverlap,
        'CONFLICT',
        'New topic overlaps evidence of a document in Trash. Restore or review that topic first.',
      );
      if (protectedTarget || proposal.outcome === 'needs_review') {
        this.db
          .prepare('INSERT INTO proposals VALUES (?,?,?,?,NULL)')
          .run(uuid(), j.id, JSON.stringify({ proposal, context }), now());
        this.db
          .prepare(
            "UPDATE jobs SET status='needs_review',stage='proposal',error=?,owner=NULL,lease_until=0 WHERE id=?",
          )
          .run(protectedTarget ? 'Protected document requires review' : proposal.summary, j.id);
        this.event('Wiki proposal ready', proposal.summary);
        return proposal;
      }
      const skipped = this.commitOperations(proposal, false, context);
      if (skipped.length)
        proposal = { ...proposal, warnings: [...proposal.warnings, ...skipped].slice(0, 20) };
      this.db.prepare('INSERT INTO applications VALUES (?,?)').run(applicationId, j.id);
      this.db
        .prepare(
          "UPDATE jobs SET status='succeeded',stage='completed',owner=NULL,lease_until=0 WHERE id=?",
        )
        .run(j.id);
      this.db.prepare('UPDATE sources SET processed=? WHERE id=?').run(j.version_id, j.source_id);
      this.event('Wiki worker completed', proposal.summary);
      return proposal;
    })();
  }
  /** Commit a validated proposal; returns warnings about link requests that were skipped. */
  commitOperations(proposal: Proposal, human: boolean, context: AttemptContext) {
    const operations = proposal.operations.map((op) => ({
      ...op,
      assignedId: op.documentId ?? uuid(),
    }));
    const targets = [
      ...this.documents().filter((d) => !operations.some((o) => o.documentId === d.id)),
      ...operations.map((o) => ({ id: o.assignedId, title: o.title })),
    ];
    const vocabulary = this.tagVocabulary().map(([tag]) => tag);
    for (const op of operations) {
      const old = op.documentId ? this.document(op.documentId) : undefined;
      const body = resolveWikiLinks(op.body, targets);
      // Evidence for retained claims carries over while its source link stays visible, so a
      // hub does not have to re-read every supporting note to keep its citations.
      const citations = [...op.citations];
      if (old)
        for (const c of this.carriedCitations(old.id))
          if (
            !op.citations.some((n) => n.sourceId === c.sourceId) &&
            body.includes(`](source:${c.sourceId})`)
          )
            citations.push(c);
      const fresh = (context.references ?? []).flatMap(({ segments: _segments, ...reference }) => {
        const segmentIds = [
          ...new Set(
            (op.referenceCitations ?? [])
              .filter((c) => sameReference(c.path, reference.path))
              .map((c) => c.segmentId),
          ),
        ];
        return segmentIds.length ? [{ ...reference, segmentIds }] : [];
      });
      const kept = (old?.references ?? []).filter(
        (r) => !fresh.some((f) => f.url === r.url) && containsUrl(body, r.url),
      );
      const doc: WikiDocument = {
        id: op.assignedId,
        title: op.title,
        body,
        references: [...fresh, ...kept],
        description: op.description,
        category: op.category,
        icon: old?.icon ?? 'book',
        sourceIds: [...new Set(citations.map((c) => c.sourceId))],
        relatedIds: old?.relatedIds ?? [],
        favorite: old?.favorite ?? false,
        revision: (old?.revision ?? 0) + 1,
        updatedAt: now(),
        protected: old?.protected ?? human,
        // Proposals saved before tags existed keep the page's tags.
        tags: normalizeTags(op.tags ?? old?.tags ?? [], vocabulary),
      };
      this.recordRevision(doc, human ? 'You' : 'knoter', op.reason, citations);
    }
    const assigned = new Map(operations.map((o) => [titleKey(o.title), o.assignedId]));
    return this.applyLinks(proposal, assigned, new Set(operations.map((o) => o.assignedId)));
  }
  /**
   * Link the first mention of a term in existing pages, deterministically: the body is not
   * rewritten, so these pages need no new evidence. Protected, changed, or unmatched pages
   * are skipped with a warning (D17).
   */
  private applyLinks(proposal: Proposal, assigned: Map<string, string>, written: Set<string>) {
    const warnings: string[] = [],
      bumped = new Map<string, number>();
    for (const l of proposal.links ?? []) {
      const targetId = this.linkTarget(l.target, proposal, assigned);
      if (!targetId || targetId.startsWith('new:')) continue;
      const targetTitle = this.document(targetId).title;
      for (const ref of l.documents) {
        if (written.has(ref.documentId) || ref.documentId === targetId) continue;
        const row = this.one<DocumentRow>(
          'SELECT data,deleted_at,deleted_by,trash_reason FROM documents WHERE id=?',
          ref.documentId,
        );
        const d = row ? storedDocument(row) : undefined;
        const skip = !d
          ? 'it does not exist'
          : d.deletedAt
            ? 'it is in Trash'
            : d.protected
              ? 'it is protected'
              : d.revision !== ref.expectedRevision + (bumped.get(d.id) ?? 0)
                ? 'it changed'
                : undefined;
        if (skip || !d) {
          warnings.push(
            `Did not link “${l.mentions[0]}” in ${d?.title ?? ref.documentId}: ${skip}.`,
          );
          continue;
        }
        const body = insertWikiLink(d.body, l.mentions, targetId);
        if (body === d.body) {
          if (!d.body.includes(`#/wiki/${targetId}`) && !d.body.includes(`[[${targetId}`))
            warnings.push(`Did not link “${l.mentions[0]}” in ${d.title}: no unlinked mention.`);
          continue;
        }
        validateWikiMarkdown(body);
        this.recordRevision(
          { ...d, body, revision: d.revision + 1, updatedAt: now() },
          'knoter',
          `Linked “${l.mentions[0]}” to ${targetTitle}`,
          this.citations(d.id, d.revision),
        );
        bumped.set(d.id, (bumped.get(d.id) ?? 0) + 1);
      }
    }
    return warnings;
  }
  resolveProposal(id: string, accept: boolean) {
    this.db.transaction(() => {
      const r = this.one<{ job_id: string; data: string }>(
        'SELECT job_id,data FROM proposals WHERE id=? AND resolved_at IS NULL',
        id,
      );
      requireThat(r, 'NOT_FOUND', 'Proposal already resolved.');
      const data = JSON.parse(r.data) as {
        proposal: Proposal;
        context?: AttemptContext;
        manifest?: LegacyManifest;
      };
      const proposal = data.proposal,
        context = contextOf(data);
      const j = this.job(r.job_id);
      if (accept) {
        requireThat(
          proposal.operations.length > 0 || (proposal.trash?.length ?? 0) > 0,
          'EVIDENCE',
          'This result has no changes to accept.',
        );
        requireThat(
          this.source(j.source_id).latest === j.version_id,
          'CONFLICT',
          'Proposal uses an older source. Retry the latest source.',
        );
        for (const t of proposal.trash ?? []) {
          const doc = this.document(t.documentId);
          requireThat(
            !doc.deletedAt && doc.revision === t.expectedRevision,
            'CONFLICT',
            'The page changed after this removal was proposed.',
          );
          this.db
            .prepare(
              "UPDATE documents SET deleted_at=?,deleted_by='knoter',trash_reason=? WHERE id=?",
            )
            .run(now(), t.reason, t.documentId);
          this.event('Moved to Trash', doc.title, doc.id);
        }
        for (const c of proposal.operations.flatMap((o) => o.citations))
          requireThat(
            this.source(c.sourceId).latest === c.versionId,
            'CONFLICT',
            'Proposal evidence is stale.',
          );
        this.validateProposal(proposal, context);
        this.commitOperations(proposal, true, context);
        this.db.prepare('UPDATE sources SET processed=? WHERE id=?').run(j.version_id, j.source_id);
      }
      this.db.prepare('UPDATE proposals SET resolved_at=? WHERE id=?').run(now(), id);
      // A removal job can also have run the worker; only a job waiting on review changes.
      if (j.status === 'needs_review')
        this.db
          .prepare('UPDATE jobs SET status=?,stage=?,error=NULL WHERE id=?')
          .run(accept ? 'succeeded' : 'cancelled', accept ? 'accepted' : 'rejected', r.job_id);
      this.event(accept ? 'Proposal accepted' : 'Proposal rejected', proposal.summary);
    })();
  }
  snapshot(lastTick: number | null, nextTick: number): WorkspaceSnapshot {
    const docs: StoredDocument[] = this.documents().map((d) => ({
        ...d,
        citations: this.citations(d.id, d.revision),
      })),
      jobs = this.all<JobRow>('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200');
    const sources: Source[] = this.all<SourceRow>('SELECT * FROM sources').map((s) => {
      const v = this.versionPreview(s.latest),
        job = jobs.find((j) => j.version_id === s.latest);
      return {
        id: s.id,
        title: s.filename,
        filename: s.filename,
        type: 'md',
        size: v.size,
        status:
          job?.status === 'running'
            ? 'extracting'
            : job && ['queued', 'retry_wait'].includes(job.status)
              ? 'queued'
              : job && ['failed', 'needs_review', 'cancelled'].includes(job.status)
                ? 'failed'
                : s.processed === s.latest
                  ? 'ready'
                  : 'queued',
        addedAt: s.added_at,
        excerpt: v.excerpt,
        documentIds: docs
          .filter((d) => !d.deletedAt && d.sourceIds.includes(s.id))
          .map((d) => d.id),
        latestVersionId: s.latest,
        latestVersion: v.version,
        processedVersionId: s.processed,
        availability: this.searchable(s.latest).removed ? 'removed' : s.availability,
        watchId: s.watch_id,
        detectedAt: s.detected_at,
        relPath: this.relPath(s),
      };
    });
    return {
      documents: docs.filter((d) => !d.deletedAt),
      trashedDocuments: docs.filter((d): d is TrashedDocument => !!d.deletedAt),
      sources,
      tasks: [],
      events: [],
      messages: [],
      settings: this.get('settings'),
      // The 2 s snapshot omits revision bodies; the history list needs only metadata.
      revisions: this.all<{ data: string }>('SELECT data FROM revisions').map((r) => ({
        ...(JSON.parse(r.data) as Revision),
        body: '',
      })),
      activities: this.all<{ data: string }>(
        'SELECT data FROM events ORDER BY cursor DESC LIMIT 100',
      ).map((r) => JSON.parse(r.data)),
      worker: {
        connected: true,
        pid: process.pid,
        cursor: this.one<{ cursor: number }>(
          'SELECT coalesce(max(cursor),0) AS cursor FROM events',
        )!.cursor,
        lastTick,
        nextTick,
        cli: this.cli(),
        model: providerProfiles[this.cli().provider].model,
        effort: providerProfiles[this.cli().provider].effort,
        skillHash: this.skillHash,
        callsToday:
          this.one<{ calls: number }>('SELECT calls FROM usage WHERE day=?', localDay())?.calls ??
          0,
        dailyLimit: DAILY_RUN_LIMIT,
        resetsAt: nextDay(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        watches: this.watches(),
        jobs: jobs.map((j) => ({
          id: j.id,
          sourceId: j.source_id,
          versionId: j.version_id,
          status: j.status,
          stage: j.stage,
          attempts: j.attempts,
          nextRun: j.next_run,
          error: j.error,
          createdAt: j.created_at,
          successorId: j.successor,
          result: this.jobResult(j.id),
        })),
        proposals: this.all<{ id: string; job_id: string; data: string; created_at: string }>(
          'SELECT * FROM proposals WHERE resolved_at IS NULL',
        ).map((r) => ({
          id: r.id,
          jobId: r.job_id,
          createdAt: r.created_at,
          proposal: JSON.parse(r.data).proposal,
        })),
      },
    };
  }
}
