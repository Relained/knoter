import type { NavigationType } from 'react-router';

export interface NavigationJournal {
  keys: string[];
  index: number;
}
const storageKey = 'knoter.router-history.v1';

export function readNavigationHistory(key: string): NavigationJournal {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (
      Array.isArray(saved?.keys) &&
      saved.keys.every((value: unknown) => typeof value === 'string') &&
      new Set(saved.keys).size === saved.keys.length
    ) {
      const index = saved.keys.indexOf(key);
      if (index >= 0) return { keys: saved.keys, index };
    }
  } catch {
    // Missing/unavailable session storage starts a fresh app navigation boundary.
  }
  return { keys: [key], index: 0 };
}

export function recordNavigation(
  previous: NavigationJournal,
  key: string,
  action: NavigationType,
): NavigationJournal {
  if (previous.keys[previous.index] === key) return previous;
  if (action === 'PUSH')
    return {
      keys: [...previous.keys.slice(0, previous.index + 1), key],
      index: previous.index + 1,
    };
  if (action === 'REPLACE') {
    const keys = [...previous.keys];
    keys[previous.index] = key;
    return { keys, index: previous.index };
  }
  const index = previous.keys.indexOf(key);
  // Do not let toolbar arrows traverse unknown/external or pre-router entries.
  return index >= 0 ? { ...previous, index } : { keys: [key], index: 0 };
}

export function saveNavigationHistory(journal: NavigationJournal) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(journal));
  } catch {
    // Router navigation still works; toolbar metadata simply will not survive reload.
  }
}
