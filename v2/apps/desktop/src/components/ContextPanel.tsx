import type { ReactNode } from 'react';
import { GitPullRequestArrow, MessageSquare, X } from 'lucide-react';
import type { KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from './ui/button';
import { ChatPanel, type ChatRequest } from './ChatPanel';
import { ChangesPanel, reviewCount } from './ChangesPanel';
import type { RunAction } from '../views/WikiView';

export type PanelTab = 'chat' | 'changes';
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
  chatRequest,
  onChatRequestHandled,
  titles,
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
  chatRequest?: ChatRequest | null;
  onChatRequestHandled?: (id: number) => void;
  titles: Record<PanelTab, string>;
}) {
  const pending = reviewCount(snapshot);
  return (
    <aside className="context-panel" aria-label="Side panel">
      {resizeHandle}
      <div className="panel-heading">
        <div className="panel-tabs" role="tablist" aria-label="Side panel">
          {(
            [
              { id: 'chat', label: 'Chat', icon: MessageSquare, count: 0 },
              { id: 'changes', label: 'Changes', icon: GitPullRequestArrow, count: pending },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              title={titles[item.id]}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={13} />
              {item.label}
              {item.count > 0 && <span className="count-pill">{item.count}</span>}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close side panel">
          <X />
        </Button>
      </div>
      {/* Stays mounted on the Changes tab so a draft and its attachments survive. */}
      <div className={`chat-pane ${tab === 'chat' ? '' : 'chat-pane-hidden'}`}>
        <ChatPanel
          snapshot={snapshot}
          doc={doc}
          client={client}
          run={run}
          onSource={onSource}
          onOpen={onOpen}
          request={chatRequest}
          onRequestHandled={onChatRequestHandled}
        />
      </div>
      {tab === 'changes' && (
        <ChangesPanel
          snapshot={snapshot}
          doc={doc}
          client={client}
          run={run}
          onOpen={onOpen}
          onSource={onSource}
        />
      )}
    </aside>
  );
}
