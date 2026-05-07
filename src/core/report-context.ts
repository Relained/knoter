import { KnError, ErrorCode } from "./errors";
import { getEffectiveTemplate, type EffectiveTemplate } from "./template";
import {
  buildFtsQuery,
  MetaDB,
  type DocumentLayer,
  type FtsResult,
  type NoteRow,
  type NoteSignalRow,
  normalizeBM25,
} from "../stores/meta-store";

export type ReportLayer = DocumentLayer | "all";
type RetrievalGroup = "date" | "tasks" | "workouts" | "areas";

const RETRIEVAL_QUERIES: Record<RetrievalGroup, string> = {
  date: "",
  tasks: "task todo 할 일 해야 할 것 완료 미완료",
  workouts: "운동 헬스 러닝 걷기 스쿼트 푸시업 횟수 세트 km kg",
  areas: "llm-wiki tasks todo daily-workout-graph knoter",
};

const MAX_NOTE_ROWS = 5000;

export function parseDateOption(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Invalid --date. Expected YYYY-MM-DD format.",
    );
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Invalid --date value: ${raw}`,
    );
  }
  return raw;
}

export function parseLayerOption(raw: string): ReportLayer {
  if (raw === "source" || raw === "rewritten" || raw === "artifact" || raw === "all") {
    return raw;
  }
  throw new KnError(
    ErrorCode.CONFIG_INVALID,
    "Invalid --layer. Use one of: source, rewritten, artifact, all.",
  );
}

export function parseTopOption(raw: string): number {
  const top = Number.parseInt(raw, 10);
  if (!Number.isFinite(top) || top <= 0) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Invalid --top. Use a positive integer.",
    );
  }
  return top;
}

export async function buildReportContextBundle(input: {
  metaDb: MetaDB;
  vaultName: string;
  date: string;
  templateArg?: string;
  templateVaultOpt?: string;
  templateOverride?: EffectiveTemplate;
  layer: ReportLayer;
  top: number;
  includeArtifacts: boolean;
  timezone?: string;
}): Promise<Record<string, unknown>> {
  const timezone =
    input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const template = input.templateOverride || await getEffectiveTemplate(input.templateVaultOpt);
  const templateId = resolveTemplateId(input.templateArg, template.metadata);

  const allDateNotes = input.metaDb.listNotesByDate(
    input.vaultName,
    input.date,
    undefined,
    MAX_NOTE_ROWS,
    0,
  );
  const notesById = new Map(allDateNotes.map((note) => [note.id, note]));

  const sourceInventory = input.metaDb
    .listNotesByDate(input.vaultName, input.date, "source", MAX_NOTE_ROWS, 0)
    .map(serializeNoteRow);
  const rewrittenSources = input.metaDb
    .listNotesByDate(input.vaultName, input.date, "rewritten", MAX_NOTE_ROWS, 0)
    .map(serializeNoteRow);
  const dailyNotes = allDateNotes
    .filter((note) => input.includeArtifacts || note.layer !== "artifact")
    .map(serializeNoteRow);

  const signalRows = input.metaDb.listSignalsByDate(input.vaultName, input.date);
  const signals = groupSignals(signalRows, notesById, input.includeArtifacts);

  const retrieval = buildRetrievalGroups({
    metaDb: input.metaDb,
    vaultId: input.vaultName,
    date: input.date,
    top: input.top,
    layer: input.layer,
    includeArtifacts: input.includeArtifacts,
    notesById,
  });

  return {
    date: input.date,
    timezone,
    templateId,
    documentLayer: input.layer,
    includeArtifacts: input.includeArtifacts,
    template,
    vaultStatus: input.metaDb.getVaultStatus(input.vaultName),
    sourceInventory,
    rewrittenSources,
    dailyNotes,
    signals,
    retrieval,
  };
}

function resolveTemplateId(
  explicitId: string | undefined,
  metadata?: Record<string, unknown>,
): string {
  if (explicitId && explicitId.trim()) {
    return explicitId.trim();
  }
  const keys = ["templateId", "template_id", "id", "label"] as const;
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "daily-report";
}

function serializeNoteRow(note: NoteRow): Record<string, unknown> {
  return {
    id: note.id,
    filePath: note.file_path,
    title: note.title,
    docDate: note.doc_date,
    layer: note.layer,
    kind: note.kind,
    language: note.language,
    vectorSyncStatus: note.vector_sync_status,
    sourceNoteId: note.source_note_id,
    sourcePath: note.source_path,
    rewriteAgent: note.rewrite_agent,
    rewritePromptHash: note.rewrite_prompt_hash,
    artifactTemplateId: note.artifact_template_id,
    frontmatter: parseFrontmatter(note.frontmatter),
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    indexedAt: note.indexed_at,
  };
}

function parseFrontmatter(frontmatterRaw: string | null): unknown {
  if (!frontmatterRaw) return null;
  try {
    return JSON.parse(frontmatterRaw);
  } catch {
    return frontmatterRaw;
  }
}

function parseSignalValue(valueJson: string): unknown {
  try {
    return JSON.parse(valueJson);
  } catch {
    return valueJson;
  }
}

function groupSignals(
  rows: NoteSignalRow[],
  notesById: Map<string, NoteRow>,
  includeArtifacts: boolean,
): {
  tasks: unknown[];
  workouts: unknown[];
  daily: unknown[];
  areas: unknown[];
  metrics: unknown[];
  all: unknown[];
} {
  const grouped: {
    tasks: unknown[];
    workouts: unknown[];
    daily: unknown[];
    areas: unknown[];
    metrics: unknown[];
    all: unknown[];
  } = {
    tasks: [],
    workouts: [],
    daily: [],
    areas: [],
    metrics: [],
    all: [],
  };

  for (const row of rows) {
    const note = notesById.get(row.note_id);
    if (!note) continue;
    if (!includeArtifacts && note.layer === "artifact") continue;

    const parsed = {
      id: row.id,
      noteId: row.note_id,
      chunkId: row.chunk_id,
      kind: row.kind,
      key: row.key,
      value: parseSignalValue(row.value_json),
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      note: {
        filePath: note.file_path,
        title: note.title,
        docDate: note.doc_date,
        layer: note.layer,
        kind: note.kind,
        language: note.language,
      },
    };

    grouped.all.push(parsed);
    if (row.kind === "task") grouped.tasks.push(parsed);
    if (row.kind === "workout") grouped.workouts.push(parsed);
    if (row.kind === "daily") grouped.daily.push(parsed);
    if (row.kind === "area") grouped.areas.push(parsed);
    if (row.kind === "metric") grouped.metrics.push(parsed);
  }

  return grouped;
}

function buildRetrievalGroups(input: {
  metaDb: MetaDB;
  vaultId: string;
  date: string;
  top: number;
  layer: ReportLayer;
  includeArtifacts: boolean;
  notesById: Map<string, NoteRow>;
}): Record<string, unknown> {
  const candidateLimit = Math.max(input.top * 10, input.top);
  const groups: Record<string, unknown> = {};

  for (const groupName of Object.keys(RETRIEVAL_QUERIES) as RetrievalGroup[]) {
    const query = groupName === "date" ? input.date : RETRIEVAL_QUERIES[groupName];
    const ftsRows = searchFtsWithTokenFallback(
      input.metaDb,
      query,
      candidateLimit,
      input.vaultId,
      input.date,
      input.layer,
      input.includeArtifacts,
    );

    const filtered = ftsRows
      .map((row) => {
        const note = input.notesById.get(row.noteId);
        if (!note) return null;
        return {
          chunkId: row.chunkId,
          noteId: row.noteId,
          content: row.content,
          score: row.score,
          note: {
            filePath: note.file_path,
            title: note.title,
            docDate: note.doc_date,
            layer: note.layer,
            kind: note.kind,
            language: note.language,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, input.top);

    groups[groupName] = {
      query,
      top: input.top,
      results: filtered,
    };
  }

  return {
    backend: "fts",
    groups,
  };
}

function searchFtsWithTokenFallback(
  metaDb: MetaDB,
  query: string,
  limit: number,
  vaultId: string,
  docDate: string,
  layer: ReportLayer,
  includeArtifacts: boolean,
): FtsResult[] {
  const primary = searchReportScopedFts(metaDb, query, limit, vaultId, docDate, layer, includeArtifacts);
  if (primary.length > 0) {
    return primary;
  }

  const tokens = query.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length <= 1) {
    return primary;
  }

  const merged = new Map<string, FtsResult>();
  for (const token of tokens) {
    const rows = searchReportScopedFts(metaDb, token, limit, vaultId, docDate, layer, includeArtifacts);
    for (const row of rows) {
      const prev = merged.get(row.chunkId);
      if (!prev || row.score > prev.score) {
        merged.set(row.chunkId, row);
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
    .slice(0, limit);
}

function searchReportScopedFts(
  metaDb: MetaDB,
  query: string,
  limit: number,
  vaultId: string,
  docDate: string,
  layer: ReportLayer,
  includeArtifacts: boolean,
): FtsResult[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const layerClause = buildReportLayerClause(layer, includeArtifacts);
  const rows = metaDb.db
    .query(
      `SELECT c.id AS chunkId, c.note_id AS noteId, c.content, f.rank
       FROM chunks_fts f
       JOIN chunks c ON c.rowid = f.rowid
       JOIN notes n ON c.note_id = n.id
       WHERE chunks_fts MATCH ?
         AND n.vault_id = ?
         AND n.doc_date = ?
         AND n.vector_sync_status = 'synced'
         ${layerClause}
       ORDER BY f.rank
       LIMIT ?`,
    )
    .all(ftsQuery, vaultId, docDate, limit) as Array<{
    chunkId: string;
    noteId: string;
    content: string;
    rank: number;
  }>;

  return rows.map((row) => ({
    ...row,
    score: normalizeBM25(row.rank),
  }));
}

function buildReportLayerClause(layer: ReportLayer, includeArtifacts: boolean): string {
  if (layer === "artifact") {
    return "AND n.layer = 'artifact'";
  }
  if (layer === "all") {
    return includeArtifacts ? "" : "AND n.layer != 'artifact'";
  }
  if (includeArtifacts) {
    return `AND (n.layer = '${layer}' OR n.layer = 'artifact')`;
  }
  return `AND n.layer = '${layer}'`;
}
