// In-memory retrieval for worker tools. The demo corpus is small (hundreds of notes), and
// substring matching keeps two-character Korean terms and particle suffixes searchable,
// which a trigram index cannot do.
export const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

export function terms(query: string) {
  return [
    ...new Set(
      normalize(query)
        .split(/[\s,.;:!?()[\]{}"'`/\\|<>]+/)
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

export interface SearchField {
  /** Already normalized text. */
  text: string;
  weight: number;
}

/** Each term counts once per field; matching every term earns a small bonus. */
export function score(queryTerms: string[], fields: SearchField[]) {
  let total = 0,
    matched = 0;
  for (const term of queryTerms) {
    let hit = false;
    for (const field of fields)
      if (field.text.includes(term)) {
        total += field.weight;
        hit = true;
      }
    if (hit) matched++;
  }
  return queryTerms.length > 1 && matched === queryTerms.length ? total + 2 : total;
}

/** A short excerpt around the first matching term, or the start of the text. */
export function snippet(text: string, queryTerms: string[], radius = 90) {
  const lower = normalize(text);
  const at = queryTerms
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (at ?? 0) - radius);
  const excerpt = text
    .slice(start, start + radius * 2)
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + radius * 2 < text.length ? '…' : ''}`;
}

export function rank<T>(
  items: T[],
  queryTerms: string[],
  fields: (item: T) => SearchField[],
  limit: number,
) {
  return items
    .map((item) => ({ item, score: score(queryTerms, fields(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
