import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MetaDB } from "../src/stores/meta-store";
import { buildReportContextBundle } from "../src/core/report-context";
import { buildTemplateGetPayload, createMcpServer } from "../src/mcp/server";

const TARGET_DATE = "2026-05-08";

async function createFixture(): Promise<{
  knHome: string;
  vaultRoot: string;
  cleanup: () => void;
}> {
  const knHome = join("/tmp", `kn-mcp-home-${randomUUID()}`);
  const vaultRoot = join("/tmp", `kn-mcp-vault-${randomUUID()}`);
  const vaultName = "work";
  const vaultKnDir = join(vaultRoot, ".kn");
  const templatePath = join(vaultKnDir, "template.md");

  mkdirSync(knHome, { recursive: true });
  mkdirSync(vaultKnDir, { recursive: true });

  await Bun.write(
    join(knHome, "config.json"),
    JSON.stringify(
      {
        activeVault: vaultName,
        vaults: {
          [vaultName]: {
            name: vaultName,
            path: vaultRoot,
          },
        },
      },
      null,
      2,
    ),
  );

  await Bun.write(
    templatePath,
    ["---", "id: mcp-template", "---", "", "# MCP Template", ""].join("\n"),
  );

  const metaDb = new MetaDB(vaultRoot);
  try {
    metaDb.upsertNote({
      id: "note_rewritten_1",
      vaultId: vaultName,
      filePath: "rewritten/2026-05-08/daily.md",
      title: "Rewritten daily note",
      fileHash: "hash-rewritten-1",
      docDate: TARGET_DATE,
      layer: "rewritten",
      kind: "daily",
      language: "mixed",
    });
    metaDb.upsertNote({
      id: "note_artifact_1",
      vaultId: vaultName,
      filePath: "artifacts/2026-05-08/daily-report.md",
      title: "Artifact report",
      fileHash: "hash-artifact-1",
      docDate: TARGET_DATE,
      layer: "artifact",
      kind: "daily-report",
      language: "mixed",
    });

    metaDb.insertChunks([
      {
        id: "chunk_rewritten_1",
        noteId: "note_rewritten_1",
        heading: "daily",
        content: "task todo 할 일 해야 할 것 완료 미완료",
        offsetStart: 0,
        offsetEnd: 40,
        tokenCount: 10,
        seqIndex: 0,
      },
      {
        id: "chunk_artifact_1",
        noteId: "note_artifact_1",
        heading: "artifact",
        content: "2026-05-08 artifact workout summary",
        offsetStart: 0,
        offsetEnd: 35,
        tokenCount: 6,
        seqIndex: 0,
      },
    ]);
    metaDb.markSynced("note_rewritten_1");
    metaDb.markSynced("note_artifact_1");
  } finally {
    metaDb.close();
  }

  return {
    knHome,
    vaultRoot,
    cleanup: () => {
      rmSync(knHome, { recursive: true, force: true });
      rmSync(vaultRoot, { recursive: true, force: true });
    },
  };
}

describe("mcp payload helpers", () => {
  test("MCP server registers template and report context tools", async () => {
    const fixture = await createFixture();
    try {
      const server = await createMcpServer(fixture.vaultRoot, "work");
      try {
        const tools = (server as any)._registeredTools as Record<string, unknown>;
        expect(Object.keys(tools)).toContain("kn_template_get");
        expect(Object.keys(tools)).toContain("kn_report_context");
      } finally {
        ((server as any).__metaDb as MetaDB | undefined)?.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  test("kn_template_get payload includes source info, metadata/content aliases, and validation state", async () => {
    const fixture = await createFixture();
    try {
      const payload = await buildTemplateGetPayload(fixture.vaultRoot);
      expect(payload).toEqual(
        expect.objectContaining({
          source: "vault",
          path: expect.stringContaining("/.kn/template.md"),
          content: expect.stringContaining("# MCP Template"),
          body: expect.stringContaining("# MCP Template"),
          text: expect.stringContaining("# MCP Template"),
          metadata: expect.objectContaining({ id: "mcp-template" }),
          validation: expect.objectContaining({
            valid: true,
            hasFrontmatter: true,
          }),
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("shared report-context builder excludes artifacts by default and returns artifact rows when layer is artifact", async () => {
    const fixture = await createFixture();
    const metaDb = new MetaDB(fixture.vaultRoot);
    try {
      const defaultBundle = await buildReportContextBundle({
        metaDb,
        vaultName: "work",
        date: TARGET_DATE,
        layer: "rewritten",
        top: 20,
        includeArtifacts: false,
        templateOverride: {
          source: "vault",
          path: join(fixture.vaultRoot, ".kn", "template.md"),
          content: "# MCP Template",
          metadata: { id: "mcp-template" },
        },
      });

      const defaultPaths = (defaultBundle.dailyNotes as Array<any>).map((n) => n.filePath);
      expect(defaultPaths.some((p) => String(p).includes("/artifacts/") || String(p).startsWith("artifacts/"))).toBe(false);

      const artifactBundle = await buildReportContextBundle({
        metaDb,
        vaultName: "work",
        date: TARGET_DATE,
        layer: "artifact",
        top: 20,
        includeArtifacts: false,
        templateOverride: {
          source: "vault",
          path: join(fixture.vaultRoot, ".kn", "template.md"),
          content: "# MCP Template",
          metadata: { id: "mcp-template" },
        },
      });

      const groups = (artifactBundle.retrieval as any).groups as Record<string, any>;
      const rows = Object.values(groups).flatMap((group: any) => group.results as Array<any>);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.note?.layer === "artifact")).toBe(true);
    } finally {
      metaDb.close();
      fixture.cleanup();
    }
  });
});
