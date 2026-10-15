import { useState } from 'react';
import type { KnoterClient, WikiDocument } from '@knoter/contracts';
import type { ReferenceEvidence } from '@knoter/contracts/native';
import type { RunAction } from '../views/WikiView';
import { Button } from './ui/button';

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
    <section className="official-references" aria-label="Official reference evidence">
      <h2>Official references</h2>
      <p>Explanations supplementing your notes were checked against these documents.</p>
      {doc.references.map((reference) => (
        <details key={reference.id}>
          <summary>{reference.title}</summary>
          <p>
            <a href={reference.url} target="_blank" rel="noreferrer">
              MDN Web Docs ↗
            </a>{' '}
            · Checked {new Date(reference.fetchedAt).toLocaleDateString()}
          </p>
          <small>
            {reference.license} · Explanations adapted in Korean.{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/2.5/"
              target="_blank"
              rel="noreferrer"
            >
              License
            </a>
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
