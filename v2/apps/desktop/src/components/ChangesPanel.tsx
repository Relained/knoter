import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  GitPullRequestArrow,
  History,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import type { KnoterClient, Source, WikiDocument, WorkspaceSnapshot } from '@knoter/contracts';
import type { JobInfo } from '@knoter/contracts/native';
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
  for (const source of snapshot.sources) {
    if (source.origin === 'chat') continue;
    const job = snapshot.worker?.jobs.find((j) => j.versionId === source.latestVersionId);
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
  const [expanded, setExpanded] = useState<string | null>(null);
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
    await run(action, message);
    setBusy(false);
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
            edited, and notes that did not reach the wiki, appear here.
          </p>
        )}
        {proposals.map((p) => {
          const open = expanded === p.id;
          const titles = [
            ...p.proposal.operations.map((op) => op.title),
            ...(p.proposal.trash ?? []).map((t) => `Trash: ${documentTitle(t.documentId)}`),
          ];
          return (
            <article className="review-card" key={p.id}>
              <button
                className="review-card-head"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : p.id)}
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>
                  <strong>{p.proposal.summary}</strong>
                  <small>
                    Proposed for protected pages · {relativeTime(p.createdAt)}
                    {titles.length ? ` · ${titles.join(', ')}` : ''}
                  </small>
                </span>
              </button>
              {open && (
                <div className="review-card-body">
                  {p.proposal.operations.map((op, index) => (
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
                  {p.proposal.trash?.map((t) => (
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
              <div className="review-card-actions">
                <Button
                  size="xs"
                  disabled={
                    busy || offline || !(p.proposal.operations.length || p.proposal.trash?.length)
                  }
                  onClick={() =>
                    void act(() => client.resolveProposal!(p.id, true), 'Changes accepted.')
                  }
                >
                  <Check /> Accept
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || offline}
                  onClick={() =>
                    void act(() => client.resolveProposal!(p.id, false), 'Proposal rejected.')
                  }
                >
                  <X /> Reject
                </Button>
              </div>
            </article>
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
