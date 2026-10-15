// In-memory retrieval for worker tools. The demo corpus is small (hundreds of notes), and
// substring matching keeps two-character Korean terms and particle suffixes searchable,
// which a trigram index cannot do.
export const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

// Particles stripped from Korean words so "포인터는" also matches a page titled "포인터".
const PARTICLE =
  /(에서는|으로는|이라는|에게서|으로서|으로써|에서|에게|한테|까지|부터|보다|처럼|이나|이란|라는|으로|이다|은|는|이|가|을|를|의|에|로|와|과|도|만)$/;

export function terms(query: string, max = 12) {
  const out = new Set<string>();
  for (const word of normalize(query)
    .split(/[\s,.;:!?()[\]{}"'`/\\|<>]+/)
    .filter(Boolean)) {
    out.add(word);
    const stem = word.replace(PARTICLE, '');
    if (stem !== word && stem.length >= 2 && /[가-힣]$/.test(stem)) out.add(stem);
  }
  return [...out].slice(0, max);
}

export interface SearchField {
  /** Already normalized text. */
  text: string;
  weight: number;
}

/**
 * Each term counts once per field, scaled by its rarity across the items (IDF), so common words
 * that appear in every long page add little. Matching every term earns a small bonus.
 */
export function score(queryTerms: string[], fields: SearchField[], idf?: Map<string, number>) {
  let total = 0,
    matched = 0;
  for (const term of queryTerms) {
    let hit = false;
    const weight = idf?.get(term) ?? 1;
    for (const field of fields)
      if (field.text.includes(term)) {
        total += field.weight * weight;
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
  const indexed = items.map((item) => ({ item, fields: fields(item) }));
  // log((N + 1) / (df + 1)): a term in every item weighs almost nothing.
  const idf = new Map(
    queryTerms.map((t) => {
      const df = indexed.filter((i) => i.fields.some((f) => f.text.includes(t))).length;
      return [t, Math.log((indexed.length + 1) / (df + 1))];
    }),
  );
  return indexed
    .map(({ item, fields }) => ({ item, score: score(queryTerms, fields, idf) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
