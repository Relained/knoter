/**
 * Finds the notes a wiki revolves around and groups every other note under the nearest
 * one. Centrality is PageRank over the undirected link graph, so a note linked from
 * well-connected notes outranks one with many links from leaves. Hubs are chosen
 * greedily and never next to each other, so the clusters they anchor are spread out.
 */
export interface GraphStructure {
  degree: Map<string, number>;
  adjacency: Map<string, string[]>;
  /** PageRank scaled so the most central note is 1. */
  rank: Map<string, number>;
  /** Most central first; the first sits in the middle of the layout. */
  hubs: string[];
  /** The hub each note radiates from, or null when no hub reaches it. */
  hubOf: Map<string, string | null>;
  /** Links between a note and its hub. */
  hops: Map<string, number>;
}

export function analyzeGraph(
  ids: string[],
  edges: { source: string; target: string }[],
  focusId?: string,
): GraphStructure {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of edges) {
    if (e.source === e.target) continue;
    const a = adjacency.get(e.source);
    const b = adjacency.get(e.target);
    if (!a || !b || a.includes(e.target)) continue;
    a.push(e.target);
    b.push(e.source);
  }
  const degree = new Map(ids.map((id) => [id, adjacency.get(id)!.length]));

  // Power iteration; notes without links spread their share evenly.
  const n = Math.max(1, ids.length);
  let score = new Map(ids.map((id) => [id, 1 / n]));
  for (let iteration = 0; iteration < 40; iteration++) {
    let dangling = 0;
    for (const id of ids) if (!degree.get(id)) dangling += score.get(id)!;
    const next = new Map(ids.map((id) => [id, (0.15 + 0.85 * dangling) / n]));
    for (const id of ids) {
      const d = degree.get(id)!;
      if (!d) continue;
      const share = (0.85 * score.get(id)!) / d;
      for (const other of adjacency.get(id)!) next.set(other, next.get(other)! + share);
    }
    score = next;
  }
  const top = Math.max(...score.values(), Number.EPSILON);
  const rank = new Map(ids.map((id) => [id, score.get(id)! / top]));

  const meanDegree = ids.reduce((sum, id) => sum + degree.get(id)!, 0) / n;
  const minDegree = Math.max(2, Math.ceil(meanDegree * 1.5));
  const limit = Math.max(1, Math.min(14, Math.round(Math.sqrt(ids.length) / 2)));
  const hubs: string[] = [];
  if (focusId && adjacency.has(focusId)) hubs.push(focusId);
  const ranked = [...ids].sort((a, b) => rank.get(b)! - rank.get(a)! || (a < b ? -1 : 1));
  for (const id of ranked) {
    if (hubs.length >= limit) break;
    if (hubs.includes(id) || degree.get(id)! < minDegree) continue;
    if (adjacency.get(id)!.some((other) => hubs.includes(other))) continue;
    hubs.push(id);
  }
  // A small or sparse wiki still gets its best-connected note as the core.
  if (!hubs.length && ranked.length && degree.get(ranked[0])!) hubs.push(ranked[0]);

  // Breadth-first from every hub at once: each note joins the hub that reaches it first.
  const hubOf = new Map<string, string | null>(ids.map((id) => [id, null]));
  const hops = new Map<string, number>(ids.map((id) => [id, Infinity]));
  let frontier = [...hubs];
  for (const hub of hubs) {
    hubOf.set(hub, hub);
    hops.set(hub, 0);
  }
  for (let level = 1; frontier.length; level++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const other of adjacency.get(id)!)
        if (hops.get(other) === Infinity) {
          hops.set(other, level);
          hubOf.set(other, hubOf.get(id)!);
          next.push(other);
        }
    frontier = next;
  }
  return { degree, adjacency, rank, hubs, hubOf, hops };
}

/** Where a note sits in the hub-centered layout. */
export type Role = 'core' | 'hub' | 'member' | 'loose' | 'orphan';
export function roleOf(structure: GraphStructure, id: string): Role {
  if (id === structure.hubs[0]) return 'core';
  if (structure.hubs.includes(id)) return 'hub';
  if (!structure.degree.get(id)) return 'orphan';
  return structure.hubOf.get(id) ? 'member' : 'loose';
}
/** Central notes are drawn larger, the core most of all. */
export const roleScale = (role: Role) => (role === 'core' ? 1.7 : role === 'hub' ? 1.35 : 1);

/** A repeatable pseudo-random stream per note, so the layout is the same each visit. */
export function seededRandom(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
