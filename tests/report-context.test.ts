import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MetaDB } from "../src/stores/meta-store";

const TARGET_DATE = "2026-05-08";
const ARTIFACT_PATH = "artifacts/2026-05-08/daily-report.md";
const REWRITTEN_PATH = "rewritten/2026-05-08/daily.md";
const SOURCE_PATH = "sources/2026-05-08/raw-note.md";

async function runCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout, stderr };
}

async function createFixture(): Promise<{
  knHome: string;
  vaultRoot: string;
  cleanup: () => void;
}> {
  const knHome = join("/tmp", `kn-report-home-${randomUUID()}`);
  const vaultRoot = join("/tmp", `kn-report-vault-${randomUUID()}`);
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
    [
      "---",
      "id: vault-daily-report",
      "name: Vault Daily Report",
      "---",
      "",
      "# Vault Daily Report Template",
      "",
      "Template fixture for report context tests.",
    ].join("\n"),
  );

  const metaDb = new MetaDB(vaultRoot);
  try {
    metaDb.upsertNote({
      id: "note_source_1",
      vaultId: vaultName,
      filePath: "sources/2026-05-08/raw-note.md",
      title: "Raw source",
      fileHash: "hash-source-1",
      docDate: TARGET_DATE,
      layer: "source",
      kind: "daily-source",
      language: "mixed",
    });

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
      title: "Daily report artifact",
      fileHash: "hash-artifact-1",
      docDate: TARGET_DATE,
      layer: "artifact",
      kind: "daily-report",
      language: "mixed",
    });

    metaDb.upsertNote({
      id: "note_prev_rewritten_1",
      vaultId: vaultName,
      filePath: "rewritten/2026-05-07/daily.md",
      title: "Previous rewritten daily note",
      fileHash: "hash-prev-rewritten-1",
      docDate: "2026-05-07",
      layer: "rewritten",
      kind: "daily",
      language: "mixed",
    });

    metaDb.upsertNote({
      id: "note_prev_source_1",
      vaultId: vaultName,
      filePath: "sources/2026-05-03/raw-note.md",
      title: "Previous source note",
      fileHash: "hash-prev-source-1",
      docDate: "2026-05-03",
      layer: "source",
      kind: "daily-source",
      language: "mixed",
    });

    metaDb.upsertNote({
      id: "note_prev_artifact_1",
      vaultId: vaultName,
      filePath: "artifacts/2026-05-06/daily-report.md",
      title: "Previous artifact note",
      fileHash: "hash-prev-artifact-1",
      docDate: "2026-05-06",
      layer: "artifact",
      kind: "daily-report",
      language: "mixed",
    });

    metaDb.insertChunks([
      {
        id: "chunk_source_1",
        noteId: "note_source_1",
        heading: "source",
        content:
          "2026-05-08 source note todo list for knoter planning",
        offsetStart: 0,
        offsetEnd: 56,
        tokenCount: 11,
        seqIndex: 0,
      },
      {
        id: "chunk_rewritten_1",
        noteId: "note_rewritten_1",
        heading: "오늘",
        content:
          "2026-05-08 task todo 할 일 완료 미완료 운동 러닝 5km pushup 30회 llm-wiki knoter daily-workout-graph",
        offsetStart: 0,
        offsetEnd: 130,
        tokenCount: 30,
        seqIndex: 0,
      },
      {
        id: "chunk_artifact_1",
        noteId: "note_artifact_1",
        heading: "artifact",
        content:
          "2026-05-08 artifact todo workout summary knoter generated report",
        offsetStart: 0,
        offsetEnd: 78,
        tokenCount: 15,
        seqIndex: 0,
      },
      {
        id: "chunk_prev_rewritten_1",
        noteId: "note_prev_rewritten_1",
        heading: "어제",
        content:
          "2026-05-07 task todo keep open tasks and workout continuity",
        offsetStart: 0,
        offsetEnd: 90,
        tokenCount: 16,
        seqIndex: 0,
      },
      {
        id: "chunk_prev_source_1",
        noteId: "note_prev_source_1",
        heading: "source",
        content: "2026-05-03 source note area llm-wiki follow-up",
        offsetStart: 0,
        offsetEnd: 68,
        tokenCount: 12,
        seqIndex: 0,
      },
      {
        id: "chunk_prev_artifact_1",
        noteId: "note_prev_artifact_1",
        heading: "artifact",
        content: "2026-05-06 artifact generated summary",
        offsetStart: 0,
        offsetEnd: 50,
        tokenCount: 8,
        seqIndex: 0,
      },
    ]);

    metaDb.markSynced("note_source_1");
    metaDb.markSynced("note_rewritten_1");
    metaDb.markSynced("note_artifact_1");
    metaDb.markSynced("note_prev_rewritten_1");
    metaDb.markSynced("note_prev_source_1");
    metaDb.markSynced("note_prev_artifact_1");

    metaDb.addNoteSignal({
      noteId: "note_rewritten_1",
      chunkId: "chunk_rewritten_1",
      kind: "task",
      key: "open",
      value: { text: "finish report context", status: "open" },
      source: "fixture",
    });
    metaDb.addNoteSignal({
      noteId: "note_rewritten_1",
      chunkId: "chunk_rewritten_1",
      kind: "workout",
      key: "pushup",
      value: { name: "pushup", count: 30, sets: 3 },
      source: "fixture",
    });
    metaDb.addNoteSignal({
      noteId: "note_prev_rewritten_1",
      chunkId: "chunk_prev_rewritten_1",
      kind: "task",
      key: "open",
      value: { text: "carry unfinished task", status: "open" },
      source: "fixture",
    });
    metaDb.addNoteSignal({
      noteId: "note_prev_rewritten_1",
      chunkId: "chunk_prev_rewritten_1",
      kind: "workout",
      key: "run",
      value: { name: "run", distanceKm: 5 },
      source: "fixture",
    });
    metaDb.addNoteSignal({
      noteId: "note_prev_source_1",
      chunkId: "chunk_prev_source_1",
      kind: "area",
      key: "llm-wiki",
      value: { area: "llm-wiki", status: "active" },
      source: "fixture",
    });
    metaDb.addNoteSignal({
      noteId: "note_prev_artifact_1",
      chunkId: "chunk_prev_artifact_1",
      kind: "task",
      key: "artifact-task",
      value: { text: "artifact-only task", status: "open" },
      source: "fixture",
    });
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

function seedOutOfDateCrowdingRows(vaultRoot: string): void {
  const metaDb = new MetaDB(vaultRoot);
  try {
    for (let i = 0; i < 24; i += 1) {
      const noteId = `noise_note_${i}`;
      const chunkId = `noise_chunk_${i}`;
      metaDb.upsertNote({
        id: noteId,
        vaultId: "work",
        filePath: `rewritten/2026-05-07/noise-${i}.md`,
        title: `Noise ${i}`,
        fileHash: `noise-hash-${i}`,
        docDate: "2026-05-07",
        layer: "rewritten",
        kind: "daily",
        language: "mixed",
      });
      metaDb.insertChunks([
        {
          id: chunkId,
          noteId,
          heading: "noise",
          content:
            "task todo 할 일 해야 할 것 완료 미완료 task todo 할 일 해야 할 것 완료 미완료 knoter",
          offsetStart: 0,
          offsetEnd: 200,
          tokenCount: 40,
          seqIndex: 0,
        },
      ]);
      metaDb.markSynced(noteId);
    }
  } finally {
    metaDb.close();
  }
}

function flattenRetrievalRows(envelope: any): Array<any> {
  return Object.values(envelope.data.retrieval.groups).flatMap(
    (group: any) => group.results as Array<any>,
  );
}

describe("report context command", () => {
  test("returns JSON context bundle with template, notes, signals, and enriched FTS retrieval", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        ["--format", "json", "report", "context", "--date", TARGET_DATE],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");

      const envelope = JSON.parse(result.stdout);
      expect(envelope).toEqual(
        expect.objectContaining({
          ok: true,
          command: "report context",
          vault: "work",
        }),
      );
      expect(envelope.data).toEqual(
        expect.objectContaining({
          date: TARGET_DATE,
          documentLayer: "rewritten",
          includeArtifacts: false,
          templateId: "vault-daily-report",
        }),
      );

      expect(envelope.data.template).toEqual(
        expect.objectContaining({
          source: "vault",
          path: expect.stringContaining("/.kn/template.md"),
          content: expect.stringContaining("# Vault Daily Report Template"),
          metadata: expect.objectContaining({
            id: "vault-daily-report",
          }),
        }),
      );

      const sourcePaths = (envelope.data.sourceInventory as Array<any>).map((n) => n.filePath);
      expect(sourcePaths).toContain(SOURCE_PATH);

      const rewrittenPaths = (envelope.data.rewrittenSources as Array<any>).map((n) => n.filePath);
      expect(rewrittenPaths).toContain(REWRITTEN_PATH);

      const dailyPaths = (envelope.data.dailyNotes as Array<any>).map((n) => n.filePath);
      expect(dailyPaths).toContain(REWRITTEN_PATH);
      expect(dailyPaths).toContain(SOURCE_PATH);
      expect(dailyPaths).not.toContain(ARTIFACT_PATH);

      expect(envelope.data.signals.tasks.length).toBe(1);
      expect(envelope.data.signals.workouts.length).toBe(1);
      expect(envelope.data.signals.tasks[0].value).toEqual(
        expect.objectContaining({
          text: "finish report context",
          status: "open",
        }),
      );

      expect(envelope.data.continuity).toEqual(
        expect.objectContaining({
          windowDays: 7,
          fromDate: "2026-05-01",
          toDate: "2026-05-07",
        }),
      );
      const continuityNotes = envelope.data.continuity.notes as Array<any>;
      expect(continuityNotes.map((n) => n.docDate)).toEqual([
        "2026-05-07",
      ]);
      expect(
        continuityNotes.some((n) => n.filePath === "sources/2026-05-03/raw-note.md"),
      ).toBe(false);
      expect(
        continuityNotes.some((n) => n.filePath === "artifacts/2026-05-06/daily-report.md"),
      ).toBe(false);
      expect(envelope.data.continuity.signals.tasks.length).toBe(1);
      expect(envelope.data.continuity.signals.workouts.length).toBe(1);
      expect(envelope.data.continuity.signals.areas.length).toBe(0);
      expect(
        envelope.data.continuity.signals.all.some(
          (s: any) => s.note?.layer === "artifact",
        ),
      ).toBe(false);

      expect(envelope.data.retrieval.backend).toBe("fts");
      const taskResults = envelope.data.retrieval.groups.tasks.results as Array<any>;
      expect(taskResults.length).toBeGreaterThan(0);
      expect(taskResults[0]).toEqual(
        expect.objectContaining({
          chunkId: "chunk_rewritten_1",
          noteId: "note_rewritten_1",
          score: expect.any(Number),
          note: expect.objectContaining({
            filePath: REWRITTEN_PATH,
            docDate: TARGET_DATE,
            layer: "rewritten",
            language: "mixed",
          }),
        }),
      );

      const allRetrievalRows = flattenRetrievalRows(envelope);
      expect(
        allRetrievalRows.some((row: any) => row.note?.layer === "artifact"),
      ).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("include-artifacts includes artifact daily notes and retrieval rows when layer allows it", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "all",
          "--include-artifacts",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");

      const envelope = JSON.parse(result.stdout);
      expect(envelope.data.includeArtifacts).toBe(true);
      expect(envelope.data.documentLayer).toBe("all");

      const dailyPaths = (envelope.data.dailyNotes as Array<any>).map((n) => n.filePath);
      expect(dailyPaths).toContain(ARTIFACT_PATH);

      const continuityNotes = envelope.data.continuity.notes as Array<any>;
      expect(
        continuityNotes.some((n) => n.filePath === "sources/2026-05-03/raw-note.md"),
      ).toBe(false);
      expect(
        continuityNotes.some((n) => n.filePath === "artifacts/2026-05-06/daily-report.md"),
      ).toBe(true);
      expect(
        envelope.data.continuity.signals.all.some(
          (s: any) => s.note?.layer === "artifact",
        ),
      ).toBe(true);

      const allRetrievalRows = flattenRetrievalRows(envelope);
      expect(
        allRetrievalRows.some(
          (row: any) =>
            row.note?.layer === "artifact" && row.note?.filePath === ARTIFACT_PATH,
        ),
      ).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test("--layer source retrieval contains only source rows", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "source",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout);
      const rows = flattenRetrievalRows(envelope);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row: any) => row.note?.layer === "source")).toBe(true);
      expect(rows.some((row: any) => row.note?.layer === "rewritten")).toBe(false);
      expect(rows.some((row: any) => row.note?.layer === "artifact")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("--layer artifact retrieval requires include-artifacts", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "artifact",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout);
      const rows = flattenRetrievalRows(envelope);
      expect(rows.length).toBe(0);

      const dailyPaths = (envelope.data.dailyNotes as Array<any>).map((n) => n.filePath);
      expect(dailyPaths).not.toContain(ARTIFACT_PATH);
    } finally {
      fixture.cleanup();
    }
  });

  test("--layer artifact --include-artifacts retrieves artifact rows", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "artifact",
          "--include-artifacts",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout);
      const rows = flattenRetrievalRows(envelope);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row: any) => row.note?.layer === "artifact")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test("--layer rewritten --include-artifacts retrieval includes rewritten and artifact rows", async () => {
    const fixture = await createFixture();
    try {
      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "rewritten",
          "--include-artifacts",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout);
      const rows = flattenRetrievalRows(envelope);
      expect(rows.some((row: any) => row.note?.layer === "rewritten")).toBe(true);
      expect(rows.some((row: any) => row.note?.layer === "artifact")).toBe(true);
      expect(rows.some((row: any) => row.note?.layer === "source")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test("applies date/layer filtering in SQL before limit for top=1 retrieval", async () => {
    const fixture = await createFixture();
    try {
      seedOutOfDateCrowdingRows(fixture.vaultRoot);

      const result = await runCli(
        [
          "--format",
          "json",
          "report",
          "context",
          "--date",
          TARGET_DATE,
          "--layer",
          "rewritten",
          "--top",
          "1",
        ],
        { KN_HOME: fixture.knHome },
      );

      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout);
      const taskRows = envelope.data.retrieval.groups.tasks.results as Array<any>;
      expect(taskRows.length).toBe(1);
      expect(taskRows[0].chunkId).toBe("chunk_rewritten_1");
      expect(taskRows[0].note.docDate).toBe(TARGET_DATE);
      expect(taskRows[0].note.layer).toBe("rewritten");
    } finally {
      fixture.cleanup();
    }
  });
});
