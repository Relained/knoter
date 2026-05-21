import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { MetaDB } from "../src/stores/meta-store";
import { addMarkdownNoteToVault } from "../src/core/add-note";
import { randomTestPath } from "./helpers/test-paths";

describe("addMarkdownNoteToVault", () => {
  test("adds rewritten markdown note, persists chunks, and marks synced", async () => {
    const vaultRoot = randomTestPath("kn-add-note");
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

    const upsertCalls: unknown[][] = [];
    const result = await addMarkdownNoteToVault({
      vaultRoot,
      vaultName: "work",
      relPath: "rewritten/2026-05-08/new-note.md",
      content: [
        "---",
        "title: New Rewritten",
        "layer: rewritten",
        "kind: daily",
        "doc_date: 2026-05-08",
        "---",
        "",
        "# New Rewritten",
        "",
        "Plan the day and review tasks.",
      ].join("\n"),
      tags: ["manual-tag"],
      embedProvider: {
        name: "fake",
        isLocal: true,
        async embed(texts: string[]): Promise<number[][]> {
          return texts.map(() => [0.1, 0.2, 0.3]);
        },
      },
      vectorCollection: {
        upsertSync(docs: unknown[]): void {
          upsertCalls.push(docs);
        },
      },
    });

    const metaDb = new MetaDB(vaultRoot);
    try {
      const note = metaDb.getNoteByPath("work", "rewritten/2026-05-08/new-note.md");
      expect(note).toBeTruthy();
      expect(note?.layer).toBe("rewritten");
      expect(note?.kind).toBe("daily");
      expect(note?.vector_sync_status).toBe("synced");
      const chunks = note ? metaDb.getChunksByNote(note.id) : [];
      expect(chunks.length).toBeGreaterThan(0);
      const tags = note ? metaDb.getTagsByNote(note.id).map((t) => t.tag) : [];
      expect(tags).toContain("manual-tag");
    } finally {
      metaDb.close();
      rmSync(vaultRoot, { recursive: true, force: true });
    }

    expect(result.status).toBe("added");
    expect(result.layer).toBe("rewritten");
    expect(result.kind).toBe("daily");
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(upsertCalls.length).toBe(1);
  });

  test("persists rewritten source lineage from frontmatter", async () => {
    const vaultRoot = randomTestPath("kn-add-note-lineage");
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

    const seedDb = new MetaDB(vaultRoot);
    try {
      seedDb.upsertNote({
        id: "source-1",
        vaultId: "work",
        filePath: "sources/2026-05-08/raw.md",
        title: "Raw source",
        fileHash: "source-hash",
        docDate: "2026-05-08",
        layer: "source",
        kind: "source",
      });
    } finally {
      seedDb.close();
    }

    await addMarkdownNoteToVault({
      vaultRoot,
      vaultName: "work",
      relPath: "rewritten/2026-05-08/lineage-note.md",
      content: [
        "---",
        "title: Lineage Rewritten",
        "layer: rewritten",
        "kind: daily",
        "doc_date: 2026-05-08",
        "source_note_id: source-1",
        "source_path: sources/2026-05-08/raw.md",
        "rewrite_agent: codex",
        "rewrite_prompt_hash: prompt-hash-1",
        "---",
        "",
        "# Lineage Rewritten",
        "",
        "한국어 하이브리드 검색과 임베딩 테스트.",
      ].join("\n"),
      embedProvider: {
        name: "fake",
        isLocal: true,
        async embed(texts: string[]): Promise<number[][]> {
          return texts.map(() => [0.1, 0.2, 0.3]);
        },
      },
      vectorCollection: {
        upsertSync(): void {},
      },
    });

    const metaDb = new MetaDB(vaultRoot);
    try {
      const note = metaDb.getNoteByPath("work", "rewritten/2026-05-08/lineage-note.md");
      expect(note?.source_note_id).toBe("source-1");
      expect(note?.source_path).toBe("sources/2026-05-08/raw.md");
      expect(note?.rewrite_agent).toBe("codex");
      expect(note?.rewrite_prompt_hash).toBe("prompt-hash-1");
      expect(metaDb.listDocumentGraphEdges("work")).toContainEqual(
        expect.objectContaining({
          from_id: "source-1",
          to_id: note?.id,
          kind: "source_rewritten",
        }),
      );
    } finally {
      metaDb.close();
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });

  test("stores source path and graph edge when frontmatter source_note_id is stale", async () => {
    const vaultRoot = randomTestPath("kn-add-note-stale-lineage");
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

    const seedDb = new MetaDB(vaultRoot);
    try {
      seedDb.upsertNote({
        id: "source-current",
        vaultId: "work",
        filePath: "sources/2026-05-08/raw.md",
        title: "Current source",
        fileHash: "source-hash",
        docDate: "2026-05-08",
        layer: "source",
      });
    } finally {
      seedDb.close();
    }

    await addMarkdownNoteToVault({
      vaultRoot,
      vaultName: "work",
      relPath: "rewritten/2026-05-08/stale-lineage-note.md",
      content: [
        "---",
        "title: Stale Lineage Rewritten",
        "layer: rewritten",
        "doc_date: 2026-05-08",
        "source_note_id: source-stale",
        "source_path: sources/2026-05-08/raw.md",
        "---",
        "",
        "# Stale Lineage Rewritten",
        "",
        "The source path should keep graph lineage usable.",
      ].join("\n"),
      embedProvider: {
        name: "fake",
        isLocal: true,
        async embed(texts: string[]): Promise<number[][]> {
          return texts.map(() => [0.1, 0.2, 0.3]);
        },
      },
      vectorCollection: {
        upsertSync(): void {},
      },
    });

    const metaDb = new MetaDB(vaultRoot);
    try {
      const note = metaDb.getNoteByPath("work", "rewritten/2026-05-08/stale-lineage-note.md");
      expect(note?.source_note_id).toBeNull();
      expect(note?.source_path).toBe("sources/2026-05-08/raw.md");
      expect(metaDb.listDocumentGraphEdges("work")).toContainEqual(
        expect.objectContaining({
          from_id: "source-current",
          to_id: note?.id,
          kind: "source_rewritten",
        }),
      );
    } finally {
      metaDb.close();
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });

  test("rolls back metadata when embedding fails", async () => {
    const vaultRoot = randomTestPath("kn-add-note-fail");
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

    await expect(
      addMarkdownNoteToVault({
        vaultRoot,
        vaultName: "work",
        relPath: "rewritten/2026-05-08/failing-note.md",
        content: [
          "---",
          "layer: rewritten",
          "doc_date: 2026-05-08",
          "---",
          "",
          "# Failing Note",
          "",
          "This note should not remain in metadata after embedding failure.",
        ].join("\n"),
        embedProvider: {
          name: "failing",
          isLocal: true,
          async embed(): Promise<number[][]> {
            throw new Error("embedding unavailable");
          },
        },
        vectorCollection: {
          upsertSync(): void {
            throw new Error("should not upsert");
          },
        },
      }),
    ).rejects.toThrow("Failed to embed chunks");

    const metaDb = new MetaDB(vaultRoot);
    try {
      const note = metaDb.getNoteByPath("work", "rewritten/2026-05-08/failing-note.md");
      expect(note).toBeNull();
    } finally {
      metaDb.close();
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });

  test("restores existing note and file when vector sync fails during update", async () => {
    const vaultRoot = randomTestPath("kn-add-note-update-fail");
    const relPath = "rewritten/2026-05-08/update-note.md";
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

    const fakeProvider = {
      name: "fake",
      isLocal: true,
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [0.1, 0.2, 0.3]);
      },
    };

    await addMarkdownNoteToVault({
      vaultRoot,
      vaultName: "work",
      relPath,
      content: [
        "---",
        "title: Original",
        "layer: rewritten",
        "doc_date: 2026-05-08",
        "---",
        "",
        "# Original",
        "",
        "Original body.",
      ].join("\n"),
      embedProvider: fakeProvider,
      vectorCollection: {
        upsertSync(): void {},
      },
    });

    await expect(
      addMarkdownNoteToVault({
        vaultRoot,
        vaultName: "work",
        relPath,
        content: [
          "---",
          "title: Updated",
          "layer: rewritten",
          "doc_date: 2026-05-08",
          "---",
          "",
          "# Updated",
          "",
          "Updated body.",
        ].join("\n"),
        embedProvider: fakeProvider,
        vectorCollection: {
          upsertSync(): void {
            throw new Error("vector unavailable");
          },
          deleteSync(): void {
            throw new Error("old vectors should not be deleted before upsert");
          },
        },
      }),
    ).rejects.toThrow("Failed to sync vectors");

    const metaDb = new MetaDB(vaultRoot);
    try {
      const note = metaDb.getNoteByPath("work", relPath);
      expect(note?.title).toBe("Original");
      expect(note?.vector_sync_status).toBe("synced");
      const chunks = note ? metaDb.getChunksByNote(note.id) : [];
      expect(chunks.map((chunk) => chunk.content).join("\n")).toContain("Original body.");
    } finally {
      metaDb.close();
    }

    const fileContent = await Bun.file(join(vaultRoot, relPath)).text();
    expect(fileContent).toContain("# Original");
    expect(fileContent).not.toContain("# Updated");

    rmSync(vaultRoot, { recursive: true, force: true });
  });
});
