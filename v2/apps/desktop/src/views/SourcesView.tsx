import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react';
import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { SourceIcon, fileSize, relativeTime } from '../components/helpers';
import type { RunAction } from './WikiView';

export function SourcesView({
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
  return (
    <div className="collection-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">WHERE IDEAS BEGIN</div>
          <h1>Your sources</h1>
          <p>Papers, notes, and the evidence behind your knowledge.</p>
        </div>
        <Button onClick={onImport}>
          <Plus /> Add sources
        </Button>
      </div>
      <button className="source-drop-zone" onClick={onImport}>
        <span className="upload-symbol">
          <UploadCloud size={24} />
        </span>
        <div>
          <strong>A new source, a new connection.</strong>
          <p>Drop in a paper or note. Let your wiki grow from there.</p>
        </div>
        <span className="drop-formats">
          PDF <i /> Markdown <i /> Text
        </span>
        <Plus size={20} />
      </button>
      <div className="worker-banner">
        <span
          className={
            processing && !snapshot.settings.workerPaused ? 'worker-icon active' : 'worker-icon'
          }
        >
          {processing && !snapshot.settings.workerPaused ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Check size={16} />
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
          size="sm"
          onClick={() =>
            void run(() => client.updateSettings({ workerPaused: !snapshot.settings.workerPaused }))
          }
        >
          {snapshot.settings.workerPaused ? <Play /> : <Pause />}
          {snapshot.settings.workerPaused ? 'Resume' : 'Pause'}
        </Button>
      </div>
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ['all', 'All sources'],
            ['pdf', 'Papers'],
            ['md', 'Markdown'],
            ['txt', 'Text'],
          ].map(([id, label]) => (
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
            <span className={`status-badge status-${source.status}`}>
              {source.status === 'ready' ? (
                <Check size={11} />
              ) : source.status === 'failed' ? (
                <RefreshCw size={11} />
              ) : (
                <Loader2 size={11} className="spin" />
              )}
              {source.status === 'ready'
                ? 'Connected'
                : source.status === 'extracting'
                  ? 'Processing'
                  : source.status === 'queued'
                    ? 'Queued'
                    : 'Needs retry'}
            </span>
            {source.status === 'failed' ? (
              <Button
                variant="ghost"
                size="sm"
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
