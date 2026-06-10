import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { runLlmRewrite, type LlmRewriteRunner } from "../src/core/llm-rewrite";
import { saveVaultConfig, type VaultConfig } from "../src/core/config";
import { hashContent } from "../src/pipeline/hasher";
import { parseNote } from "../src/pipeline/parser";
import { detectLanguage } from "../src/pipeline/chunker";
import type { EmbeddingProvider } from "../src/pipeline/embedder";
import { refreshDocumentGraph } from "../src/core/document-graph";
import { EMBEDDING_DIMENSIONS } from "../src/stores/vec-store";
import { MetaDB } from "../src/stores/meta-store";
import { randomTestPath } from "./helpers/test-paths";

const VAULT_NAME = "llm-vault";
const SOURCE_REL_PATH = "sources/2026-03-05/2026-03-05.md";

describe("llm rewrite", () => {
  test("imports Codex-authored wiki and scenario artifacts into the vault", async () => {
    const vaultRoot = randomTestPath("kn-llm-rewrite-vault");
    const workspace = randomTestPath("kn-llm-rewrite-agent");
    const vaultConfig: VaultConfig = {
      embedding: { model: "nomic-embed-text" },
      search: { fusionAlpha: 0.8 },
      preprocessor: null,
    };
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });
    mkdirSync(workspace, { recursive: true });
    await saveVaultConfig(vaultRoot, vaultConfig);

    try {
      await seedSource(vaultRoot);
      await Bun.write(
        join(vaultRoot, "artifacts", "llm-wiki.md"),
        ["---", "title: LLM Wiki", "layer: artifact", "kind: llm-wiki", "---", "", "# LLM Wiki", "", "## Recent Updates", "- none"].join("\n"),
      );
      const runner: LlmRewriteRunner = async (input) => {
        expect(input.agent).toBe("codex");
        expect(input.prompt).toContain("You are Codex");
        expect(input.prompt).toContain("artifacts/llm-wiki.md");
        expect(input.prompt).toContain("kind: llm-wiki");
        expect(input.prompt).toContain(SOURCE_REL_PATH);
        expect(input.prompt).toContain("Do not write rewritten.md");
        // The vault wiki is seeded into the workspace for in-place updates.
        expect(input.prompt).toContain("Existing artifacts seeded into the workspace");
        const seededWiki = await Bun.file(join(input.workspace, "artifacts", "llm-wiki.md")).text();
        expect(seededWiki).toContain("# LLM Wiki");
        return {
          rewrittenContent: null,
          artifactFiles: [
            {
              path: "artifacts/llm-wiki.md",
              content: [
                "---",
                'title: "LLM Wiki"',
                "layer: artifact",
                "kind: llm-wiki",
                'artifact_template_id: "llm-wiki"',
                `source_path: "${SOURCE_REL_PATH}"`,
                "---",
                "",
                "# LLM Wiki",
                "",
                "## Topics",
                "- 자료구조와 NLP 핵심 개념이 study 노트에서 유입됐다.",
                "",
                "## Recent Updates",
                "- 2026-03-05: study 소스에서 자료구조/NLP 지식 통합.",
              ].join("\n"),
            },
            {
              path: "artifacts/study/study-index.md",
              content: [
                "---",
                'title: "Codex study artifact"',
                "layer: artifact",
                "kind: study-guide",
                'artifact_template_id: "study-rewrite-v1"',
                `source_path: "${SOURCE_REL_PATH}"`,
                "---",
                "",
                "# Study 지식 정리",
                "",
                "## Study 지식 정리",
                "- 자료구조와 NLP 학습 노트를 artifact로 정리한다.",
              ].join("\n"),
            },
          ],
          lastMessage: "updated artifacts/llm-wiki.md and artifacts/study/study-index.md",
          stdout: "",
          stderr: "",
        };
      };

      const result = await runLlmRewrite({
        vaultRoot,
        vaultName: VAULT_NAME,
        sourcePath: SOURCE_REL_PATH,
        workspace,
        runner,
        embedProvider: new DeterministicEmbeddingProvider(vaultConfig),
      });

      expect(result.rewrittenPath).toBeNull();
      expect(result.rewritten).toBeNull();
      expect(result.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "artifacts/llm-wiki.md", status: "added" }),
          expect.objectContaining({ path: "artifacts/study/study-index.md", status: "added" }),
        ]),
      );

      const metaDb = new MetaDB(vaultRoot);
      try {
        const wiki = metaDb.getNoteByPath(VAULT_NAME, "artifacts/llm-wiki.md");
        const artifact = metaDb.getNoteByPath(VAULT_NAME, "artifacts/study/study-index.md");
        expect(wiki?.kind).toBe("llm-wiki");
        expect(wiki?.source_path).toBe(SOURCE_REL_PATH);
        expect(artifact?.artifact_template_id).toBe("study-rewrite-v1");
        // The updated wiki is part of default search; the scenario artifact
        // ("artifact" appears only in its content) still needs includeArtifacts.
        expect(metaDb.searchFts("자료구조", 10, VAULT_NAME).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("artifact", 10, VAULT_NAME).length).toBe(0);
        expect(metaDb.searchFts("artifact", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);

        const edges = metaDb.listDocumentGraphEdges(VAULT_NAME);
        expect(edges.some((edge) => edge.kind === "artifact_template")).toBe(true);
      } finally {
        metaDb.close();
      }
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("imports Claude-authored wiki artifact through the claude agent runner", async () => {
    const vaultRoot = randomTestPath("kn-llm-rewrite-claude-vault");
    const workspace = randomTestPath("kn-llm-rewrite-claude-agent");
    const vaultConfig: VaultConfig = {
      embedding: { model: "nomic-embed-text" },
      search: { fusionAlpha: 0.8 },
      preprocessor: null,
    };
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });
    mkdirSync(workspace, { recursive: true });
    await saveVaultConfig(vaultRoot, vaultConfig);

    try {
      await seedSource(vaultRoot);
      const runner: LlmRewriteRunner = async (input) => {
        expect(input.agent).toBe("claude");
        expect(input.prompt).toContain("You are Claude");
        return {
          rewrittenContent: null,
          artifactFiles: [
            {
              path: "artifacts/llm-wiki.md",
              content: [
                "---",
                'title: "LLM Wiki"',
                "layer: artifact",
                "kind: llm-wiki",
                'artifact_template_id: "llm-wiki"',
                `source_path: "${SOURCE_REL_PATH}"`,
                "---",
                "",
                "# LLM Wiki",
                "",
                "## Recent Updates",
                "- 2026-03-05: Claude가 study 지식을 통합했다.",
              ].join("\n"),
            },
          ],
          lastMessage: "updated artifacts/llm-wiki.md",
          stdout: "",
          stderr: "",
        };
      };

      const result = await runLlmRewrite({
        vaultRoot,
        vaultName: VAULT_NAME,
        sourcePath: SOURCE_REL_PATH,
        agent: "claude",
        workspace,
        runner,
        embedProvider: new DeterministicEmbeddingProvider(vaultConfig),
      });

      expect(result.agent).toBe("claude");
      expect(result.rewritten).toBeNull();
      expect(result.artifacts).toEqual([
        expect.objectContaining({ path: "artifacts/llm-wiki.md", status: "added" }),
      ]);
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("still imports legacy rewritten output alongside artifacts", async () => {
    const vaultRoot = randomTestPath("kn-llm-rewrite-legacy-vault");
    const workspace = randomTestPath("kn-llm-rewrite-legacy-agent");
    const vaultConfig: VaultConfig = {
      embedding: { model: "nomic-embed-text" },
      search: { fusionAlpha: 0.8 },
      preprocessor: null,
    };
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });
    mkdirSync(workspace, { recursive: true });
    await saveVaultConfig(vaultRoot, vaultConfig);

    try {
      await seedSource(vaultRoot);
      const runner: LlmRewriteRunner = async () => ({
        rewrittenContent: [
          "---",
          'title: "Legacy rewritten note"',
          "layer: rewritten",
          "kind: study",
          "doc_date: 2026-03-05",
          `source_path: "${SOURCE_REL_PATH}"`,
          "rewrite_agent: codex-cli",
          "rewrite_prompt_hash: codex-cli-v1",
          "---",
          "",
          "# Legacy rewritten note",
          "",
          "## 정리",
          "- 구버전 에이전트가 여전히 rewritten을 쓸 때의 호환 경로다.",
        ].join("\n"),
        artifactFiles: [
          {
            path: "artifacts/llm-wiki.md",
            content: [
              "---",
              'title: "LLM Wiki"',
              "layer: artifact",
              "kind: llm-wiki",
              "---",
              "",
              "# LLM Wiki",
              "",
              "## Recent Updates",
              "- 2026-03-05: legacy 호환 테스트 갱신.",
            ].join("\n"),
          },
        ],
        lastMessage: "legacy output",
        stdout: "",
        stderr: "",
      });

      const result = await runLlmRewrite({
        vaultRoot,
        vaultName: VAULT_NAME,
        sourcePath: SOURCE_REL_PATH,
        workspace,
        runner,
        embedProvider: new DeterministicEmbeddingProvider(vaultConfig),
      });

      expect(result.rewrittenPath).toBe("rewritten/2026-03-05/2026-03-05.md");
      expect(result.rewritten?.status).toBe("added");

      const metaDb = new MetaDB(vaultRoot);
      try {
        const rewritten = metaDb.getNoteByPath(VAULT_NAME, "rewritten/2026-03-05/2026-03-05.md");
        expect(rewritten?.rewrite_agent).toBe("codex-cli");
        const edges = metaDb.listDocumentGraphEdges(VAULT_NAME);
        expect(edges.some((edge) => edge.kind === "source_rewritten")).toBe(true);
      } finally {
        metaDb.close();
      }
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("fails when the agent produces no artifact outputs", async () => {
    const vaultRoot = randomTestPath("kn-llm-rewrite-empty-vault");
    const workspace = randomTestPath("kn-llm-rewrite-empty-agent");
    const vaultConfig: VaultConfig = {
      embedding: { model: "nomic-embed-text" },
      search: { fusionAlpha: 0.8 },
      preprocessor: null,
    };
    mkdirSync(join(vaultRoot, ".kn"), { recursive: true });
    mkdirSync(workspace, { recursive: true });
    await saveVaultConfig(vaultRoot, vaultConfig);

    try {
      await seedSource(vaultRoot);
      const runner: LlmRewriteRunner = async () => ({
        rewrittenContent: null,
        artifactFiles: [],
        lastMessage: "did nothing",
        stdout: "",
        stderr: "",
      });

      await expect(
        runLlmRewrite({
          vaultRoot,
          vaultName: VAULT_NAME,
          sourcePath: SOURCE_REL_PATH,
          workspace,
          runner,
          embedProvider: new DeterministicEmbeddingProvider(vaultConfig),
        }),
      ).rejects.toThrow(/no artifact outputs/);
    } finally {
      rmSync(vaultRoot, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

async function seedSource(vaultRoot: string): Promise<void> {
  const sourceContent = await Bun.file(join(process.cwd(), "..", "testdata", basename(SOURCE_REL_PATH))).text();
  const targetPath = join(vaultRoot, SOURCE_REL_PATH);
  mkdirSync(dirname(targetPath), { recursive: true });
  await Bun.write(targetPath, sourceContent);

  const parsed = parseNote(sourceContent, SOURCE_REL_PATH);
  const metaDb = new MetaDB(vaultRoot);
  try {
    metaDb.reindexNote(
      {
        id: randomUUID(),
        vaultId: VAULT_NAME,
        filePath: SOURCE_REL_PATH,
        title: parsed.title,
        fileHash: hashContent(sourceContent),
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
    refreshDocumentGraph(metaDb, { vaultId: VAULT_NAME, includeChunks: true });
  } finally {
    metaDb.close();
  }
}

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic-llm-test";
  readonly isLocal = true;
  private readonly dimension: number;

  constructor(vaultConfig: VaultConfig) {
    this.dimension = EMBEDDING_DIMENSIONS[vaultConfig.embedding.model] ?? 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicVector(text, this.dimension));
  }
}

function deterministicVector(text: string, dimension: number): number[] {
  const bytes = createHash("sha256").update(text).digest();
  return Array.from({ length: dimension }, (_, index) => ((bytes[index % bytes.length] ?? 0) - 128) / 128);
}
