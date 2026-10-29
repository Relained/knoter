import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  FileText,
  FolderPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UploadCloud,
} from 'lucide-react';
import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from './ui/button';
import { SourceIcon, fileSize, relativeTime } from './helpers';
import type { RunAction } from '../views/WikiView';

const date = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

/** The Sources window: watched folders, imports, and every source with its status. */
export function SourcesPanel({
  snapshot,
  client,
  run,
  onImport,
  onSource,
  onOpen,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  onImport: () => void;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const sources = snapshot.sources.filter(
    (s) =>
      (filter === 'all' || s.type === filter) &&
      `${s.title} ${s.filename}`.toLowerCase().includes(query.toLowerCase()),
  );
  const processing = snapshot.sources.filter((s) =>
    ['queued', 'extracting'].includes(s.status),
  ).length;
  const needsReview = new Set(
    snapshot.sources
      .filter(
        (source) =>
          snapshot.worker?.jobs.find((job) => job.versionId === source.latestVersionId)?.status ===
          'needs_review',
      )
      .map((source) => source.id),
  );
  const noWiki = new Set(
    snapshot.sources
      .filter((source) => source.status === 'ready' && !source.documentIds.length)
      .map((source) => source.id),
  );
  const retryNoChange = new Set(
    snapshot.sources
      .filter(
        (source) =>
          noWiki.has(source.id) &&
          snapshot.worker?.jobs.find((job) => job.versionId === source.latestVersionId)?.result
            ?.outcome === 'no_change',
      )
      .map((source) => source.id),
  );
  const worker = snapshot.worker;
  const offline = client.mode === 'connected' && !worker?.connected;
  const act = (action: () => Promise<unknown>) => void run(action);
  return (
    <div className="sources-panel">
      {client.mode === 'connected' && (
        <section className="agent-section">
          <header>
            <FolderPlus size={15} />
            <h3>Watched folders</h3>
            <span className="count-pill">{worker?.watches.length ?? 0}</span>
          </header>
          <p>
            Markdown folders are rescanned while this app is open. Files stay untouched; at most 256
            KiB per UTF-8 .md file.
          </p>
          {worker?.watches.map((w) => (
            <div className="worker-location" key={w.id}>
              <strong>{w.path}</strong>
              <small>
                Last discovery: {date(w.lastScan)}
                {w.error ? ` · ${w.error}` : ''}
              </small>
            </div>
          ))}
          {!!worker?.pendingSources?.length && (
            <div role="status" className="worker-error">
              <strong>Registration pending</strong>
              {worker.pendingSources.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}
          <div className="agent-actions">
            <Button
              size="sm"
              disabled={offline}
              onClick={() => act(() => client.desktop!('chooseFolder'))}
            >
              <FolderPlus /> Watch Markdown folder
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offline}
              onClick={() => act(() => client.desktop!('importMarkdown'))}
            >
              <Upload /> Import snapshot
            </Button>
          </div>
        </section>
      )}
      {client.mode === 'demo' && (
        <button className="source-drop-zone" onClick={onImport}>
          <span className="upload-symbol">
            <UploadCloud size={22} />
          </span>
          <div>
            <strong>A new source, a new connection.</strong>
            <p>Drop in a paper or note. Let your wiki grow from there.</p>
          </div>
          <span className="drop-formats">
            PDF <i /> Markdown <i /> Text
          </span>
          <Plus size={18} />
        </button>
      )}
      {client.mode === 'demo' && (
        <div className="worker-banner">
          <span
            className={
              processing && !snapshot.settings.workerPaused ? 'worker-icon active' : 'worker-icon'
            }
          >
            {processing && !snapshot.settings.workerPaused ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
          </span>
          <div>
            <strong>
              {snapshot.settings.workerPaused
                ? 'Demo worker paused'
                : processing
                  ? `Connecting ${processing} new source${processing > 1 ? 's' : ''}…`
                  : 'Everything is connected'}
            </strong>
            <span>Simulated processing · your original files stay untouched</span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              void run(() =>
                client.updateSettings({ workerPaused: !snapshot.settings.workerPaused }),
              )
            }
          >
            {snapshot.settings.workerPaused ? <Play /> : <Pause />}
            {snapshot.settings.workerPaused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      )}
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ['all', 'All sources'],
            ['pdf', 'Papers'],
            ['md', 'Markdown'],
            ['txt', 'Text'],
          ]
            .filter(([id]) => client.mode === 'demo' || id === 'all' || id === 'md')
            .map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? 'selected' : ''}
                onClick={() => setFilter(id)}
              >
                {label}
                {id === 'all' && <span>{snapshot.sources.length}</span>}
              </button>
            ))}
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            placeholder="Search sources…"
            aria-label="Search sources"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {client.mode === 'demo' && (
          <Button size="sm" onClick={onImport}>
            <Plus /> Add sources
          </Button>
        )}
      </div>
      <div className="source-table">
        <div className="source-table-head">
          <span>NAME</span>
          <span>STATUS</span>
          <span>CONNECTIONS</span>
          <span>ADDED</span>
        </div>
        {sources.map((source) => (
          <div className="source-table-row" key={source.id}>
            <button className="source-name" onClick={() => onSource(source.id)}>
              <SourceIcon type={source.type} />
              <span>
                <strong>{source.title}</strong>
                <small>
                  {source.filename} · {fileSize(source.size)}
                </small>
              </span>
            </button>
            <span
              className={`status-badge status-${noWiki.has(source.id) ? 'failed' : source.status}`}
            >
              {source.status === 'ready' && !noWiki.has(source.id) ? (
                <Check size={11} />
              ) : source.status === 'failed' || noWiki.has(source.id) ? (
                <RefreshCw size={11} />
              ) : (
                <Loader2 size={11} className="spin" />
              )}
              {needsReview.has(source.id)
                ? 'Needs review'
                : source.status === 'ready'
                  ? noWiki.has(source.id)
                    ? 'No linked wiki'
                    : 'Connected'
                  : source.status === 'extracting'
                    ? 'Processing'
                    : source.status === 'queued'
                      ? 'Queued'
                      : 'Needs retry'}
            </span>
            {(source.status === 'failed' && !needsReview.has(source.id)) ||
            retryNoChange.has(source.id) ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={offline}
                onClick={() => void run(() => client.retrySource(source.id))}
              >
                Retry
              </Button>
            ) : (
              <button
                className="connection-link"
                disabled={!source.documentIds.length}
                onClick={() => onOpen(source.documentIds[0])}
              >
                <FileText size={13} />
                {source.documentIds.length} notes <ArrowUpRight size={12} />
              </button>
            )}
            <span className="table-time">{relativeTime(source.addedAt)}</span>
          </div>
        ))}
      </div>
      {!sources.length && (
        <div className="empty-state">
          <Search />
          <h3>No matching sources</h3>
          <p>Try a different name or add something new.</p>
        </div>
      )}
      <div className="table-footer">
        {sources.length} source{sources.length !== 1 ? 's' : ''}
        <span>Evidence stays connected to every idea.</span>
      </div>
    </div>
  );
}
