import { createHashRouter, Navigate } from 'react-router';
import type { KnoterClient } from '@knoter/contracts';
import { App } from '../App';
import { paths } from './paths';
import { CalendarRoute, GraphRoute, HomeRoute, TasksRoute, WikiRoute } from './WorkspaceRoutes';

export function createWorkspaceRouter(client: KnoterClient) {
  return createHashRouter([
    {
      element: <App client={client} />,
      children: [
        { index: true, Component: HomeRoute, handle: { view: 'home' } },
        { path: paths.wiki, Component: WikiRoute, handle: { view: 'wiki' } },
        { path: paths.document, Component: WikiRoute, handle: { view: 'wiki' } },
        // Sources open as a window over the home page; the address keeps old links working.
        { path: paths.sources, Component: HomeRoute, handle: { view: 'sources' } },
        { path: paths.tasks, Component: TasksRoute, handle: { view: 'tasks' } },
        { path: paths.calendar, Component: CalendarRoute, handle: { view: 'calendar' } },
        { path: paths.graph, Component: GraphRoute, handle: { view: 'graph' } },
        { path: '*', element: <Navigate to={paths.home} replace />, handle: { view: 'home' } },
      ],
    },
  ]);
}
