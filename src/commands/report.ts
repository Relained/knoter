import { Command } from "commander";
import { resolveVaultRoot } from "../core/config";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";
import { error, render, success, type OutputFormat } from "../core/output";
import { getEffectiveTemplate, resolveVaultName } from "../core/template";
import {
  buildFtsQuery,
  MetaDB,
  type FtsResult,
  type DocumentLayer,
  type NoteRow,
  type NoteSignalRow,
  normalizeBM25,
} from "../stores/meta-store";

type ReportLayer = DocumentLayer | "all";

type RetrievalGroup = "date" | "tasks" | "workouts" | "areas";

const RETRIEVAL_QUERIES: Record<RetrievalGroup, string> = {
  date: "",
  tasks: "task todo 할 일 해야 할 것 완료 미완료",
  workouts: "운동 헬스 러닝 걷기 스쿼트 푸시업 횟수 세트 km kg",
  areas: "llm-wiki tasks todo daily-workout-graph knoter",
};

const MAX_NOTE_ROWS = 5000;

export function registerReportCommand(program: Command): void {
  const reportCmd = program.command("report").description("Build report context bundles");

  reportCmd
    .command("context")
    .description("Build JSON-ready context bundle for external report agents")
    .requiredOption("--date <YYYY-MM-DD>", "Target logical date")
    .option("--template <id>", "Template label to echo in output")
    .option("--layer <source|rewritten|artifact|all>", "Document layer filter for retrieval", "rewritten")
    .option("--top <n>", "FTS results per retrieval query", "20")
    .option("--include-artifacts", "Include artifact notes in dailyNotes and retrieval")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault as string | undefined;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = (await resolveVaultName(vaultOpt)) ?? "default";
        const date = parseDateOption(options.date);
        const documentLayer = parseLayerOption(options.layer);
        const top = parseTopOption(options.top);
        const includeArtifacts = !!options.includeArtifacts;
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

        const template = await getEffectiveTemplate(vaultOpt);
        const templateId = resolveTemplateId(options.template, template.metadata);

        const metaDb = new MetaDB(vaultRoot);
        try {
          const allDateNotes = metaDb.listNotesByDate(
            vaultName,
            date,
            undefined,
            MAX_NOTE_ROWS,
            0,
          );
          const notesById = new Map(allDateNotes.map((note) => [note.id, note]));

          const sourceInventory = metaDb
            .listNotesByDate(vaultName, date, "source", MAX_NOTE_ROWS, 0)
            .map(serializeNoteRow);
          const rewrittenSources = metaDb
            .listNotesByDate(vaultName, date, "rewritten", MAX_NOTE_ROWS, 0)
            .map(serializeNoteRow);
          const dailyNotes = allDateNotes
            .filter((note) => includeArtifacts || note.layer !== "artifact")
            .map(serializeNoteRow);

          const signalRows = metaDb.listSignalsByDate(vaultName, date);
          const signals = groupSignals(signalRows, notesById, includeArtifacts);

          const retrieval = buildRetrievalGroups({
            metaDb,
            vaultId: vaultName,
            date,
            top,
            layer: documentLayer,
            includeArtifacts,
            notesById,
          });

          render(
            success(
              "report context",
              {
                date,
                timezone,
                templateId,
                documentLayer,
                includeArtifacts,
                template,
                vaultStatus: metaDb.getVaultStatus(vaultName),
                sourceInventory,
                rewrittenSources,
                dailyNotes,
                signals,
                retrieval,
              },
              vaultName,
            ),
            format,
          );
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("report context", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

function parseDateOption(raw: string): string {
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

function parseLayerOption(raw: string): ReportLayer {
  if (raw === "source" || raw === "rewritten" || raw === "artifact" || raw === "all") {
    return raw;
  }
  throw new KnError(
    ErrorCode.CONFIG_INVALID,
    "Invalid --layer. Use one of: source, rewritten, artifact, all.",
  );
}

function parseTopOption(raw: string): number {
  const top = Number.parseInt(raw, 10);
  if (!Number.isFinite(top) || top <= 0) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Invalid --top. Use a positive integer.",
    );
  }
  return top;
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
