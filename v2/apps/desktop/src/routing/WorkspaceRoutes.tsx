import { BookOpen, Undo2 } from 'lucide-react';
import { Navigate, useMatches, useOutletContext, useParams, useSearchParams } from 'react-router';
import type { KnoterClient, View, WorkspaceSnapshot } from '@knoter/contracts';
import type { GraphForces } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { WikiDocumentView, WikiLibrary, type RunAction } from '../views/WikiView';
import { TasksView } from '../views/TasksView';
import { CalendarView } from '../views/CalendarView';
import { GraphView } from '../views/GraphView';
import { HomeView } from '../views/HomeView';
import type { WikiLinks } from '../wiki/links';
import { paths, type WorkspaceRoute } from './paths';

export interface WorkspaceContext {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  links: WikiLinks;
  editing: boolean;
  onEditing: (value: boolean) => void;
  onDirtyCheck: (check: (() => boolean) | null) => void;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
  onGraph: (id: string) => void;
  onView: (view: View) => void;
  onAsk: () => void;
  onRewrite: (id: string) => void;
  onNew: () => void;
  onTrash: () => void;
  onImport: () => void;
  onRestore: (id: string) => Promise<void>;
  onForces: (forces: GraphForces) => void;
  documentPending: boolean;
  rewriteBinding: string;
}

export function useWorkspaceRoute(): WorkspaceRoute {
  const match = useMatches().at(-1)!;
  const { view } = match.handle as { view: View };
  const [params] = useSearchParams();
  return {
    view,
    documentId: view === 'wiki' ? match.params.documentId : undefined,
    category: view === 'wiki' ? params.get('collection') || undefined : undefined,
    tag: view === 'wiki' ? params.get('tag') || undefined : undefined,
    focusId: view === 'graph' ? params.get('focus') || undefined : undefined,
  };
}

export function HomeRoute() {
  const context = useOutletContext<WorkspaceContext>();
  return (
    <HomeView
      documents={context.snapshot.documents}
      links={context.links}
      forces={context.snapshot.settings.graph}
      onForces={context.onForces}
      onOpen={context.onOpen}
      onNew={context.onNew}
      onLibrary={() => context.onView('wiki')}
    />
  );
}

export function WikiRoute() {
  const context = useOutletContext<WorkspaceContext>();
  const { documentId } = useParams();
  const [params] = useSearchParams();
  const { snapshot, onOpen, onSource, onGraph, onAsk, onEditing, onDirtyCheck } = context;
  if (!documentId)
    return (
      <WikiLibrary
        snapshot={snapshot}
        category={params.get('collection')}
        tag={params.get('tag')}
        onOpen={onOpen}
        onNew={context.onNew}
        onTrash={context.onTrash}
      />
    );
  const doc = snapshot.documents.find((item) => item.id === documentId);
  if (doc)
    return (
      <WikiDocumentView
        key={doc.id}
        doc={doc}
        snapshot={snapshot}
        client={context.client}
        run={context.run}
        onSource={onSource}
        onOpen={onOpen}
        links={context.links}
        onGraph={() => onGraph(doc.id)}
        onAsk={onAsk}
        onRewrite={() => context.onRewrite(doc.id)}
        rewriteBinding={context.rewriteBinding}
        editing={context.editing}
        onEditing={onEditing}
        onDirtyCheck={onDirtyCheck}
      />
    );
  const trashed = snapshot.trashedDocuments.find((item) => item.id === documentId);
  return (
    <div className="empty-state">
      <BookOpen />
      <h2>{trashed ? 'This note is in Trash' : 'Note not found'}</h2>
      <p>{trashed ? trashed.title : 'This link does not match a document in this workspace.'}</p>
      {trashed && (
        <Button
          variant="outline"
          disabled={context.documentPending}
          onClick={() => void context.onRestore(trashed.id)}
        >
          <Undo2 /> Restore note
        </Button>
      )}
      <Button onClick={() => context.onView('wiki')}>Browse the wiki</Button>
    </div>
  );
}

export function TasksRoute() {
  const { snapshot, client, run, onOpen } = useOutletContext<WorkspaceContext>();
  if (client.mode === 'connected')
    return (
      <div className="empty-state">
        <h2>Tasks are not connected</h2>
        <p>The native demo covers Markdown sources and wiki generation.</p>
      </div>
    );
  return <TasksView snapshot={snapshot} client={client} run={run} onOpen={onOpen} />;
}

export function CalendarRoute() {
  const { snapshot, client, run } = useOutletContext<WorkspaceContext>();
  if (client.mode === 'connected')
    return (
      <div className="empty-state">
        <h2>Calendar is not connected</h2>
        <p>The native demo covers Markdown sources and wiki generation.</p>
      </div>
    );
  return <CalendarView snapshot={snapshot} client={client} run={run} />;
}

export function GraphRoute() {
  const context = useOutletContext<WorkspaceContext>();
  const [params] = useSearchParams();
  const focus = context.snapshot.documents.find((d) => d.id === params.get('focus'));
  // The whole-wiki graph lives on the home page.
  if (!focus) return <Navigate to={paths.home} replace />;
  return (
    <GraphView
      key={focus.id}
      documents={context.snapshot.documents}
      links={context.links}
      focus={focus}
      forces={context.snapshot.settings.graph}
      onForces={context.onForces}
      onOpen={context.onOpen}
      onGlobal={() => context.onView('home')}
    />
  );
}
