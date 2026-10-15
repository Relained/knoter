import type { ReactNode } from 'react';
import { ChevronRight, History, Link2, MessageSquare, RotateCcw, Sparkles, X } from 'lucide-react';
import type { KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from './ui/button';
import { ChatPanel } from './ChatPanel';
import { SourceIcon, relativeTime } from './helpers';
import type { RunAction } from '../views/WikiView';

export type PanelTab = 'chat' | 'sources' | 'changes';
export function ContextPanel({
  snapshot,
  doc,
  client,
  run,
  onClose,
  onSource,
  onOpen,
  tab,
  setTab,
  resizeHandle,
}: {
  snapshot: WorkspaceSnapshot;
  doc?: WikiDocument;
  client: KnoterClient;
  run: RunAction;
  onClose: () => void;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
  tab: PanelTab;
  setTab: (tab: PanelTab) => void;
  resizeHandle?: ReactNode;
}) {
  const sources = snapshot.sources.filter((s) => !doc || doc.sourceIds.includes(s.id));
  const revisions = snapshot.revisions.filter((r) => !doc || r.documentId === doc.id);
  return (
    <aside className="context-panel">
      {resizeHandle}
      <div className="panel-heading">
        <span>
          <Sparkles size={16} /> A little perspective
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close side panel">
          <X size={16} />
        </Button>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Context panel">
        {(
          [
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'sources', label: 'Sources', icon: Link2 },
            { id: 'changes', label: 'Changes', icon: History },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>
      {/* Stays mounted on other tabs so a draft and its attachments survive. */}
      <div className={`chat-pane ${tab === 'chat' ? '' : 'chat-pane-hidden'}`}>
        <ChatPanel
          snapshot={snapshot}
          doc={doc}
          client={client}
          run={run}
          onSource={onSource}
          onOpen={onOpen}
        />
      </div>
      {tab === 'chat' ? null : tab === 'sources' ? (
        <div className="panel-scroll">
          <div className="panel-intro">
            <h3>Every idea starts somewhere.</h3>
            <p>{doc ? `The evidence connected to this note.` : 'The sources in your workspace.'}</p>
          </div>
          {sources.map((source) => (
            <button className="panel-source" onClick={() => onSource(source.id)} key={source.id}>
              <SourceIcon type={source.type} />
              <div>
                <strong>{source.title}</strong>
                <span>
                  {source.type.toUpperCase()} · {source.pages ? `${source.pages} pages` : 'Note'}
                </span>
              </div>
              <ChevronRight size={13} />
            </button>
          ))}
          {!sources.length && (
            <p className="panel-empty">No sources are connected to this note yet.</p>
          )}
        </div>
      ) : (
        <div className="panel-scroll">
          <div className="panel-intro">
            <h3>A note with a memory.</h3>
            <p>Follow how your knowledge has changed.</p>
          </div>
          <div className="revision-list">
            {revisions.map((revision) => (
              <div className="revision-item" key={revision.id}>
                <span className="revision-dot" />
                <div className="revision-meta">
                  <strong>{revision.author}</strong>
                  <span>{relativeTime(revision.createdAt)}</span>
                </div>
                <p>{revision.summary}</p>
                <div className="revision-bottom">
                  <span>Revision {revision.revision}</span>
                  {doc && revision.revision !== doc.revision && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void run(
                          () => client.restoreRevision(revision.id),
                          'Revision restored as a new version.',
                        )
                      }
                    >
                      <RotateCcw size={12} />
                      Restore
                    </Button>
                  )}
                  {doc && revision.revision === doc.revision && (
                    <span className="current-version">Current</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
