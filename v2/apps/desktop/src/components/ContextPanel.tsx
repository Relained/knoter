import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  History,
  Link2,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from './ui/button';
import { Markdown } from './Markdown';
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
  const [question, setQuestion] = useState('');
  const [scoped, setScoped] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const sending = snapshot.messages.some((m) => m.status === 'streaming');
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot.messages]);
  const send = async (value = question) => {
    if (!value.trim() || sending) return;
    const next = new AbortController();
    controller.current = next;
    setQuestion('');
    await run(() =>
      client.sendMessage({
        question: value.trim(),
        documentId: scoped ? doc?.id : undefined,
        signal: next.signal,
      }),
    );
    controller.current = null;
  };
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
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
      {tab === 'chat' && client.mode === 'connected' ? (
        <div className="empty-state">
          <MessageSquare />
          <h3>Chat is not connected</h3>
          <p>
            This demo generates the wiki from your Markdown sources. Use Sources and Changes to
            inspect its evidence.
          </p>
        </div>
      ) : tab === 'chat' ? (
        <>
          <div className="chat-toolbar">
            <span className="demo-caption">
              <i /> Demo assistant
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              title="New conversation"
              disabled={sending || !snapshot.messages.length}
              onClick={() => void run(() => client.clearMessages())}
            >
              <Plus size={16} />
            </Button>
          </div>
          <div className="chat-scroll" ref={scroll}>
            {snapshot.messages.length ? (
              <div className="chat-messages">
                {snapshot.messages.map((message) => (
                  <div className={`chat-message message-${message.role}`} key={message.id}>
                    {message.role === 'assistant' && (
                      <div className="message-author">
                        <span className="mini-logo">
                          <Sparkles size={13} />
                        </span>
                        <strong>knoter</strong>
                        <span>Demo</span>
                      </div>
                    )}
                    <Markdown
                      compact
                      onSource={onSource}
                      onOpen={onOpen}
                      documents={snapshot.documents}
                    >
                      {message.content || 'Finding a few connections…'}
                    </Markdown>
                    {message.role === 'assistant' &&
                      message.status !== 'streaming' &&
                      message.documentIds.length > 0 && (
                        <div className="answer-links">
                          {message.documentIds.map((id, index) => (
                            <button key={id} onClick={() => onOpen(id)}>
                              <span>{index + 1}</span>
                              {snapshot.documents.find((d) => d.id === id)?.title}
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                    {message.status === 'stopped' && (
                      <span className="stopped-label">Response stopped</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="chat-welcome">
                <div className="assistant-mark">
                  <Sparkles size={26} />
                </div>
                <span className="eyebrow">THINK A LITTLE FURTHER</span>
                <h2>
                  Your notes have
                  <br />
                  more to say.
                </h2>
                <p>
                  Explore an idea, find a connection,
                  <br />
                  or follow a question somewhere new.
                </p>
                <div className="chat-prompts">
                  {[
                    'Give me the big picture',
                    'How do these ideas connect?',
                    'What should I explore next?',
                  ].map((prompt, i) => (
                    <button key={prompt} onClick={() => void send(prompt)}>
                      <span>
                        {i === 0 ? (
                          <BookOpen size={14} />
                        ) : i === 1 ? (
                          <Link2 size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {prompt}
                      </span>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
                <div className="chat-context-note">
                  <Link2 size={12} /> Grounded in your workspace
                </div>
              </div>
            )}
          </div>
          <div className="chat-composer-area">
            {doc && (
              <button
                className={`context-chip ${scoped ? '' : 'unscoped'}`}
                onClick={() => setScoped(!scoped)}
                title="Toggle current-note context"
              >
                <BookOpen size={12} />
                <span>{scoped ? doc.title : 'Search the whole workspace'}</span>
                {scoped ? <X size={11} /> : <Plus size={11} />}
              </button>
            )}
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                aria-label="Ask your knowledge"
                placeholder="Ask your knowledge…"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  <Sparkles size={12} />
                  {sending ? 'Thinking with your notes…' : 'Workspace context'}
                </span>
                {sending ? (
                  <Button
                    variant="soft"
                    size="icon"
                    type="button"
                    aria-label="Stop response"
                    onClick={() => controller.current?.abort()}
                  >
                    <Square size={12} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    type="submit"
                    aria-label="Send message"
                    disabled={!question.trim()}
                  >
                    <ArrowUp size={16} />
                  </Button>
                )}
              </div>
            </form>
            <p className="chat-disclaimer">Simulated answers. No model connected.</p>
          </div>
        </>
      ) : tab === 'sources' ? (
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
