import type { NoteRow, NoteSignalRow } from "../stores/meta-store";
import type { ReportSignalGroups } from "./report-context-types";

export function serializeNoteRow(note: NoteRow): Record<string, unknown> {
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

export function groupSignals(
  rows: NoteSignalRow[],
  notesById: Map<string, NoteRow>,
  includeArtifacts: boolean,
): ReportSignalGroups {
  const grouped: ReportSignalGroups = {
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
