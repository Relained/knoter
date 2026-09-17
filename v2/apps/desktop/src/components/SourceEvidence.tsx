import { useState } from 'react';
import type { KnoterClient, Source, WorkspaceSnapshot } from '@knoter/contracts';
import type { EvidenceVersion } from '@knoter/contracts/native';
import { Button } from './ui/button';
import type { RunAction } from '../views/WikiView';
export function SourceEvidence({
  source,
  snapshot,
  client,
  run,
}: {
  source: Source;
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
}) {
  const [version, setVersion] = useState<EvidenceVersion | null>(null);
  const citations = snapshot.documents
    .flatMap((d) => d.citations ?? [])
    .filter((c) => c.sourceId === source.id);
  const versions = [
    ...new Set(
      [source.latestVersionId, ...citations.map((c) => c.versionId)].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  return (
    <section className="source-evidence">
      <p>
        Latest registered: v{source.latestVersion} · {source.availability} ·{' '}
        {source.watchId ? 'Folder watched while app is open' : 'Snapshot only'}
      </p>
      <p>
        Last discovery: {source.detectedAt ? new Date(source.detectedAt).toLocaleString() : '—'} ·{' '}
        {source.processedVersionId === source.latestVersionId
          ? 'Latest version processed'
          : 'Latest version not yet processed'}
      </p>
      <strong>Inspect original evidence</strong>
      <div className="worker-controls">
        {versions.map((id) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            onClick={() => void run(async () => setVersion(await client.readSourceVersion!(id)))}
          >
            {id === source.latestVersionId ? 'Latest' : 'Cited'} · {id.slice(0, 8)}
          </Button>
        ))}
      </div>
      {version && (
        <div>
          <p>
            Immutable source v{version.version} · SHA-256 <code>{version.hash}</code>
          </p>
          {version.segments.map((s) => (
            <div key={s.id} className="evidence-segment">
              <small>
                {s.id} · lines {s.startLine}–{s.endLine} · {s.heading}
              </small>
              <pre>{s.text}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
