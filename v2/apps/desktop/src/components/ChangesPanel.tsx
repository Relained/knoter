import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  GitPullRequestArrow,
  History,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import type { KnoterClient, Source, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import { MAX_PROPOSAL_FEEDBACK, type JobInfo, type WorkerInfo } from '@knoter/contracts/native';
import { Button } from './ui/button';
import { relativeTime } from './helpers';
import type { RunAction } from '../views/WikiView';

export interface AttentionItem {
  source: Source;
  job?: JobInfo;
  kind: 'needs_review' | 'failed' | 'unlinked';
  retry: boolean;
}

/** Sources whose latest version did not reach the wiki cleanly. */
export function attentionItems(snapshot: WorkspaceSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  // A job whose result is waiting below as a proposal is answered there, not listed twice.
  const proposed = new Set(snapshot.worker?.proposals.map((p) => p.jobId));
  for (const source of snapshot.sources) {
    if (source.origin === 'chat') continue;
    const job = snapshot.worker?.jobs.find((j) => j.versionId === source.latestVersionId);
    if (job && proposed.has(job.id)) continue;
    if (job?.status === 'needs_review' || job?.status === 'failed')
      items.push({ source, job, kind: job.status, retry: true });
    else if (source.status === 'failed') items.push({ source, job, kind: 'failed', retry: true });
    else if (source.status === 'ready' && !source.documentIds.length)
      items.push({
        source,
        job,
        kind: 'unlinked',
        retry: job?.result?.outcome === 'no_change',
      });
  }
  return items;
}

/** Proposals and problems waiting on the user, for the status bar badge. */
export const reviewCount = (snapshot: WorkspaceSnapshot) =>
  (snapshot.worker?.proposals.length ?? 0) + attentionItems(snapshot).length;

const kindLabels: Record<AttentionItem['kind'], string> = {
  needs_review: 'Needs review',
  failed: 'Needs retry',
  unlinked: 'No linked wiki',
};

type PendingProposal = WorkerInfo['proposals'][number];

/**
 * One result waiting on the user. A result with changes can be accepted; any result the
 * worker wrote can be answered with direction, which runs its note again (D25).
 */
function ProposalCard({
  p,
  source,
  stale,
  documentTitle,
  disabled,
  client,
  act,
  onSource,
}: {
  p: PendingProposal;
  source?: Source;
  /** The note changed since this result; its newer version is processed on its own. */
  stale: boolean;
  documentTitle: (id: string) => string;
  disabled: boolean;
  client: KnoterClient;
  act: (action: () => Promise<unknown>, message?: string) => Promise<boolean>;
  onSource: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const { operations, trash = [] } = p.proposal;
  const applicable = operations.length > 0 || trash.length > 0;
  // A removal the service proposed, or a result for an older version, has no run to redo.
  const answerable = !!client.reviseProposal && !stale && (operations.length > 0 || !trash.length);
  const composing = answerable && (asking || !applicable);
  const titles = [
    ...operations.map((op) => op.title),
    ...trash.map((t) => `Trash: ${documentTitle(t.documentId)}`),
  ];
  const sourceName = source ? source.relPath || source.filename : '';
  const feedback = draft.trim();
  const send = () => {
    if (!feedback || disabled) return;
    // A refused answer keeps the draft for another attempt.
    void act(
      () => client.reviseProposal!(p.id, feedback),
      'Feedback sent. The worker will run this note again.',
    );
  };
  return (
    <article className="review-card">
      <button className="review-card-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>
          <strong>{p.proposal.summary}</strong>
          <small>
            {stale
              ? 'For an older version of the note'
              : applicable
                ? 'Proposed for protected pages'
                : 'Waiting for your direction'}{' '}
            · {relativeTime(p.createdAt)}
            {sourceName ? ` · ${sourceName}` : ''}
            {titles.length ? ` · ${titles.join(', ')}` : ''}
          </small>
        </span>
      </button>
      {open && (
        <div className="review-card-body">
          {operations.map((op, index) => (
            <div key={index}>
              <strong>
                {op.op === 'create' ? 'New page' : 'Rewrite'} · {op.title}
              </strong>
              <p>{op.reason}</p>
              <pre>{op.body}</pre>
            </div>
          ))}
          {p.proposal.links?.map((l, index) => (
            <p key={`link-${index}`}>
              Link “{l.mentions[0]}” in {l.documents.length} page(s): {l.reason}
            </p>
          ))}
          {trash.map((t) => (
            <div key={t.documentId}>
              <strong>Move to Trash · {documentTitle(t.documentId)}</strong>
              <p>{t.reason}</p>
            </div>
          ))}
          {p.proposal.warnings.map((w) => (
            <p className="review-warning" key={w}>
              {w}
            </p>
          ))}
        </div>
      )}
      {composing && (
        <div className="review-feedback">
          <textarea
            aria-label="Direction for the worker"
            placeholder={
              applicable
                ? 'What should change in this proposal?'
                : 'Tell the worker what to do with this note instead…'
            }
            rows={3}
            maxLength={MAX_PROPOSAL_FEEDBACK}
            value={draft}
            autoFocus={asking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing)
                return;
              e.preventDefault();
              send();
            }}
          />
          <small>Your answer goes to the worker, and it runs this note again with it.</small>
        </div>
      )}
      <div className="review-card-actions">
        {source && (
          <Button
            size="xs"
            variant="ghost"
            className="review-card-source"
            onClick={() => onSource(source.id)}
          >
            <FileText /> Source
          </Button>
        )}
        {composing ? (
          <Button size="xs" disabled={disabled || !feedback} onClick={send}>
            <Send /> Send feedback
          </Button>
        ) : (
          applicable && (
            <Button
              size="xs"
              disabled={disabled}
              onClick={() =>
                void act(() => client.resolveProposal!(p.id, true), 'Changes accepted.')
              }
            >
              <Check /> Accept
            </Button>
          )
        )}
        {applicable && answerable && (
          <Button
            size="xs"
            variant="ghost"
            disabled={disabled}
            title={asking ? undefined : 'Ask the worker to change this proposal'}
            onClick={() => setAsking(!asking)}
          >
            {asking ? (
              'Back'
            ) : (
              <>
                <MessageSquare /> Revise
              </>
            )}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void act(() => client.resolveProposal!(p.id, false), 'Proposal rejected.')}
        >
          <X /> Reject
        </Button>
      </div>
    </article>
  );
}

export function ChangesPanel({
  snapshot,
  doc,
  client,
  run,
  onOpen,
  onSource,
}: {
  snapshot: WorkspaceSnapshot;
  doc?: WikiDocument;
  client: KnoterClient;
  run: RunAction;
  onOpen: (id: string) => void;
  onSource: (id: string) => void;
}) {
  const [scope, setScope] = useState<'note' | 'all'>('note');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(40);
  const worker = snapshot.worker;
  const offline = client.mode === 'connected' && !worker?.connected;
  const proposals = worker?.proposals ?? [];
  const attention = attentionItems(snapshot);
  const noteScope = scope === 'note' && !!doc;
  const revisions = snapshot.revisions
    .filter((r) => !noteScope || r.documentId === doc!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision);
  const act = async (action: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    const done = await run(action, message);
    setBusy(false);
    return done;
  };
  const documentTitle = (id: string) =>
    snapshot.documents.find((d) => d.id === id)?.title ??
    snapshot.trashedDocuments.find((d) => d.id === id)?.title ??
    'Removed note';

  return (
    <div className="panel-scroll changes-panel">
      <section className="changes-section" aria-label="Changes waiting for review">
        <h3>
          <GitPullRequestArrow size={13} /> Review
          <span className="count-pill">{proposals.length + attention.length}</span>
        </h3>
        {!proposals.length && !attention.length && (
          <p className="panel-empty">
            <Check size={13} /> Nothing needs your review. Changes the worker proposes for pages you
            edited, notes it needs your direction on, and notes that did not reach the wiki appear
            here.
          </p>
        )}
        {proposals.map((p) => {
          const job = worker?.jobs.find((j) => j.id === p.jobId);
          const source = job && snapshot.sources.find((s) => s.id === job.sourceId);
          return (
            <ProposalCard
              key={p.id}
              p={p}
              source={source}
              stale={!!job && !!source && job.versionId !== source.latestVersionId}
              documentTitle={documentTitle}
              disabled={busy || offline}
              client={client}
              act={act}
              onSource={onSource}
            />
          );
        })}
        {attention.map((item) => (
          <article className="review-card attention-card" key={item.source.id}>
            <div className="review-card-head">
              <AlertTriangle size={13} />
              <span>
                <strong>{item.source.relPath || item.source.filename}</strong>
                <small>
                  {kindLabels[item.kind]}
                  {item.job ? ` · ${item.job.stage}` : ''}
                </small>
                {item.job?.error && <small className="review-warning">{item.job.error}</small>}
                {item.job?.result && <small>{item.job.result.summary}</small>}
              </span>
            </div>
            <div className="review-card-actions">
              <Button size="xs" variant="ghost" onClick={() => onSource(item.source.id)}>
                <FileText /> Source
              </Button>
              {item.retry && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || offline}
                  onClick={() =>
                    void act(() => client.retrySource(item.source.id), 'Retry queued.')
                  }
                >
                  <RefreshCw /> Retry
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="changes-section" aria-label="Revision history">
        <h3>
          <History size={13} /> History
          <span className="segmented segmented-xs">
            <button
              className={noteScope ? 'selected' : ''}
              disabled={!doc}
              onClick={() => setScope('note')}
              title={doc ? doc.title : 'Open a note to see its history'}
            >
              This note
            </button>
            <button className={!noteScope ? 'selected' : ''} onClick={() => setScope('all')}>
              All notes
            </button>
          </span>
        </h3>
        <div className="revision-list">
          {revisions.slice(0, limit).map((revision) => {
            const current = snapshot.documents.find((d) => d.id === revision.documentId);
            return (
              <div className="revision-item" key={revision.id}>
                <span className={`revision-dot ${revision.author === 'You' ? 'by-you' : ''}`} />
                <div className="revision-meta">
                  <strong>{revision.author}</strong>
                  <span>{relativeTime(revision.createdAt)}</span>
                </div>
                {!noteScope && (
                  <button className="revision-note" onClick={() => onOpen(revision.documentId)}>
                    {documentTitle(revision.documentId)}
                  </button>
                )}
                <p>{revision.summary}</p>
                <div className="revision-bottom">
                  <span>Revision {revision.revision}</span>
                  {current && revision.revision !== current.revision && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy || offline}
                      onClick={() =>
                        void act(
                          () => client.restoreRevision(revision.id),
                          'Revision restored as a new version.',
                        )
                      }
                    >
                      <RotateCcw /> Restore
                    </Button>
                  )}
                  {current && revision.revision === current.revision && (
                    <span className="current-version">Current</span>
                  )}
                </div>
              </div>
            );
          })}
          {!revisions.length && <p className="panel-empty">No revisions yet.</p>}
          {revisions.length > limit && (
            <Button size="xs" variant="ghost" onClick={() => setLimit(limit + 40)}>
              Show older revisions
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
