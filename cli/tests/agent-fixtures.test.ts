import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { installAgentScenarioFixtures } from "../src/core/agent-fixtures";
import { saveVaultConfig } from "../src/core/config";
import { refreshDocumentGraph } from "../src/core/document-graph";
import { hashContent } from "../src/pipeline/hasher";
import { parseNote } from "../src/pipeline/parser";
import { detectLanguage } from "../src/pipeline/chunker";
import { MetaDB } from "../src/stores/meta-store";
import { randomTestPath } from "./helpers/test-paths";

const VAULT_NAME = "fixture-vault";

describe("agent scenario fixtures", () => {
  test("creates rewritten and artifact fixtures from real testdata sources", async () => {
    const vaultRoot = randomTestPath("kn-agent-fixtures-vault");
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });
    await saveVaultConfig(vaultRoot, {
      embedding: { model: "nomic-embed-text" },
      search: { fusionAlpha: 0.8 },
      preprocessor: null,
    });

    try {
      await seedSources(vaultRoot, [
        "2026-03-05.md",
        "2026-05-13.md",
        "2026-05-14.md",
        "2026-05-17.md",
        "2026-05-20.md",
        "2026-05-21.md",
        "2026-05-22.md",
        "캡디llm.md",
      ]);

      const result = await installAgentScenarioFixtures({
        vaultRoot,
        vaultName: VAULT_NAME,
      });

      expect(result.sourcesConsidered).toBeGreaterThanOrEqual(8);
      expect(result.rewritten.added).toBeGreaterThanOrEqual(8);
      expect(result.artifacts.added).toBeGreaterThanOrEqual(8);
      expect(await Bun.file(result.templatePath).text()).toContain("## Wiki Update Prompt");

      const metaDb = new MetaDB(vaultRoot);
      try {
        const rewritten = metaDb.listNotesByLayer(VAULT_NAME, "rewritten", 100, 0);
        const artifacts = metaDb.listNotesByLayer(VAULT_NAME, "artifact", 100, 0);
        expect(rewritten.length).toBeGreaterThanOrEqual(8);
        expect(artifacts.map((note) => note.file_path)).toEqual(
          expect.arrayContaining([
            "artifacts/llm-wiki.md",
            "artifacts/diet/diet-dashboard.md",
            "artifacts/workout/workout-dashboard.md",
            "artifacts/tasks/task-priority.md",
            "artifacts/study/study-knowledge-base.md",
            "artifacts/reflection/reflection-log.md",
          ]),
        );

        // The llm-wiki fixture is part of default search; other artifact
        // kinds still require includeArtifacts.
        const wikiNote = artifacts.find((note) => note.file_path === "artifacts/llm-wiki.md");
        const wikiHits = metaDb.searchFts("deterministic", 10, VAULT_NAME);
        expect(wikiHits.some((row) => row.noteId === wikiNote?.id)).toBe(true);

        expect(rewritten.every((note) => note.source_path?.startsWith("sources/"))).toBe(true);
        expect(rewritten.every((note) => note.rewrite_agent === "deterministic-test-agent")).toBe(true);
        expect(rewritten.every((note) => note.rewrite_prompt_hash === "artifact-workflow-v4-test-fixture")).toBe(true);
        expect(artifacts.every((note) => !!note.artifact_template_id)).toBe(true);

        expect(metaDb.searchFts("공부", 10, VAULT_NAME).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("식사량 그래프", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("운동량 그래프", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("Task 우선순위", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("회고록", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);

        const edges = metaDb.listDocumentGraphEdges(VAULT_NAME);
        expect(edges.some((edge) => edge.kind === "source_rewritten")).toBe(true);
        expect(edges.some((edge) => edge.kind === "artifact_template")).toBe(true);
        expect(edges.some((edge) => edge.kind === "note_chunk")).toBe(true);
      } finally {
        metaDb.close();
      }
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });
});

async function seedSources(vaultRoot: string, fileNames: string[]): Promise<void> {
  const testdataRoot = join(process.cwd(), "..", "testdata");
  const metaDb = new MetaDB(vaultRoot);
  try {
    for (const fileName of fileNames) {
      const absPath = join(testdataRoot, fileName);
      const content = await Bun.file(absPath).text();
      const parsed = parseNote(content, fileName);
      const date = parsed.docDate ?? "undated";
      const relPath = `sources/${date}/${basename(fileName)}`;
      await Bun.write(join(vaultRoot, relPath), content);
      metaDb.reindexNote(
        {
          id: randomUUID(),
          vaultId: VAULT_NAME,
          filePath: relPath,
          title: parsed.title,
          fileHash: hashContent(content),
          frontmatter: parsed.frontmatter as Record<string, string>,
          docDate: parsed.docDate ?? undefined,
          layer: "source",
          kind: parsed.kind,
          createdAt: new Date(),
          updatedAt: new Date(),
          language: detectLanguage(parsed.content),
        },
        [],
        [],
      );
    }
    refreshDocumentGraph(metaDb, { vaultId: VAULT_NAME, includeChunks: true });
  } finally {
    metaDb.close();
  }
}
