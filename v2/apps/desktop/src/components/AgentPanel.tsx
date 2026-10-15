import { useState } from 'react';
import {
  Archive,
  Bot,
  Download,
  GitPullRequestArrow,
  Pause,
  Play,
  RefreshCw,
  Server,
  Settings2,
  Square,
  Upload,
} from 'lucide-react';
import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import type { DesktopAction } from '@knoter/contracts/native';
import { Button } from './ui/button';
import { reviewCount } from './ChangesPanel';
import type { RunAction } from '../views/WikiView';

const date = (value: number | string | null) => (value ? new Date(value).toLocaleString() : '—');

/** The Agent window: background service, worker CLI connection, queue, and jobs. */
export function AgentPanel({
  snapshot,
  client,
  run,
  onOpenChanges,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  onOpenChanges: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const worker = snapshot.worker;
  const paused = snapshot.settings.workerPaused;
  const pending = reviewCount(snapshot);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await run(async () => {
      const result = await fn();
      if (typeof result === 'string') setMessage(result);
    });
    setBusy(false);
  };
  const desktop = (name: DesktopAction) => void action(() => client.desktop!(name));
  const togglePause = () =>
    void action(() => client.updateSettings({ workerPaused: !snapshot.settings.workerPaused }));

  if (client.mode === 'demo' || !worker)
    return (
      <div className="agent-panel">
        <section className="agent-section">
          <header>
            <Bot size={15} />
            <h3>Simulated agent</h3>
            <span className="status-badge status-ready">Preview</span>
          </header>
          <p>
            The browser preview simulates connecting imported sources to your wiki. No language
            model, CLI, or background service is connected, and chat replies are assembled from
            saved notes.
          </p>
          <div className="agent-actions">
            <Button size="sm" variant={paused ? 'default' : 'outline'} onClick={togglePause}>
              {paused ? <Play /> : <Pause />}
              {paused ? 'Resume processing' : 'Pause processing'}
            </Button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="agent-panel">
      <section className="agent-section">
        <header>
          <Server size={15} />
          <h3>Background service</h3>
          <span className={`status-badge ${worker.connected ? 'status-ready' : 'status-failed'}`}>
            {worker.connected ? 'Connected' : 'Offline'}
          </span>
        </header>
        <p>
          Local LaunchAgent demo · checks the queue every 60 seconds. Only this open app discovers
          source changes; the service can finish queued snapshots after you quit.
        </p>
        {!worker.connected && (
          <p role="status" className="worker-error">
            {worker.error} Your open drafts and last visible results are retained.
          </p>
        )}
        <div className="agent-actions">
          <Button size="sm" disabled={busy} onClick={() => desktop('enable')}>
            <Play /> Enable background
          </Button>
          <Button size="sm" disabled={busy} variant="outline" onClick={() => desktop('disable')}>
            <Square /> Disable service
          </Button>
          <Button size="sm" disabled={busy} variant="ghost" onClick={() => desktop('restart')}>
            <RefreshCw /> Restart
          </Button>
          <Button size="sm" disabled={busy} variant="ghost" onClick={() => desktop('status')}>
            Refresh OS status
          </Button>
          <Button
            size="sm"
            disabled={busy}
            variant="ghost"
            onClick={() => desktop('approvalSettings')}
          >
            <Settings2 /> OS approval settings
          </Button>
        </div>
        <p className="worker-detail">
          OS registration: {worker.registered ?? 'unknown'} · Service PID:{' '}
          {worker.connected ? worker.pid : '—'}
        </p>
      </section>

      <section className="agent-section">
        <header>
          <Bot size={15} />
          <h3>Worker CLI</h3>
          <span
            className={`status-badge ${worker.cli.status === 'ready' ? 'status-ready' : 'status-failed'}`}
          >
            {worker.cli.status}
          </span>
        </header>
        <p>
          <strong>{worker.cli.provider === 'claude' ? 'Claude Code' : 'Codex CLI'}</strong> ·{' '}
          {worker.cli.message}
        </p>
        <p className="worker-detail">
          {worker.cli.path || 'No CLI selected'}
          {worker.cli.version ? ` · ${worker.cli.version}` : ''}
        </p>
        <div className="agent-actions">
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('chooseCli')}
          >
            Connect Codex CLI
          </Button>
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('chooseClaudeCode')}
          >
            Connect Claude Code
          </Button>
        </div>
        <p className="worker-detail">
          Personal wiki · your notes come first; gaps are filled from the model and the web, marked
          as supplements, at the share set in Settings → Writing. {worker.model} · {worker.effort}{' '}
          reasoning · 5 minutes per attempt · 2 automatic retries.
        </p>
      </section>

      <section className="agent-section">
        <header>
          <RefreshCw size={15} />
          <h3>Queue</h3>
          <span className={`status-badge ${paused ? 'status-queued' : 'status-ready'}`}>
            {paused ? 'Paused' : 'Running'}
          </span>
        </header>
        <div className="agent-actions">
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={togglePause}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume queue' : 'Pause queue'}
          </Button>
          <Button
            size="sm"
            disabled={busy || !worker.connected || paused}
            variant="ghost"
            onClick={() => void action(() => client.runWorker!())}
          >
            <RefreshCw /> Run now
          </Button>
          {pending > 0 && (
            <Button size="sm" variant="soft" onClick={onOpenChanges}>
              <GitPullRequestArrow /> {pending} waiting in Changes
            </Button>
          )}
        </div>
        <p className="worker-detail">
          Last check: {date(worker.lastTick)} · Next: {date(worker.nextTick)} · {worker.callsToday}/
          {worker.dailyLimit} notes started today · resets {date(worker.resetsAt)} (
          {worker.timezone || 'local time'})
        </p>
        <details className="agent-jobs">
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
                  {j.result && (
                    <div>
                      <small>
                        Result:{' '}
                        {j.result.outcome === 'no_change'
                          ? 'No changes'
                          : j.result.outcome === 'needs_review'
                            ? 'Needs review'
                            : j.status === 'succeeded'
                              ? 'Wiki updated'
                              : 'Changes proposed'}
                      </small>
                      <p>{j.result.summary}</p>
                      {j.result.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                    </div>
                  )}
                  {j.successorId && <small>Replaced by job {j.successorId.slice(0, 8)}</small>}
                </div>
                {['queued', 'running', 'retry_wait'].includes(j.status) ? (
                  <Button
                    disabled={busy || !worker.connected}
                    variant="ghost"
                    size="xs"
                    onClick={() => void action(() => client.cancelJob!(j.id))}
                  >
                    Cancel
                  </Button>
                ) : ['failed', 'needs_review'].includes(j.status) ||
                  (j.status === 'succeeded' &&
                    j.result?.outcome === 'no_change' &&
                    snapshot.sources.some(
                      (s) =>
                        s.id === j.sourceId &&
                        s.latestVersionId === j.versionId &&
                        !s.documentIds.length,
                    )) ? (
                  <Button
                    disabled={busy || !worker.connected}
                    variant="ghost"
                    size="xs"
                    onClick={() => void action(() => client.retrySource(j.sourceId))}
                  >
                    Retry latest
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="agent-section">
        <header>
          <Archive size={15} />
          <h3>Backup and export</h3>
        </header>
        <p>
          A complete backup includes originals, revisions, and citations. Restore into an empty
          workspace; reconnect folders and the CLI afterward.
        </p>
        <div className="agent-actions">
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('backup')}
          >
            <Archive /> Create backup
          </Button>
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('restoreBackup')}
          >
            <Upload /> Restore backup
          </Button>
          <Button
            size="sm"
            disabled={busy || !worker.connected}
            variant="outline"
            onClick={() => desktop('exportWiki')}
          >
            <Download /> Export Markdown
          </Button>
        </div>
      </section>
      {message && (
        <p role="status" className="worker-detail">
          {message}
        </p>
      )}
    </div>
  );
}
