import type { View } from '@knoter/contracts';

export interface WorkspaceRoute {
  view: View;
  documentId?: string;
  category?: string;
  focusId?: string;
}
export interface HistoryEntry {
  session: string;
  index: number;
}
const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function readRoute(): WorkspaceRoute {
  const [path, query = ''] = location.hash.slice(1).split('?');
  if (!path) return { view: 'wiki', documentId: 'rag' };
  const [view, id] = path.replace(/^\//, '').split('/');
  if (!['wiki', 'sources', 'tasks', 'calendar', 'graph'].includes(view)) return { view: 'wiki' };
  const params = new URLSearchParams(query);
  return {
    view: view as View,
    ...(view === 'wiki' && id ? { documentId: decode(id) } : {}),
    ...(view === 'wiki' && params.get('collection') ? { category: params.get('collection')! } : {}),
    ...(view === 'graph' && params.get('focus') ? { focusId: params.get('focus')! } : {}),
  };
}

export function routeHref(route: WorkspaceRoute): string {
  if (route.view === 'wiki' && route.documentId)
    return `#/wiki/${encodeURIComponent(route.documentId)}`;
  if (route.view === 'wiki' && route.category)
    return `#/wiki?collection=${encodeURIComponent(route.category)}`;
  if (route.view === 'graph' && route.focusId)
    return `#/graph?focus=${encodeURIComponent(route.focusId)}`;
  return `#/${route.view}`;
}

export const historyEntry = (): HistoryEntry | undefined => history.state?.knoterNavigation;
export function writeEntry(entry: HistoryEntry, route: WorkspaceRoute, replace = false) {
  history[replace ? 'replaceState' : 'pushState'](
    { ...history.state, knoterNavigation: entry },
    '',
    routeHref(route),
  );
}
// Session-only navigation metadata belongs to this browser adapter, not the workspace store.
export function readHistoryEnd(entry: HistoryEntry) {
  try {
    return Math.max(
      entry.index,
      Number(sessionStorage.getItem(`knoter.history.${entry.session}`)) || 0,
    );
  } catch {
    return entry.index;
  }
}
export function writeHistoryEnd(entry: HistoryEntry) {
  try {
    sessionStorage.setItem(`knoter.history.${entry.session}`, String(entry.index));
  } catch {
    /* Navigation also works without storage. */
  }
}
