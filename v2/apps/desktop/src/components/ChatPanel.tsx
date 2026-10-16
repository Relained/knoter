import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AtSign,
  BookOpen,
  Check,
  ChevronDown,
  FilePlus2,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  PenLine,
  Plus,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { ChatMessage, KnoterClient, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import type { ChatChoice } from '@knoter/contracts/native';
import { Button } from './ui/button';
import { Markdown } from './Markdown';
import type { RunAction } from '../views/WikiView';

const providerLabels = { claude: 'Claude Code', codex: 'Codex' } as const;
const effortLabels: Record<string, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 256 * 1024;
const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
// `|` and brackets would end the wiki-link label early.
const mentionLabel = (title: string) => title.replace(/[|[\]]/g, ' ').trim();

interface Attachment {
  filename: string;
  text: string;
  size: number;
}
/** A message sent on the user's behalf, such as a rewrite request from a note. */
export interface ChatRequest {
  id: number;
  text: string;
  documentIds: string[];
  supplementRatio?: number;
}
interface MentionQuery {
  start: number;
  end: number;
  query: string;
  index: number;
}

/** Reads a dropped or chosen file as strict UTF-8 text within the chat limits. */
async function readAttachment(file: File): Promise<Attachment> {
  if (!/\.(md|markdown|txt)$/i.test(file.name))
    throw new Error(`${file.name}: attach Markdown (.md) or text (.txt) files.`);
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} exceeds the 256 KB limit.`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} is not UTF-8 text.`);
  }
  if (text.includes('\0')) throw new Error(`${file.name} is not a text file.`);
  return { filename: file.name, text, size: file.size };
}

export function ChatPanel({
  snapshot,
  doc,
  client,
  run,
  onSource,
  onOpen,
  request,
  onRequestHandled,
}: {
  snapshot: WorkspaceSnapshot;
  doc?: WikiDocument;
  client: KnoterClient;
  run: RunAction;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
  request?: ChatRequest | null;
  onRequestHandled?: (id: number) => void;
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ id: string; title: string }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [scoped, setScoped] = useState(true);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<ChatChoice | null>(null);
  const controller = useRef<AbortController | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  // A programmatic value change moves the caret to the end; restore it after render.
  const caret = useRef<number | null>(null);
  const chat = snapshot.chat;
  const simulated = client.mode === 'demo' || chat?.simulated;
  const models = chat?.models ?? [];
  const choice =
    picked && models.some((m) => m.provider === picked.provider && m.model === picked.model)
      ? picked
      : (chat?.selected ?? null);
  const model = models.find((m) => m.provider === choice?.provider && m.model === choice?.model);
  const streaming = snapshot.messages.some((m) => m.status === 'streaming');
  const busy = streaming || submitting;
  const unavailable = !simulated && (!snapshot.worker?.connected || !model);
  const candidates = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLocaleLowerCase();
    return snapshot.documents
      .filter((d) => d.title.toLocaleLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(!a.title.toLocaleLowerCase().startsWith(query)) -
            Number(!b.title.toLocaleLowerCase().startsWith(query)) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 8);
  }, [mention, snapshot.documents]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot.messages]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => setScoped(true), [doc?.id]);
  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  const choose = (next: ChatChoice) => {
    setPicked(next);
    void run(() => client.updateSettings({ chat: next }));
  };
  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const query = before.slice(at + 1);
    if (at < 0 || (at > 0 && !/\s/.test(before[at - 1])) || query.length > 60 || /\n/.test(query))
      return setMention(null);
    setMention((current) => ({
      start: at,
      end: caret,
      query,
      index: current?.start === at ? current.index : 0,
    }));
  };
  const insertMention = (target: WikiDocument) => {
    if (!mention) return;
    const token = `@${target.title} `;
    const next = text.slice(0, mention.start) + token + text.slice(mention.end);
    setText(next);
    setMentions((list) =>
      list.some((m) => m.id === target.id)
        ? list
        : [...list, { id: target.id, title: target.title }],
    );
    setMention(null);
    caret.current = mention.start + token.length;
  };
  const startMention = () => {
    const at = input.current?.selectionStart ?? text.length;
    const spacer = at > 0 && !/\s/.test(text[at - 1]) ? ' @' : '@';
    const next = text.slice(0, at) + spacer + text.slice(at);
    setText(next);
    detectMention(next, at + spacer.length);
    caret.current = at + spacer.length;
  };
  const addFiles = (list: FileList | File[]) =>
    void run(async () => {
      const chosen = [...list];
      if (attachments.length + chosen.length > MAX_ATTACHMENTS)
        throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per message.`);
      const read = await Promise.all(chosen.map(readAttachment));
      setAttachments((current) => [...current, ...read]);
    });

  const submit = async (input: {
    text: string;
    documentIds: string[];
    attachments: { filename: string; text: string }[];
    supplementRatio?: number;
  }) => {
    const next = new AbortController();
    controller.current = next;
    setSubmitting(true);
    const sent = await run(() =>
      client.sendMessage({ ...input, choice: choice ?? undefined, signal: next.signal }),
    );
    setSubmitting(false);
    controller.current = null;
    return sent;
  };
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id;
    onRequestHandled?.(request.id);
    if (busy || unavailable) {
      void run(async () => {
        throw new Error(
          busy
            ? 'Wait for the current reply, or stop it, before requesting a rewrite.'
            : 'Connect a worker CLI in Agent before requesting a rewrite.',
        );
      });
      return;
    }
    void submit({
      text: request.text,
      documentIds: request.documentIds,
      attachments: [],
      supplementRatio: request.supplementRatio,
    });
    // Each request is sent once; the panel's current state decides whether it can be.
  }, [request]);
  const send = async (value = text) => {
    if (busy || unavailable || (!value.trim() && !attachments.length)) return;
    // Replace each typed @mention with a stable ID link; longer titles first.
    let body = value.trim();
    const used = [...mentions]
      .sort((a, b) => b.title.length - a.title.length)
      .filter((m) => body.includes(`@${m.title}`));
    for (const m of used)
      body = body.split(`@${m.title}`).join(`[[${m.id}|${mentionLabel(m.title)}]]`);
    const documentIds = [
      ...new Set([...(doc && scoped ? [doc.id] : []), ...used.map((m) => m.id)]),
    ];
    const sent = await submit({
      text: body,
      documentIds,
      attachments: attachments.map(({ filename, text }) => ({ filename, text })),
    });
    // A rejected request keeps the draft for another attempt.
    if (sent && value === text) {
      setText('');
      setMentions([]);
      setAttachments([]);
      setMention(null);
    }
  };
  const stop = () => {
    controller.current?.abort();
    if (client.stopMessage) void run(() => client.stopMessage!());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMention({
          ...mention,
          index: (mention.index + step + candidates.length) % candidates.length,
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(candidates[mention.index] ?? candidates[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const disclaimer = simulated
    ? 'Simulated answers. No model connected and no notes change.'
    : !snapshot.worker?.connected
      ? 'Enable the background service in Agent to chat.'
      : !models.length
        ? 'Connect Codex CLI or Claude Code in Agent to chat.'
        : `Requested changes apply as revisions you can restore · ${chat?.callsToday ?? 0}/${chat?.dailyLimit ?? 0} replies today`;

  return (
    <>
      <div className="chat-toolbar">
        <span className="demo-caption">
          <i /> {simulated ? 'Demo assistant' : 'Wiki chat'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="New conversation"
          title="New conversation"
          disabled={busy || !snapshot.messages.length}
          onClick={() => void run(() => client.clearMessages())}
        >
          <Plus size={16} />
        </Button>
      </div>
      <div className="chat-scroll" ref={scroll}>
        {snapshot.messages.length ? (
          <div className="chat-messages">
            {snapshot.messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                snapshot={snapshot}
                onSource={onSource}
                onOpen={onOpen}
              />
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
              Ask about your wiki, mention a note with @,
              <br />
              or attach a file and ask knoter to add it.
            </p>
            <div className="chat-prompts">
              {[
                'Give me the big picture',
                'How do these ideas connect?',
                'What should I explore next?',
              ].map((prompt, i) => (
                <button
                  key={prompt}
                  disabled={busy || unavailable}
                  onClick={() => void send(prompt)}
                >
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
      <div
        className={`chat-composer-area ${dragging ? 'composer-dragging' : ''}`}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {(doc || attachments.length > 0) && (
          <div className="composer-chips">
            {doc && (
              <button
                className={`context-chip ${scoped ? '' : 'unscoped'}`}
                onClick={() => setScoped(!scoped)}
                title={scoped ? 'Remove the open note from this message' : 'Include the open note'}
              >
                <BookOpen size={12} />
                <span>{scoped ? doc.title : 'Whole workspace'}</span>
                {scoped ? <X size={11} /> : <Plus size={11} />}
              </button>
            )}
            {attachments.map((file, index) => (
              <span className="context-chip attachment-chip" key={`${file.filename}-${index}`}>
                <Paperclip size={12} />
                <span>{file.filename}</span>
                <small>{fileSize(file.size)}</small>
                <button
                  aria-label={`Remove ${file.filename}`}
                  onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {mention && candidates.length > 0 && (
            <div className="mention-menu" role="listbox" id="chat-mentions" aria-label="Notes">
              {candidates.map((candidate, index) => (
                <button
                  type="button"
                  role="option"
                  id={`chat-mention-${candidate.id}`}
                  aria-selected={index === mention.index}
                  className={index === mention.index ? 'active' : ''}
                  key={candidate.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(candidate)}
                >
                  <FileText size={13} />
                  <span>{candidate.title}</span>
                  {candidate.protected && <small>edited</small>}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            aria-label="Ask or request a wiki change"
            aria-autocomplete="list"
            aria-controls={mention && candidates.length ? 'chat-mentions' : undefined}
            aria-activedescendant={
              mention && candidates[mention.index]
                ? `chat-mention-${candidates[mention.index].id}`
                : undefined
            }
            placeholder={
              simulated
                ? 'Ask your knowledge…'
                : 'Ask, or ask knoter to update the wiki. Type @ to mention a note…'
            }
            rows={3}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              detectMention(e.target.value, e.target.selectionStart);
            }}
            onSelect={(e) =>
              detectMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
            }
            onBlur={() => setMention(null)}
            onKeyDown={onKeyDown}
          />
          <div className="composer-bottom">
            <div className="composer-tools">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="composer-icon"
                aria-label="Attach Markdown or text files"
                title="Attach Markdown or text files"
                disabled={busy || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => files.current?.click()}
              >
                <Paperclip />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="composer-icon"
                aria-label="Mention a note"
                title="Mention a note"
                disabled={busy}
                onClick={startMention}
              >
                <AtSign />
              </Button>
              {models.length > 0 && (
                <ModelPicker
                  models={models}
                  choice={choice}
                  disabled={busy}
                  onChoose={(next) => {
                    const option = models.find(
                      (m) => m.provider === next.provider && m.model === next.model,
                    )!;
                    choose({
                      ...next,
                      effort: option.efforts.includes(choice?.effort ?? '')
                        ? choice!.effort
                        : option.defaultEffort,
                    });
                  }}
                />
              )}
              {model && choice && (
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="composer-select"
                      disabled={busy}
                      aria-label={`Reasoning: ${effortLabels[choice.effort] ?? choice.effort}`}
                    >
                      {effortLabels[choice.effort] ?? choice.effort}
                      <ChevronDown size={11} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="document-menu chat-picker"
                      side="top"
                      align="start"
                      sideOffset={6}
                    >
                      <DropdownMenu.Label className="document-menu-label">
                        Reasoning effort
                      </DropdownMenu.Label>
                      <DropdownMenu.RadioGroup
                        value={choice.effort}
                        onValueChange={(effort) => choose({ ...choice, effort })}
                      >
                        {model.efforts.map((effort) => (
                          <DropdownMenu.RadioItem
                            key={effort}
                            value={effort}
                            className="document-menu-item"
                          >
                            <span>{effortLabels[effort] ?? effort}</span>
                            {effort === model.defaultEffort && <small>default</small>}
                            <DropdownMenu.ItemIndicator className="picker-check">
                              <Check size={13} />
                            </DropdownMenu.ItemIndicator>
                          </DropdownMenu.RadioItem>
                        ))}
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
            {busy ? (
              <Button
                variant="soft"
                size="icon"
                type="button"
                aria-label="Stop response"
                disabled={submitting && !streaming}
                onClick={stop}
              >
                <Square size={12} fill="currentColor" />
              </Button>
            ) : (
              <Button
                size="icon"
                type="submit"
                aria-label="Send message"
                disabled={unavailable || (!text.trim() && !attachments.length)}
              >
                <ArrowUp size={16} />
              </Button>
            )}
          </div>
        </form>
        <input
          ref={files}
          type="file"
          hidden
          multiple
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="chat-disclaimer">{disclaimer}</p>
      </div>
    </>
  );
}

function ModelPicker({
  models,
  choice,
  disabled,
  onChoose,
}: {
  models: NonNullable<WorkspaceSnapshot['chat']>['models'];
  choice: ChatChoice | null;
  disabled: boolean;
  onChoose: (choice: ChatChoice) => void;
}) {
  const selected = models.find((m) => m.provider === choice?.provider && m.model === choice?.model);
  const providers = [...new Set(models.map((m) => m.provider))];
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="composer-select"
          disabled={disabled}
          aria-label={`Model: ${selected ? `${providerLabels[selected.provider]} ${selected.label}` : 'none'}`}
        >
          {selected?.label ?? 'Choose model'}
          <ChevronDown size={11} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="document-menu chat-picker"
          side="top"
          align="start"
          sideOffset={6}
        >
          <DropdownMenu.RadioGroup
            value={choice ? `${choice.provider}:${choice.model}` : ''}
            onValueChange={(value) => {
              const [provider, ...rest] = value.split(':');
              onChoose({
                provider: provider as ChatChoice['provider'],
                model: rest.join(':'),
                effort: choice?.effort ?? '',
              });
            }}
          >
            {providers.map((provider, index) => (
              <div key={provider}>
                {index > 0 && <DropdownMenu.Separator className="document-menu-separator" />}
                <DropdownMenu.Label className="document-menu-label">
                  {providerLabels[provider]}
                </DropdownMenu.Label>
                {models
                  .filter((m) => m.provider === provider)
                  .map((m) => (
                    <DropdownMenu.RadioItem
                      key={m.model}
                      value={`${m.provider}:${m.model}`}
                      className="document-menu-item"
                    >
                      <span>{m.label}</span>
                      <DropdownMenu.ItemIndicator className="picker-check">
                        <Check size={13} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
              </div>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatBubble({
  message,
  snapshot,
  onSource,
  onOpen,
}: {
  message: ChatMessage;
  snapshot: WorkspaceSnapshot;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const title = (id: string) =>
    snapshot.documents.find((d) => d.id === id)?.title ??
    snapshot.trashedDocuments.find((d) => d.id === id)?.title;
  const steps = message.activity ?? [];
  if (message.role === 'user') {
    // The open note is sent as context without an inline link; show it as a chip.
    const context = message.documentIds.filter(
      (id) => !message.content.includes(`[[${id}|`) && title(id),
    );
    return (
      <div className="chat-message message-user">
        {message.content && (
          <Markdown compact onSource={onSource} onOpen={onOpen} documents={snapshot.documents}>
            {message.content}
          </Markdown>
        )}
        {(context.length > 0 || (message.attachments?.length ?? 0) > 0) && (
          <div className="message-chips">
            {context.map((id) => (
              <button key={id} className="context-chip" onClick={() => onOpen(id)}>
                <BookOpen size={11} />
                <span>{title(id)}</span>
              </button>
            ))}
            {message.attachments?.map((file, index) => (
              <button
                key={`${file.name}-${index}`}
                className="context-chip attachment-chip"
                disabled={!file.sourceId}
                title={file.sourceId ? 'Open the stored attachment' : 'Not cited by a wiki change'}
                onClick={() => file.sourceId && onSource(file.sourceId)}
              >
                <Paperclip size={11} />
                <span>{file.name}</span>
                <small>{fileSize(file.size)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="chat-message message-assistant">
      <div className="message-author">
        <span className="mini-logo">
          <Sparkles size={13} />
        </span>
        <strong>knoter</strong>
        <span>{message.model ?? 'Demo'}</span>
      </div>
      {message.status === 'streaming' && !message.content ? (
        <div className="chat-progress" role="status">
          <span>
            <Loader2 size={12} className="spin" />
            {steps.length ? 'Working with your wiki…' : 'Thinking…'}
          </span>
          {steps.slice(-4).map((step, index) => (
            <small key={`${index}-${step}`}>{step}</small>
          ))}
        </div>
      ) : (
        message.content && (
          <Markdown compact onSource={onSource} onOpen={onOpen} documents={snapshot.documents}>
            {message.content}
          </Markdown>
        )
      )}
      {(message.changes?.length ?? 0) > 0 && (
        <div className="chat-changes">
          <span className="eyebrow">WIKI UPDATED</span>
          {message.changes!.map((change) => (
            <button
              key={change.documentId}
              onClick={() => onOpen(change.documentId)}
              disabled={!snapshot.documents.some((d) => d.id === change.documentId)}
            >
              {change.op === 'create' ? <FilePlus2 size={13} /> : <PenLine size={13} />}
              <span>{title(change.documentId) ?? change.title}</span>
              <small>
                {change.op === 'create' ? 'Created' : 'Updated'} · rev {change.revision}
              </small>
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
      {message.status === 'complete' && !message.changes && message.documentIds.length > 0 && (
        <div className="answer-links">
          {message.documentIds
            .filter((id) => title(id))
            .map((id, index) => (
              <button key={id} onClick={() => onOpen(id)}>
                <span>{index + 1}</span>
                {title(id)}
                <ArrowUpRight size={12} />
              </button>
            ))}
        </div>
      )}
      {(message.warnings?.length ?? 0) > 0 && (
        <ul className="chat-warnings">
          {message.warnings!.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {message.status === 'failed' && (
        <p className="chat-error" role="alert">
          {message.error ?? 'The reply could not be completed.'}
        </p>
      )}
      {message.status === 'stopped' && (
        <span className="stopped-label">{message.error ?? 'Response stopped'}</span>
      )}
      {message.status !== 'streaming' && steps.length > 0 && (
        <details className="chat-steps">
          <summary>
            {steps.length} step{steps.length === 1 ? '' : 's'}
          </summary>
          <ol>
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
