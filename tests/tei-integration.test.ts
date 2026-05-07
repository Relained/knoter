import { describe, expect, test } from "bun:test";
import { Embedder } from "../src/pipeline/embedder";
import { OpenAIEmbeddingProvider } from "../src/providers/openai";

const TEI_BASE_URL = process.env.KN_TEI_BASE_URL;
const TEI_MODEL = process.env.KN_TEI_MODEL || "local-tei";
const TEI_API_KEY = process.env.KN_TEI_API_KEY || "";
const TEI_DIM = process.env.KN_TEI_DIM ? Number.parseInt(process.env.KN_TEI_DIM, 10) : undefined;

function requireTei(): string | null {
  if (!TEI_BASE_URL) return "Set KN_TEI_BASE_URL to run TEI integration tests.";
  if (TEI_DIM !== undefined && (!Number.isFinite(TEI_DIM) || TEI_DIM <= 0)) {
    return "KN_TEI_DIM must be a positive integer when set.";
  }
  return null;
}

function assertEmbeddingVector(vector: number[], expectedDim?: number): void {
  expect(Array.isArray(vector)).toBe(true);
  expect(vector.length).toBeGreaterThan(0);
  if (expectedDim !== undefined) {
    expect(vector.length).toBe(expectedDim);
  }
  expect(vector.every((value) => Number.isFinite(value))).toBe(true);
  expect(vector.some((value) => value !== 0)).toBe(true);
}

describe("TEI OpenAI-compatible embedding integration", () => {
  const skipReason = requireTei();

  if (skipReason) {
    test("skips unless KN_TEI_BASE_URL is configured", () => {
      expect(typeof skipReason).toBe("string");
    });
    return;
  }

  test("embeds Korean and mixed-language inputs through TEI", async () => {
    const provider = new OpenAIEmbeddingProvider({
      baseUrl: TEI_BASE_URL,
      apiKey: TEI_API_KEY,
      model: TEI_MODEL,
    });

    expect(provider.isLocal).toBe(true);

    const embeddings = await provider.embed([
      "한국어 노트 검색과 임베딩 품질을 확인한다.",
      "knoter report context template validation smoke test",
    ]);

    expect(embeddings).toHaveLength(2);
    assertEmbeddingVector(embeddings[0]!, TEI_DIM);
    assertEmbeddingVector(embeddings[1]!, TEI_DIM);
    expect(embeddings[0]!.length).toBe(embeddings[1]!.length);
  });

  test("Embedder preserves one embedding per input with local TEI provider", async () => {
    const provider = new OpenAIEmbeddingProvider({
      baseUrl: TEI_BASE_URL,
      apiKey: TEI_API_KEY,
      model: TEI_MODEL,
    });
    const embedder = new Embedder({
      provider,
      maxRetries: 0,
    });

    const inputs = [
      "title: Daily | section: Workout | text: 푸시업 30회",
      "title: Daily | section: Tasks | text: kn template contract validation",
      "title: Daily | section: Areas | text: llm-wiki 정리",
    ];
    const embeddings = await embedder.embedAll(inputs);

    expect(embeddings).toHaveLength(inputs.length);
    const dims = embeddings.map((embedding) => embedding.length);
    expect(new Set(dims).size).toBe(1);
    for (const embedding of embeddings) {
      assertEmbeddingVector(embedding, TEI_DIM);
    }
  });
});
