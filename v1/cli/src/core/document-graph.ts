import type {
  ChunkRow,
  DocumentGraphEdgeInput,
  DocumentGraphEdgeKind,
  MetaDB,
  NoteRow,
} from "../stores/meta-store";

export type DocumentGraphNodeKind = "note" | "chunk" | "template";

export interface DocumentGraphNode {
  id: string;
  kind: DocumentGraphNodeKind;
  label: string;
  metadata: Record<string, unknown>;
}

export interface DocumentGraphEdge {
  fromId: string;
  toId: string;
  kind: DocumentGraphEdgeKind;
  metadata: Record<string, unknown>;
}

export interface BuildDocumentGraphOptions {
  vaultId: string;
  includeChunks?: boolean;
  limit?: number;
}

export interface DocumentGraph {
  nodes: DocumentGraphNode[];
  edges: DocumentGraphEdge[];
}

const DEFAULT_NOTE_LIMIT = 100_000;

export function buildDocumentGraph(
  metaDb: MetaDB,
  options: BuildDocumentGraphOptions,
): DocumentGraph {
  const notes = metaDb.listNotes(options.vaultId, options.limit ?? DEFAULT_NOTE_LIMIT, 0);
  const nodesById = new Map<string, DocumentGraphNode>();
  const notesByPath = new Map<string, NoteRow>();
  const edges: DocumentGraphEdge[] = [];

  for (const note of notes) {
    nodesById.set(note.id, noteNode(note));
    notesByPath.set(note.file_path, note);
  }

  for (const note of notes) {
    const sourceNoteId = resolveSourceNoteId(note, nodesById, notesByPath);
    if (sourceNoteId) {
      edges.push({
        fromId: sourceNoteId,
        toId: note.id,
        kind: "source_rewritten",
        metadata: {
          sourcePath: note.source_path,
          rewriteAgent: note.rewrite_agent,
          rewritePromptHash: note.rewrite_prompt_hash,
        },
      });
    }

    if (note.artifact_template_id) {
      const templateId = templateNodeId(note.artifact_template_id);
      if (!nodesById.has(templateId)) {
        nodesById.set(templateId, templateNode(note.artifact_template_id));
      }
      edges.push({
        fromId: templateId,
        toId: note.id,
        kind: "artifact_template",
        metadata: {
          templateId: note.artifact_template_id,
          artifactKind: note.kind,
        },
      });
    }
  }

  if (options.includeChunks) {
    for (const note of notes) {
      const chunks = metaDb.getChunksByNote(note.id);
      for (const chunk of chunks) {
        nodesById.set(chunk.id, chunkNode(chunk));
        edges.push({
          fromId: note.id,
          toId: chunk.id,
          kind: "note_chunk",
          metadata: { seqIndex: chunk.seq_index },
        });
        if (chunk.prev_chunk_id) {
          edges.push({
            fromId: chunk.id,
            toId: chunk.prev_chunk_id,
            kind: "chunk_prev",
            metadata: { seqIndex: chunk.seq_index },
          });
        }
        if (chunk.next_chunk_id) {
          edges.push({
            fromId: chunk.id,
            toId: chunk.next_chunk_id,
            kind: "chunk_next",
            metadata: { seqIndex: chunk.seq_index },
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(nodesById.values()).sort((a, b) => a.id.localeCompare(b.id)),
    edges: dedupeEdges(edges),
  };
}

export function persistDocumentGraphEdges(
  metaDb: MetaDB,
  vaultId: string,
  edges: DocumentGraphEdge[],
): void {
  metaDb.replaceDocumentGraphEdges(
    vaultId,
    edges.map((edge): DocumentGraphEdgeInput => ({
      fromId: edge.fromId,
      toId: edge.toId,
      kind: edge.kind,
      metadata: edge.metadata,
    })),
  );
}

export function refreshDocumentGraph(
  metaDb: MetaDB,
  options: BuildDocumentGraphOptions,
): DocumentGraph {
  const graph = buildDocumentGraph(metaDb, options);
  persistDocumentGraphEdges(metaDb, options.vaultId, graph.edges);
  return graph;
}

function noteNode(note: NoteRow): DocumentGraphNode {
  return {
    id: note.id,
    kind: "note",
    label: note.title ?? note.file_path,
    metadata: {
      filePath: note.file_path,
      layer: note.layer,
      kind: note.kind,
      docDate: note.doc_date,
    },
  };
}

function chunkNode(chunk: ChunkRow): DocumentGraphNode {
  return {
    id: chunk.id,
    kind: "chunk",
    label: chunk.heading ?? chunk.id,
    metadata: {
      noteId: chunk.note_id,
      seqIndex: chunk.seq_index,
      headingPath: parseJsonArray(chunk.heading_path),
    },
  };
}

function templateNode(templateId: string): DocumentGraphNode {
  return {
    id: templateNodeId(templateId),
    kind: "template",
    label: templateId,
    metadata: { templateId },
  };
}

function templateNodeId(templateId: string): string {
  return `template:${templateId}`;
}

function resolveSourceNoteId(
  note: NoteRow,
  nodesById: Map<string, DocumentGraphNode>,
  notesByPath: Map<string, NoteRow>,
): string | null {
  if (note.source_note_id && nodesById.has(note.source_note_id)) return note.source_note_id;
  if (!note.source_path) return null;
  return notesByPath.get(note.source_path)?.id ?? null;
}

function parseJsonArray(value: string | null): unknown[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function dedupeEdges(edges: DocumentGraphEdge[]): DocumentGraphEdge[] {
  const seen = new Set<string>();
  const deduped: DocumentGraphEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.fromId}\0${edge.toId}\0${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(edge);
  }
  return deduped.sort((a, b) => {
    const from = a.fromId.localeCompare(b.fromId);
    if (from !== 0) return from;
    const kind = a.kind.localeCompare(b.kind);
    if (kind !== 0) return kind;
    return a.toId.localeCompare(b.toId);
  });
}
