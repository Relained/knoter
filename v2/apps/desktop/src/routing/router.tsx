import { createHashRouter, Navigate } from 'react-router';
import type { KnoterClient } from '@knoter/contracts';
import { App } from '../App';
import { paths } from './paths';
import { CalendarRoute, GraphRoute, SourcesRoute, TasksRoute, WikiRoute } from './WorkspaceRoutes';

export function createWorkspaceRouter(client: KnoterClient) {
  return createHashRouter([
    {
      element: <App client={client} />,
      children: [
        {
          index: true,
          element: <Navigate to={client.mode === 'connected' ? '/sources' : '/wiki/rag'} replace />,
          handle: { view: 'wiki' },
        },
        { path: paths.wiki, Component: WikiRoute, handle: { view: 'wiki' } },
        { path: paths.document, Component: WikiRoute, handle: { view: 'wiki' } },
        { path: paths.sources, Component: SourcesRoute, handle: { view: 'sources' } },
        { path: paths.tasks, Component: TasksRoute, handle: { view: 'tasks' } },
        { path: paths.calendar, Component: CalendarRoute, handle: { view: 'calendar' } },
        { path: paths.graph, Component: GraphRoute, handle: { view: 'graph' } },
        { path: '*', element: <Navigate to={paths.wiki} replace />, handle: { view: 'wiki' } },
      ],
    },
  ]);
}
