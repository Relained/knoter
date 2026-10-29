import { generatePath } from 'react-router';
import type { View } from '@knoter/contracts';

export const paths = {
  home: '/',
  wiki: '/wiki',
  document: '/wiki/:documentId',
  sources: '/sources',
  tasks: '/tasks',
  calendar: '/calendar',
  graph: '/graph',
} as const;

export interface WorkspaceRoute {
  view: View;
  documentId?: string;
  category?: string;
  tag?: string;
  focusId?: string;
}

export function routePath(route: WorkspaceRoute): string {
  // generatePath encodes the id itself; encoding it here too left titles with spaces or
  // Korean text unresolvable after one decode.
  if (route.view === 'wiki' && route.documentId)
    return generatePath(paths.document, { documentId: route.documentId });
  const params = new URLSearchParams();
  if (route.view === 'wiki' && route.category) params.set('collection', route.category);
  if (route.view === 'wiki' && route.tag) params.set('tag', route.tag);
  if (route.view === 'graph' && route.focusId) params.set('focus', route.focusId);
  return paths[route.view] + (params.size ? `?${params}` : '');
}

// Markdown and copied URLs retain the existing hash-link format.
export const routeHref = (route: WorkspaceRoute) => `#${routePath(route)}`;
