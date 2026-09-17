import { useState } from 'react';
import {
  FolderPlus,
  Play,
  Pause,
  RefreshCw,
  Settings2,
  Upload,
  Archive,
  Download,
  Square,
} from 'lucide-react';
import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import type { DesktopAction } from '@knoter/contracts/native';
import { Button } from './ui/button';
import type { RunAction } from '../views/WikiView';
const date = (value: number | string | null) => (value ? new Date(value).toLocaleString() : '—');
export function WorkerPanel({
  snapshot,
  client,
  run,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const worker = snapshot.worker;
  if (!worker) return null;
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await run(async () => {
      const result = await fn();
      if (typeof result === 'string') setMessage(result);
    });
    setBusy(false);
  };
  const desktop = (name: DesktopAction) => void action(() => client.desktop!(name));
  return (
    <section className="native-worker" aria-label="Wiki worker">
      <div className="worker-panel-heading">
        <div>
          <span className="eyebrow">WIKI WORKER · MACOS DEMO</span>
          <h2>
            {worker.connected ? 'Your background workspace' : 'Connect the background service'}
          </h2>
        </div>
        <span className={`status-badge ${worker.connected ? 'status-ready' : 'status-failed'}`}>
          {worker.connected ? 'Connected' : 'Offline'}
        </span>
      </div>
      <p>
        Local LaunchAgent demo · Markdown → Korean topic wiki · checks the queue every 60 seconds.
        Only this open app discovers source changes; the service can finish queued snapshots after
        you quit.
      </p>
      {!worker.connected && (
        <p role="status" className="worker-error">
          {worker.error} Your open drafts and last visible results are retained.
        </p>
      )}
      <div className="worker-controls">
        <Button disabled={busy} onClick={() => desktop('enable')}>
          <Play />
          Enable background
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => desktop('disable')}>
          <Square />
          Disable service
        </Button>
        <Button disabled={busy} variant="ghost" onClick={() => desktop('status')}>
          Refresh OS status
        </Button>
        <Button disabled={busy} variant="ghost" onClick={() => desktop('restart')}>
          <RefreshCw />
          Restart service
        </Button>
        <Button disabled={busy} variant="ghost" onClick={() => desktop('approvalSettings')}>
          <Settings2 />
          OS approval settings
        </Button>
      </div>
      <p className="worker-detail">
        OS registration: {worker.registered ?? 'unknown'} · Service PID:{' '}
        {worker.connected ? worker.pid : '—'}
      </p>
      <div className="worker-connection">
        <div>
          <strong>Codex CLI · {worker.cli.status}</strong>
          <p>{worker.cli.message}</p>
          <small>
            {worker.cli.path || 'No CLI selected'}
            {worker.cli.version ? ` · ${worker.cli.version}` : ''}
          </small>
        </div>
        <Button
          disabled={busy || !worker.connected}
          variant="outline"
          onClick={() => desktop('chooseCli')}
        >
          Connect Codex CLI
        </Button>
      </div>
      <p className="worker-detail">
        {worker.model} · low reasoning · 5 minutes per attempt · 2 automatic retries ·{' '}
        {worker.callsToday}/{worker.dailyLimit} runs today. Resets {date(worker.resetsAt)} (
        {worker.timezone || 'local time'}).
      </p>
      <div className="worker-controls">
        <Button disabled={busy || !worker.connected} onClick={() => desktop('chooseFolder')}>
          <FolderPlus />
          Watch Markdown folder
        </Button>
        <Button
          disabled={busy || !worker.connected}
          variant="outline"
          onClick={() => desktop('importMarkdown')}
        >
          <Upload />
          Import snapshot
        </Button>
        <Button
          disabled={busy || !worker.connected}
          variant="outline"
          onClick={() =>
            void action(() =>
              client.updateSettings({ workerPaused: !snapshot.settings.workerPaused }),
            )
          }
        >
          {snapshot.settings.workerPaused ? <Play /> : <Pause />}
          {snapshot.settings.workerPaused ? 'Resume queue' : 'Pause queue'}
        </Button>
        <Button
          disabled={busy || !worker.connected || snapshot.settings.workerPaused}
          variant="ghost"
          onClick={() => void action(() => client.runWorker!())}
        >
          <RefreshCw />
          Run now
        </Button>
      </div>
      <p className="worker-detail">
        Last queue check: {date(worker.lastTick)} · Next: {date(worker.nextTick)}
        {snapshot.settings.workerPaused ? ' · Queue paused' : ''}
      </p>
      {worker.watches.map((w) => (
        <div className="worker-location" key={w.id}>
          <strong>{w.path}</strong>
          <small>
            Last discovery: {date(w.lastScan)}
            {w.error ? ` · ${w.error}` : ''}
          </small>
        </div>
      ))}
      {!!worker.pendingSources?.length && (
        <div role="status" className="worker-error">
          <strong>Registration pending</strong>
          {worker.pendingSources.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
      <details>
        <summary>Jobs ({worker.jobs.length})</summary>
        <div className="worker-jobs">
          {worker.jobs.map((j) => (
            <div key={j.id} className="worker-job">
              <div>
                <strong>
                  {snapshot.sources.find((s) => s.id === j.sourceId)?.filename ?? j.sourceId}
                </strong>
                <span>
                  {j.status} · {j.stage} · {j.attempts} attempt(s)
                </span>
                <small>
                  Source version {j.versionId.slice(0, 8)} · Next eligible {date(j.nextRun)}
                </small>
                {j.error && <p>{j.error}</p>}
                {j.successorId && <small>Replaced by job {j.successorId.slice(0, 8)}</small>}
              </div>
              {['queued', 'running', 'retry_wait'].includes(j.status) ? (
                <Button
                  disabled={busy || !worker.connected}
                  variant="ghost"
                  size="sm"
                  onClick={() => void action(() => client.cancelJob!(j.id))}
                >
                  Cancel
                </Button>
              ) : ['failed', 'needs_review'].includes(j.status) ? (
                <Button
                  disabled={busy || !worker.connected}
                  variant="ghost"
                  size="sm"
                  onClick={() => void action(() => client.retrySource(j.sourceId))}
                >
                  Retry latest
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </details>
      {worker.proposals.map((p) => (
        <details key={p.id} className="worker-proposal">
          <summary>Review: {p.proposal.summary}</summary>
          {p.proposal.operations.map((op, index) => (
            <div key={index}>
              <strong>{op.title}</strong>
              <p>{op.reason}</p>
              <pre>{op.body}</pre>
            </div>
          ))}
          {p.proposal.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <div className="worker-controls">
            <Button
              disabled={busy || !worker.connected || !p.proposal.operations.length}
              onClick={() => void action(() => client.resolveProposal!(p.id, true))}
            >
              Accept changes
            </Button>
            <Button
              disabled={busy || !worker.connected}
              variant="outline"
              onClick={() => void action(() => client.resolveProposal!(p.id, false))}
            >
              Reject
            </Button>
          </div>
        </details>
      ))}
      <details>
        <summary>Backup and export</summary>
        <p>
          A complete backup includes originals, revisions, and citations. Restore into an empty
          workspace; reconnect folders and Codex afterward.
        </p>
        <div className="worker-controls">
          <Button
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('backup')}
          >
            <Archive />
            Create backup
          </Button>
          <Button
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('restoreBackup')}
          >
            Restore backup
          </Button>
          <Button
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('exportWiki')}
          >
            <Download />
            Export Markdown
          </Button>
        </div>
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
