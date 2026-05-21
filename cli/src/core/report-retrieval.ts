import {
  buildFtsQuery,
  MetaDB,
  type FtsResult,
  normalizeBM25,
} from "../stores/meta-store";
import type {
  ReportLayer,
  ReportRetrievalInput,
  RetrievalGroup,
} from "./report-context-types";

const RETRIEVAL_QUERIES: Record<RetrievalGroup, string> = {
  date: "",
  tasks: "task todo 할 일 해야 할 것 완료 미완료",
  workouts: "운동 헬스 러닝 걷기 스쿼트 푸시업 횟수 세트 km kg",
  areas: "llm-wiki tasks todo daily-workout-graph knoter",
};

export function buildRetrievalGroups(input: ReportRetrievalInput): Record<string, unknown> {
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
    return includeArtifacts ? "AND n.layer = 'artifact'" : "AND 1 = 0";
  }
  if (layer === "all") {
    return includeArtifacts ? "" : "AND n.layer != 'artifact'";
  }
  if (includeArtifacts) {
    return `AND (n.layer = '${layer}' OR n.layer = 'artifact')`;
  }
  return `AND n.layer = '${layer}'`;
}
