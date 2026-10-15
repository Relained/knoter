// Bounded evidence reads shared by the wiki worker and the side chat. Reads go to the
// live store; versions are immutable and replacements are fenced by the revision read.
import { z } from 'zod';
import {
  EVIDENCE_TOOLS,
  type EvidenceVersion,
  type ReferenceEvidence,
} from '@knoter/contracts/native';
import type { AttemptContext, Store } from './store.js';
import { requireThat } from './common.js';
import { fetchReference, referenceTarget } from './references.js';

export interface EvidenceRun {
  context: Pick<AttemptContext, 'readVersions' | 'readDocuments' | 'references'>;
  reads: number;
  referenceReads: Map<string, Promise<ReferenceEvidence>>;
}
export async function readEvidence(
  store: Store,
  run: EvidenceRun,
  payload: unknown,
  hooks: {
    /** Fence a newly fetched reference, persist it, and add it to the context. */
    onReference(reference: ReferenceEvidence): void;
    /** Evidence of this run that is not stored yet, such as a chat attachment. */
    pendingVersion?(id: string): EvidenceVersion | undefined;
    /** Describe each read for progress display. */
    onRead?(description: string): void;
  },
) {
  requireThat(++run.reads <= 60, 'LIMIT', 'Attempt exceeded 60 evidence reads.');
  const input = z
    .object({
      tool: z.enum(EVIDENCE_TOOLS),
      args: z.unknown(),
    })
    .strict()
    .parse(payload);
  const context = run.context;
  if (input.tool === 'reference_read') {
    const { target } = z
      .object({ target: z.string().min(1).max(2000) })
      .strict()
      .parse(input.args);
    referenceTarget(target);
    const key = target.trim().toLowerCase();
    if (!run.referenceReads.has(key)) {
      requireThat(
        run.referenceReads.size < 10,
        'LIMIT',
        'An attempt may read at most ten references.',
      );
      hooks.onRead?.(`Read reference · ${target.trim().slice(0, 80)}`);
      run.referenceReads.set(
        key,
        fetchReference(target).then((reference) => {
          hooks.onReference(reference);
          return reference;
        }),
      );
    }
    return run.referenceReads.get(key)!;
  }
  if (input.tool === 'source_read') {
    const { versionId } = z.object({ versionId: z.string().uuid() }).strict().parse(input.args);
    const pending = hooks.pendingVersion?.(versionId);
    if (pending) {
      if (!context.readVersions.includes(versionId)) context.readVersions.push(versionId);
      hooks.onRead?.(`Read attachment · ${pending.filename}`);
      return { ...pending, relPath: pending.filename, latest: true };
    }
    const version = store.verifiedVersion(versionId);
    const source = store.source(version.sourceId);
    if (!context.readVersions.includes(versionId)) context.readVersions.push(versionId);
    hooks.onRead?.(`Read note · ${store.relPath(source)}`);
    return {
      ...version,
      relPath: store.relPath(source),
      latest: source.latest === versionId,
    };
  }
  if (input.tool === 'wiki_read') {
    const { documentId } = z.object({ documentId: z.string().uuid() }).strict().parse(input.args);
    const doc = store.document(documentId);
    context.readDocuments[documentId] = doc.revision;
    hooks.onRead?.(`Read page · ${doc.title}`);
    return {
      ...doc,
      citations: store.citations(doc.id, doc.revision),
      sources: doc.sourceIds.map((sourceId) => {
        const s = store.source(sourceId);
        return {
          sourceId,
          relPath: store.relPath(s),
          latestVersionId: s.latest,
          removed: !!store.version(s.latest).removed,
        };
      }),
    };
  }
  const { query } = z
    .object({ query: z.string().max(200) })
    .strict()
    .parse(input.args);
  hooks.onRead?.(
    `${input.tool === 'source_search' ? 'Searched notes' : 'Searched pages'}${query ? ` · ${query}` : ''}`,
  );
  return input.tool === 'source_search' ? store.searchSources(query) : store.searchDocuments(query);
}
