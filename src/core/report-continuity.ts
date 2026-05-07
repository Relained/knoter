import { MetaDB, type NoteRow, type NoteSignalRow } from "../stores/meta-store";
import { groupSignals, serializeNoteRow } from "./report-serialization";

const CONTINUITY_WINDOW_DAYS = 7;

export function buildContinuityContext(input: {
  metaDb: MetaDB;
  vaultId: string;
  targetDate: string;
  includeArtifacts: boolean;
}): Record<string, unknown> {
  const window = getContinuityWindow(input.targetDate, CONTINUITY_WINDOW_DAYS);
  const notes = listContinuityNotes(
    input.metaDb,
    input.vaultId,
    window.fromDate,
    window.toDate,
    input.includeArtifacts,
  );
  const signals = listContinuitySignals(
    input.metaDb,
    input.vaultId,
    window.fromDate,
    window.toDate,
    input.includeArtifacts,
  );
  const notesById = new Map(notes.map((note) => [note.id, note]));

  return {
    windowDays: CONTINUITY_WINDOW_DAYS,
    fromDate: window.fromDate,
    toDate: window.toDate,
    notes: notes.map(serializeNoteRow),
    signals: groupSignals(signals, notesById, input.includeArtifacts),
  };
}

function getContinuityWindow(
  targetDate: string,
  windowDays: number,
): { fromDate: string; toDate: string } {
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  const to = new Date(target);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(target);
  from.setUTCDate(from.getUTCDate() - windowDays);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

function listContinuityNotes(
  metaDb: MetaDB,
  vaultId: string,
  fromDate: string,
  toDate: string,
  includeArtifacts: boolean,
): NoteRow[] {
  const layerClause = includeArtifacts
    ? "AND n.layer IN ('rewritten', 'artifact')"
    : "AND n.layer = 'rewritten'";
  return metaDb.db
    .query(
      `SELECT n.* FROM notes n
       WHERE n.vault_id = ?
         AND n.doc_date >= ?
         AND n.doc_date <= ?
         ${layerClause}
       ORDER BY n.doc_date DESC, n.layer, n.file_path, n.id`,
    )
    .all(vaultId, fromDate, toDate) as NoteRow[];
}

function listContinuitySignals(
  metaDb: MetaDB,
  vaultId: string,
  fromDate: string,
  toDate: string,
  includeArtifacts: boolean,
): NoteSignalRow[] {
  const layerClause = includeArtifacts
    ? "AND n.layer IN ('rewritten', 'artifact')"
    : "AND n.layer = 'rewritten'";
  return metaDb.db
    .query(
      `SELECT s.* FROM note_signals s
       JOIN notes n ON s.note_id = n.id
       WHERE n.vault_id = ?
         AND n.doc_date >= ?
         AND n.doc_date <= ?
         ${layerClause}
       ORDER BY n.doc_date DESC, n.layer, n.file_path, s.id`,
    )
    .all(vaultId, fromDate, toDate) as NoteSignalRow[];
}
