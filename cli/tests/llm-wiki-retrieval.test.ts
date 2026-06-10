import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { MetaDB } from "../src/stores/meta-store";
import { buildReportContextBundle } from "../src/core/report-context";
import { randomTestPath } from "./helpers/test-paths";

const VAULT_NAME = "wiki-vault";
const TARGET_DATE = "2026-06-10";

function createFixture(): { vaultRoot: string; cleanup: () => void } {
  const vaultRoot = randomTestPath("kn-wiki-retrieval-vault");
  mkdirSync(join(vaultRoot, ".kn"), { recursive: true });

  const metaDb = new MetaDB(vaultRoot);
  try {
    metaDb.upsertNote({
      id: "note_rewritten",
      vaultId: VAULT_NAME,
      filePath: "rewritten/2026-06-10/daily.md",
      title: "Rewritten daily note",
      fileHash: "hash-rewritten",
      docDate: TARGET_DATE,
      layer: "rewritten",
      kind: "daily",
      language: "latin",
    });
    metaDb.upsertNote({
      id: "note_wiki",
      vaultId: VAULT_NAME,
      filePath: "artifacts/llm-wiki.md",
      title: "LLM Wiki",
      fileHash: "hash-wiki",
      layer: "artifact",
      kind: "llm-wiki",
      language: "latin",
    });
    metaDb.upsertNote({
      id: "note_report",
      vaultId: VAULT_NAME,
      filePath: "artifacts/2026-06-10/daily-report.md",
      title: "Daily report artifact",
      fileHash: "hash-report",
      docDate: TARGET_DATE,
      layer: "artifact",
      kind: "daily-report",
      language: "latin",
    });

    metaDb.insertChunks([
      {
        id: "chunk_rewritten",
        noteId: "note_rewritten",
        heading: "today",
        content: "knoter planning evidence task alpha",
        offsetStart: 0,
        offsetEnd: 36,
        tokenCount: 6,
        seqIndex: 0,
      },
      {
        id: "chunk_wiki",
        noteId: "note_wiki",
        heading: "overview",
        content: "knoter planning durable wiki knowledge alpha",
        offsetStart: 0,
        offsetEnd: 45,
        tokenCount: 7,
        seqIndex: 0,
      },
      {
        id: "chunk_report",
        noteId: "note_report",
        heading: "report",
        content: "knoter planning generated report alpha",
        offsetStart: 0,
        offsetEnd: 39,
        tokenCount: 6,
        seqIndex: 0,
      },
    ]);

    metaDb.markSynced("note_rewritten");
    metaDb.markSynced("note_wiki");
    metaDb.markSynced("note_report");
  } finally {
    metaDb.close();
  }

  return {
    vaultRoot,
    cleanup: () => rmSync(vaultRoot, { recursive: true, force: true }),
  };
}

const templateOverride = {
  source: "vault" as const,
  path: "/tmp/template.md",
  content: "# Test Template",
  metadata: { id: "wiki-retrieval-template" },
};

describe("llm-wiki default retrieval", () => {
  test("searchFts includes llm-wiki artifacts by default and all artifacts on request", () => {
    const fixture = createFixture();
    const metaDb = new MetaDB(fixture.vaultRoot);
    try {
      const defaults = metaDb.searchFts("knoter planning", 10, VAULT_NAME);
      const defaultIds = defaults.map((row) => row.noteId).sort();
      expect(defaultIds).toEqual(["note_rewritten", "note_wiki"]);

      const widened = metaDb.searchFts("knoter planning", 10, VAULT_NAME, 0, true);
      const widenedIds = widened.map((row) => row.noteId).sort();
      expect(widenedIds).toEqual(["note_report", "note_rewritten", "note_wiki"]);
    } finally {
      metaDb.close();
      fixture.cleanup();
    }
  });

  test("report retrieval surfaces llm-wiki rows despite the date scope", async () => {
    const fixture = createFixture();
    const metaDb = new MetaDB(fixture.vaultRoot);
    try {
      const bundle = await buildReportContextBundle({
        metaDb,
        vaultName: VAULT_NAME,
        date: TARGET_DATE,
        layer: "rewritten",
        top: 20,
        includeArtifacts: false,
        templateOverride,
      });

      const groups = (bundle.retrieval as { groups: Record<string, { results: Array<{ noteId: string; note: { kind: string | null } }> }> }).groups;
      const rows = Object.values(groups).flatMap((group) => group.results);
      expect(rows.some((row) => row.noteId === "note_wiki")).toBe(true);
      expect(rows.some((row) => row.noteId === "note_rewritten")).toBe(true);
      expect(rows.some((row) => row.noteId === "note_report")).toBe(false);
    } finally {
      metaDb.close();
      fixture.cleanup();
    }
  });

  test("artifact layer without includeArtifacts retrieves only llm-wiki rows", async () => {
    const fixture = createFixture();
    const metaDb = new MetaDB(fixture.vaultRoot);
    try {
      const wikiOnly = await buildReportContextBundle({
        metaDb,
        vaultName: VAULT_NAME,
        date: TARGET_DATE,
        layer: "artifact",
        top: 20,
        includeArtifacts: false,
        templateOverride,
      });
      const wikiGroups = (wikiOnly.retrieval as { groups: Record<string, { results: Array<{ noteId: string }> }> }).groups;
      const wikiRows = Object.values(wikiGroups).flatMap((group) => group.results);
      expect(wikiRows.length).toBeGreaterThan(0);
      expect(wikiRows.every((row) => row.noteId === "note_wiki")).toBe(true);

      const widened = await buildReportContextBundle({
        metaDb,
        vaultName: VAULT_NAME,
        date: TARGET_DATE,
        layer: "artifact",
        top: 20,
        includeArtifacts: true,
        templateOverride,
      });
      const widenedGroups = (widened.retrieval as { groups: Record<string, { results: Array<{ noteId: string }> }> }).groups;
      const widenedRows = Object.values(widenedGroups).flatMap((group) => group.results);
      expect(widenedRows.some((row) => row.noteId === "note_report")).toBe(true);
    } finally {
      metaDb.close();
      fixture.cleanup();
    }
  });
});
