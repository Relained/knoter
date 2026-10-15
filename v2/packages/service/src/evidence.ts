// Bounded evidence reads shared by the wiki worker and the side chat. Each run
// reads only its frozen manifest; official references are fetched and frozen once.
import { z } from 'zod';
import type { EvidenceVersion, ReferenceEvidence, Citation } from '@knoter/contracts/native';
import type { WikiDocument } from '@knoter/contracts';
import { requireThat } from './common.js';
import { fetchMdnReference, mdnLocation } from './references.js';

export const evidenceToolNames = ['source_read', 'wiki_search', 'wiki_read', 'reference_read'];
export interface EvidenceManifest {
  sources: EvidenceVersion[];
  documents: (WikiDocument & { deletedAt?: string; citations?: Citation[] })[];
  references?: ReferenceEvidence[];
}
export interface EvidenceState {
  manifest: EvidenceManifest;
  reads: number;
  readVersions: Set<string>;
  readDocuments: Set<string>;
  referenceReads: Map<string, Promise<ReferenceEvidence>>;
}
export async function readEvidence(
  state: EvidenceState,
  payload: unknown,
  hooks: {
    /** Fence a newly fetched reference, persist it, and add it to the manifest. */
    onReference(reference: ReferenceEvidence): void;
    /** Describe each read for progress display. */
    onRead?(description: string): void;
  },
  maxReads = 40,
) {
  requireThat(++state.reads <= maxReads, 'LIMIT', `Attempt exceeded ${maxReads} evidence reads.`);
  const input = z
    .object({
      tool: z.enum(['source_read', 'wiki_search', 'wiki_read', 'reference_read']),
      args: z.unknown(),
    })
    .strict()
    .parse(payload);
  if (input.tool === 'reference_read') {
    const { path } = z
      .object({ path: z.string().max(240) })
      .strict()
      .parse(input.args);
    mdnLocation(path);
    const key = path.toLowerCase();
    if (!state.referenceReads.has(key)) {
      requireThat(
        state.referenceReads.size < 8,
        'LIMIT',
        'An attempt may fetch at most eight official references.',
      );
      hooks.onRead?.(`Checked MDN · ${path}`);
      state.referenceReads.set(
        key,
        fetchMdnReference(path).then((reference) => {
          hooks.onReference(reference);
          return reference;
        }),
      );
    }
    return state.referenceReads.get(key)!;
  }
  if (input.tool === 'source_read') {
    const { versionId } = z.object({ versionId: z.string().uuid() }).strict().parse(input.args);
    const source = state.manifest.sources.find((s) => s.id === versionId);
    requireThat(source, 'AUTH', 'Source is outside this job.');
    state.readVersions.add(versionId);
    hooks.onRead?.(`Read source · ${source.filename}`);
    return source;
  }
  if (input.tool === 'wiki_read') {
    const { documentId } = z.object({ documentId: z.string().uuid() }).strict().parse(input.args);
    const doc = state.manifest.documents.find((d) => d.id === documentId);
    requireThat(doc, 'AUTH', 'Document is outside this job.');
    state.readDocuments.add(documentId);
    hooks.onRead?.(`Read note · ${doc.title}`);
    return doc;
  }
  const { query } = z
    .object({ query: z.string().max(200) })
    .strict()
    .parse(input.args);
  hooks.onRead?.(query ? `Searched notes · ${query}` : 'Listed notes');
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return state.manifest.documents
    .map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      revision: d.revision,
      sourceIds: d.sourceIds,
      protected: d.protected,
      deletedAt: d.deletedAt ?? null,
      score: words.reduce(
        (n, w) => n + (`${d.title} ${d.body}`.toLocaleLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((d) => !words.length || d.score)
    .sort((a, b) => b.score - a.score);
}
