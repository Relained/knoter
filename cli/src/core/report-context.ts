import { KnError, ErrorCode } from "./errors";
import { getEffectiveTemplate } from "./template";
import { buildContinuityContext } from "./report-continuity";
import {
  type ReportContextInput,
  type ReportLayer,
} from "./report-context-types";
import { buildRetrievalGroups } from "./report-retrieval";
import { groupSignals, serializeNoteRow } from "./report-serialization";

export type { ReportLayer } from "./report-context-types";

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

export async function buildReportContextBundle(input: ReportContextInput): Promise<Record<string, unknown>> {
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
  // llm-wiki artifacts are date-exempt retrieval targets, so retrieval rows
  // must be able to resolve them even when they carry no doc_date.
  const wikiNotes = input.metaDb.listNotesByKind(
    input.vaultName,
    "artifact",
    "llm-wiki",
    MAX_NOTE_ROWS,
    0,
  );
  const notesById = new Map(
    [...allDateNotes, ...wikiNotes].map((note) => [note.id, note]),
  );

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

  const continuity = buildContinuityContext({
    metaDb: input.metaDb,
    vaultId: input.vaultName,
    targetDate: input.date,
    includeArtifacts: input.includeArtifacts,
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
    continuity,
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
