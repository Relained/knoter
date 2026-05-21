// Re-export existing FTS5 utilities from meta-store
export { buildFtsQuery, normalizeBM25 } from "../stores/meta-store";

export interface SearchFilters {
  tags?: string[];
  after?: string;    // ISO date string
  before?: string;   // ISO date string
}

/**
 * Build a SQL WHERE clause fragment for tag filtering.
 * Uses EXISTS subquery against tags table.
 */
export function tagFilter(tags: string[]): { sql: string; params: string[] } {
  if (tags.length === 0) return { sql: "", params: [] };
  const placeholders = tags.map(() => "?").join(", ");
  return {
    sql: `n.id IN (SELECT note_id FROM tags WHERE tag IN (${placeholders}))`,
    params: tags,
  };
}

/**
 * Build a SQL WHERE clause fragment for date range filtering.
 * Filters on notes.created_at (ISO string comparison).
 */
export function dateFilter(after?: string, before?: string): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (after) {
    parts.push("n.created_at >= ?");
    params.push(after);
  }
  if (before) {
    parts.push("n.created_at <= ?");
    params.push(before);
  }
  return { sql: parts.join(" AND "), params };
}

/**
 * Combine multiple filter fragments with AND.
 */
export function combineFilters(...filters: { sql: string; params: string[] }[]): { sql: string; params: any[] } {
  const validFilters = filters.filter(f => f.sql.length > 0);
  if (validFilters.length === 0) return { sql: "", params: [] };
  return {
    sql: validFilters.map(f => `(${f.sql})`).join(" AND "),
    params: validFilters.flatMap(f => f.params),
  };
}
