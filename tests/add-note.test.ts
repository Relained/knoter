import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MetaDB } from "../src/stores/meta-store";
import { addMarkdownNoteToVault } from "../src/core/add-note";

describe("addMarkdownNoteToVault", () => {
  test("adds rewritten markdown note, persists chunks, and marks synced", async () => {
    const vaultRoot = join("/tmp", `kn-add-note-${randomUUID()}`);
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

  test("rolls back metadata when embedding fails", async () => {
    const vaultRoot = join("/tmp", `kn-add-note-fail-${randomUUID()}`);
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
    const vaultRoot = join("/tmp", `kn-add-note-update-fail-${randomUUID()}`);
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
