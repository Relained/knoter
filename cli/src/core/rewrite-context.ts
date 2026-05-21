import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { KnError, ErrorCode } from "./errors";
import { MetaDB, type NoteRow } from "../stores/meta-store";

const DEFAULT_MAX_CHARS = 20_000;
const MAX_ROWS = 5_000;

export function parseRewriteDateOption(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Invalid date. Expected YYYY-MM-DD format.",
    );
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new KnError(ErrorCode.CONFIG_INVALID, `Invalid date value: ${raw}`);
  }
  return raw;
}

export function parseRewriteMaxCharsOption(raw: number | undefined): number {
  if (raw == null) return DEFAULT_MAX_CHARS;
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "Invalid maxChars. Use a positive number.");
  }
  return Math.floor(raw);
}

export async function buildRewriteContextBundle(input: {
  metaDb: MetaDB;
  vaultRoot: string;
  vaultName: string;
  date?: string;
  source?: string;
  maxChars?: number;
  includeContent?: boolean;
}): Promise<Record<string, unknown>> {
  const includeContent = input.includeContent ?? true;
  const maxChars = parseRewriteMaxCharsOption(input.maxChars);
  const normalizedDate = input.date ? parseRewriteDateOption(input.date) : undefined;

  const selectedNotes = resolveSourceNotes(input.metaDb, input.vaultName, normalizedDate, input.source);
  const sources = [];
  for (const note of selectedNotes) {
    sources.push(await serializeSourceNote(note, input.vaultRoot, includeContent, maxChars));
  }

  return {
    ...(normalizedDate ? { date: normalizedDate } : {}),
    sources,
    instructions: [
      "Preserve source traceability to each source note id/path.",
      "Produce rewritten-source markdown with frontmatter layer: rewritten.",
      "Keep explicit kind only when justified by source evidence.",
      "Normalize headings, task markers, workout metrics, and source references.",
      "Do not invent facts not present in source evidence.",
    ],
    targetLayer: "rewritten",
    sourcePolicy: "Source content is evidence only and is not indexed by knoter.",
  };
}

function resolveSourceNotes(
  metaDb: MetaDB,
  vaultName: string,
  date: string | undefined,
  source: string | undefined,
): NoteRow[] {
  if (source && source.trim()) {
    const note = resolveNote(metaDb, vaultName, source.trim());
    if (!note || note.layer !== "source") return [];
    return [note];
  }

  if (date) {
    return metaDb.listNotesByDate(vaultName, date, "source", MAX_ROWS, 0);
  }

  return metaDb.listNotesByLayer(vaultName, "source", MAX_ROWS, 0);
}

async function serializeSourceNote(
  note: NoteRow,
  vaultRoot: string,
  includeContent: boolean,
  maxChars: number,
): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    id: note.id,
    filePath: note.file_path,
    title: note.title,
    docDate: note.doc_date,
    kind: note.kind,
    language: note.language,
    frontmatter: parseFrontmatter(note.frontmatter),
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    indexedAt: note.indexed_at,
  };

  if (!includeContent) return base;

  try {
    const filePath = resolve(vaultRoot, note.file_path);
    const rel = relative(resolve(vaultRoot), filePath);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Source path is outside vault: ${note.file_path}`);
    }
    const content = await Bun.file(filePath).text();
    const truncated = content.length > maxChars;
    return {
      ...base,
      content: truncated ? content.slice(0, maxChars) : content,
      contentTruncated: truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      contentError: message,
      contentTruncated: false,
    };
  }
}

function parseFrontmatter(frontmatterRaw: string | null): unknown {
  if (!frontmatterRaw) return null;
  try {
    return JSON.parse(frontmatterRaw);
  } catch {
    return frontmatterRaw;
  }
}

function resolveNote(metaDb: MetaDB, vaultName: string, target: string): NoteRow | null {
  let note = metaDb.getNoteByPath(vaultName, target);
  if (!note) {
    note = metaDb.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
      .get(vaultName, `%/${target}`) as NoteRow | null;
  }
  if (!note) {
    note = metaDb.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
      .get(vaultName, `%${target}%`) as NoteRow | null;
  }
  if (!note) {
    note = metaDb.getNote(target);
  }
  return note;
}
