/**
 * Most-recently-used command ordering for the palette: every executed
 * command id moves to the front of a capped, localStorage-persisted list.
 */

const storageKey = "knoter.workbench.command-mru";
const maxEntries = 50;

export function loadCommandMru(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, maxEntries);
  } catch {
    return [];
  }
}

export function touchCommandMru(commandId: string): string[] {
  const next = [
    commandId,
    ...loadCommandMru().filter((id) => id !== commandId),
  ].slice(0, maxEntries);
  persistCommandMru(next);
  return next;
}

/** Stable sort: recently used commands first, the rest keep input order. */
export function sortCommandsByMru<T extends { id: string }>(
  commands: T[],
  mru: string[],
): T[] {
  if (mru.length === 0) return commands;
  const rank = new Map(mru.map((id, index) => [id, index]));
  return [...commands].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function persistCommandMru(ids: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Persistence is best-effort.
  }
}
