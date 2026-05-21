import { afterEach, describe, expect, test } from "bun:test";
import {
  buildDocumentGraph,
  persistDocumentGraphEdges,
} from "../src/core/document-graph";
import { MetaDB } from "../src/stores/meta-store";

describe("document graph", () => {
  let db: MetaDB | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  test("builds note lineage and artifact template graph edges", () => {
    db = MetaDB.openInMemory();
    seedGraphFixture(db);

    const graph = buildDocumentGraph(db, { vaultId: "personal" });

    expect(graph.nodes.map((node) => node.id)).toContain("source_1");
    expect(graph.nodes.map((node) => node.id)).toContain("template:daily-report");
    expect(graph.nodes.some((node) => node.kind === "chunk")).toBe(false);
    expect(graph.edges).toContainEqual({
      fromId: "source_1",
      toId: "rewritten_1",
      kind: "source_rewritten",
      metadata: {
        sourcePath: "sources/2026-05-08/raw.md",
        rewriteAgent: "codex",
        rewritePromptHash: "prompt-hash",
      },
    });
    expect(graph.edges).toContainEqual({
      fromId: "template:daily-report",
      toId: "artifact_1",
      kind: "artifact_template",
      metadata: {
        templateId: "daily-report",
        artifactKind: "daily-report",
      },
    });
  });

  test("resolves source lineage from source_path when source_note_id is absent", () => {
    db = MetaDB.openInMemory();
    seedGraphFixture(db);
    db.upsertNote({
      id: "rewritten_path_only",
      vaultId: "personal",
      filePath: "rewritten/2026-05-08/path-only.md",
      title: "Path only lineage",
      fileHash: "path-only-hash",
      docDate: "2026-05-08",
      layer: "rewritten",
      lineage: {
        sourcePath: "sources/2026-05-08/raw.md",
      },
    });

    const graph = buildDocumentGraph(db, { vaultId: "personal" });

    expect(graph.edges).toContainEqual({
      fromId: "source_1",
      toId: "rewritten_path_only",
      kind: "source_rewritten",
      metadata: {
        sourcePath: "sources/2026-05-08/raw.md",
        rewriteAgent: null,
        rewritePromptHash: null,
      },
    });
  });

  test("includes note-to-chunk and prev/next chunk edges when requested", () => {
    db = MetaDB.openInMemory();
    seedGraphFixture(db);

    const graph = buildDocumentGraph(db, {
      vaultId: "personal",
      includeChunks: true,
    });

    expect(graph.nodes.map((node) => node.id)).toContain("chunk_rewritten_1");
    expect(graph.edges).toContainEqual({
      fromId: "rewritten_1",
      toId: "chunk_rewritten_1",
      kind: "note_chunk",
      metadata: { seqIndex: 0 },
    });
    expect(graph.edges).toContainEqual({
      fromId: "chunk_rewritten_1",
      toId: "chunk_rewritten_2",
      kind: "chunk_next",
      metadata: { seqIndex: 0 },
    });
    expect(graph.edges).toContainEqual({
      fromId: "chunk_rewritten_2",
      toId: "chunk_rewritten_1",
      kind: "chunk_prev",
      metadata: { seqIndex: 1 },
    });
  });

  test("persists generated graph edges to sqlite", () => {
    db = MetaDB.openInMemory();
    seedGraphFixture(db);

    const graph = buildDocumentGraph(db, {
      vaultId: "personal",
      includeChunks: true,
    });
    persistDocumentGraphEdges(db, "personal", graph.edges);

    const rows = db.listDocumentGraphEdges("personal");
    expect(rows.map((row) => row.kind)).toContain("source_rewritten");
    expect(rows.map((row) => row.kind)).toContain("artifact_template");
    expect(rows.map((row) => row.kind)).toContain("note_chunk");
    expect(rows.find((row) => row.kind === "note_chunk")!.metadata_json).toBeTruthy();
  });
});

function seedGraphFixture(db: MetaDB): void {
  db.upsertNote({
    id: "source_1",
    vaultId: "personal",
    filePath: "sources/2026-05-08/raw.md",
    title: "Raw source",
    fileHash: "source-hash",
    docDate: "2026-05-08",
    layer: "source",
  });
  db.upsertNote({
    id: "rewritten_1",
    vaultId: "personal",
    filePath: "rewritten/2026-05-08/daily.md",
    title: "Rewritten daily",
    fileHash: "rewritten-hash",
    docDate: "2026-05-08",
    layer: "rewritten",
    kind: "daily",
    lineage: {
      sourceNoteId: "source_1",
      sourcePath: "sources/2026-05-08/raw.md",
      rewriteAgent: "codex",
      rewritePromptHash: "prompt-hash",
    },
  });
  db.upsertNote({
    id: "artifact_1",
    vaultId: "personal",
    filePath: "artifacts/2026-05-08/daily-report.md",
    title: "Daily report",
    fileHash: "artifact-hash",
    docDate: "2026-05-08",
    layer: "artifact",
    kind: "daily-report",
    lineage: {
      artifactTemplateId: "daily-report",
    },
  });
  db.upsertNote({
    id: "other_vault_source",
    vaultId: "other",
    filePath: "sources/other.md",
    fileHash: "other-hash",
    layer: "source",
  });
  db.insertChunks([
    {
      id: "chunk_rewritten_1",
      noteId: "rewritten_1",
      heading: "First",
      headingPath: ["# Daily", "## First"],
      content: "first chunk",
      offsetStart: 0,
      offsetEnd: 11,
      tokenCount: 2,
      seqIndex: 0,
      nextChunkId: "chunk_rewritten_2",
    },
    {
      id: "chunk_rewritten_2",
      noteId: "rewritten_1",
      heading: "Second",
      content: "second chunk",
      offsetStart: 12,
      offsetEnd: 24,
      tokenCount: 2,
      seqIndex: 1,
      prevChunkId: "chunk_rewritten_1",
    },
  ]);
}
