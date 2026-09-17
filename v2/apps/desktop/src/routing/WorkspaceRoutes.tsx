import { BookOpen, Undo2 } from 'lucide-react';
import { useMatches, useOutletContext, useParams, useSearchParams } from 'react-router';
import type { KnoterClient, View, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { WikiDocumentView, WikiLibrary, type RunAction } from '../views/WikiView';
import { SourcesView } from '../views/SourcesView';
import { TasksView } from '../views/TasksView';
import { CalendarView } from '../views/CalendarView';
import { GraphView } from '../views/GraphView';
import type { WikiLinks } from '../wiki/links';
import type { WorkspaceRoute } from './paths';

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
  onNew: () => void;
  onTrash: () => void;
  onImport: () => void;
  onRestore: (id: string) => Promise<void>;
  documentPending: boolean;
}

export function useWorkspaceRoute(): WorkspaceRoute {
  const match = useMatches().at(-1)!;
  const { view } = match.handle as { view: View };
  const [params] = useSearchParams();
  return {
    view,
    documentId: view === 'wiki' ? match.params.documentId : undefined,
    category: view === 'wiki' ? params.get('collection') || undefined : undefined,
    focusId: view === 'graph' ? params.get('focus') || undefined : undefined,
  };
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

export function SourcesRoute() {
  const { snapshot, client, run, onImport, onSource, onOpen } =
    useOutletContext<WorkspaceContext>();
  return (
    <SourcesView
      snapshot={snapshot}
      client={client}
      run={run}
      onImport={onImport}
      onSource={onSource}
      onOpen={onOpen}
    />
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
  const focusId = params.get('focus') || undefined;
  return (
    <GraphView
      key={focusId || 'all'}
      documents={context.snapshot.documents}
      links={context.links}
      focusId={focusId}
      onOpen={context.onOpen}
      onGlobal={() => context.onView('graph')}
    />
  );
}
