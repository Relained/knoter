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
  test("imports Codex-authored rewritten and artifact outputs into the vault", async () => {
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
      const runner: LlmRewriteRunner = async (input) => {
        expect(input.prompt).toContain("You are Codex");
        expect(input.prompt).toContain("layer: rewritten");
        expect(input.prompt).toContain("layer: artifact");
        expect(input.prompt).toContain(SOURCE_REL_PATH);
        return {
          rewrittenContent: [
            "---",
            'title: "Codex rewritten study note"',
            "layer: rewritten",
            "kind: study",
            "doc_date: 2026-03-05",
            `source_path: "${SOURCE_REL_PATH}"`,
            "rewrite_agent: codex-cli",
            "rewrite_prompt_hash: codex-cli-v1",
            "---",
            "",
            "# Codex rewritten study note",
            "",
            "## 검색 키워드",
            "- 자료구조",
            "- NLP",
            "",
            "## 정리",
            "- 실제 Codex agent 산출물과 같은 계약으로 저장되는 rewritten 테스트 문서다.",
          ].join("\n"),
          artifactContent: [
            "---",
            'title: "Codex artifact"',
            "layer: artifact",
            "kind: study-guide",
            'artifact_template_id: "study-rewrite-v1"',
            'source_path: "rewritten/2026-03-05/2026-03-05.md"',
            "---",
            "",
            "# Codex artifact",
            "",
            "## Study 지식 정리",
            "- 자료구조와 NLP 학습 노트를 artifact로 정리한다.",
          ].join("\n"),
          lastMessage: "created rewritten.md and artifact.md",
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

      expect(result.rewrittenPath).toBe("rewritten/2026-03-05/2026-03-05.md");
      expect(result.artifactPath).toBe("artifacts/2026-03-05/2026-03-05-artifact.md");
      expect(result.rewritten.status).toBe("added");
      expect(result.artifact.status).toBe("added");

      const metaDb = new MetaDB(vaultRoot);
      try {
        const rewritten = metaDb.getNoteByPath(VAULT_NAME, result.rewrittenPath);
        const artifact = metaDb.getNoteByPath(VAULT_NAME, result.artifactPath);
        expect(rewritten?.rewrite_agent).toBe("codex-cli");
        expect(rewritten?.source_path).toBe(SOURCE_REL_PATH);
        expect(artifact?.artifact_template_id).toBe("study-rewrite-v1");
        expect(metaDb.searchFts("자료구조", 10, VAULT_NAME).length).toBeGreaterThan(0);
        expect(metaDb.searchFts("artifact", 10, VAULT_NAME, 0, true).length).toBeGreaterThan(0);

        const edges = metaDb.listDocumentGraphEdges(VAULT_NAME);
        expect(edges.some((edge) => edge.kind === "source_rewritten")).toBe(true);
        expect(edges.some((edge) => edge.kind === "artifact_template")).toBe(true);
      } finally {
        metaDb.close();
      }
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
