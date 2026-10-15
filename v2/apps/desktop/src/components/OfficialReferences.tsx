import { useState } from 'react';
import type { KnoterClient, WikiDocument } from '@knoter/contracts';
import type { ReferenceEvidence, ReferenceUse } from '@knoter/contracts/native';
import type { RunAction } from '../views/WikiView';
import { Button } from './ui/button';

const MDN_LICENSE = 'https://creativecommons.org/licenses/by-sa/2.5/';
/** Where a supplement came from; snapshots saved before providers existed were MDN. */
function source(reference: ReferenceUse) {
  const provider = reference.provider ?? 'mdn';
  if (provider === 'mdn') return { label: 'MDN Web Docs', kind: 'Official documentation' };
  if (provider === 'wikipedia') return { label: 'Wikipedia', kind: 'Encyclopedia, not official' };
  let host = reference.url;
  try {
    host = new URL(reference.url).hostname;
  } catch {}
  return { label: host, kind: 'Web page' };
}

export function OfficialReferences({
  doc,
  client,
  run,
}: {
  doc: WikiDocument;
  client: KnoterClient;
  run: RunAction;
}) {
  const [evidence, setEvidence] = useState<Record<string, ReferenceEvidence>>({});
  if (!doc.references?.length) return null;
  return (
    <section className="official-references" aria-label="Supplement references">
      <h2>Supplement references</h2>
      <p>Additions marked as supplements in this note were checked against these pages.</p>
      {doc.references.map((reference) => (
        <details key={reference.id}>
          <summary>{reference.title}</summary>
          <p>
            <a href={reference.url} target="_blank" rel="noreferrer">
              {source(reference).label} ↗
            </a>{' '}
            · {source(reference).kind} · Checked{' '}
            {new Date(reference.fetchedAt).toLocaleDateString()}
          </p>
          <small>
            {reference.license} · Explanations adapted in Korean.{' '}
            {(reference.licenseUrl ?? (reference.provider ? undefined : MDN_LICENSE)) && (
              <a
                href={reference.licenseUrl ?? MDN_LICENSE}
                target="_blank"
                rel="noreferrer"
              >
                License
              </a>
            )}
          </small>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={!client.readReferenceVersion}
              onClick={() =>
                void run(async () => {
                  const value = await client.readReferenceVersion!(reference.id);
                  setEvidence((old) => ({ ...old, [reference.id]: value }));
                })
              }
            >
              Inspect cited passages
            </Button>
          </div>
          {evidence[reference.id] && (
            <div className="reference-passages">
              <small>Stored snapshot · SHA-256 {reference.hash}</small>
              {evidence[reference.id].segments
                .filter((segment) => reference.segmentIds.includes(segment.id))
                .map((segment) => (
                  <div key={segment.id}>
                    <strong>
                      {segment.heading || reference.title} · {segment.id}
                    </strong>
                    <pre>{segment.text}</pre>
                  </div>
                ))}
            </div>
          )}
        </details>
      ))}
    </section>
  );
}
