import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { Embedder } from "../src/pipeline/embedder";
import { OpenAIEmbeddingProvider } from "../src/providers/openai";
import { addMarkdownNoteToVault, type AddMarkdownNoteInput } from "../src/core/add-note";
import { saveVaultConfig, type VaultConfig } from "../src/core/config";
import { buildRewriteContextBundle } from "../src/core/rewrite-context";
import { hashContent } from "../src/pipeline/hasher";
import { MetaDB } from "../src/stores/meta-store";
import {
  createVaultCollection,
  EMBEDDING_DIMENSIONS,
  semanticQuery,
  toSearchResult,
  toZVecDoc,
} from "../src/stores/vec-store";
import { search } from "../src/search/hybrid";

const TEI_BASE_URL = process.env.KN_TEI_BASE_URL;
const TEI_MODEL = process.env.KN_TEI_MODEL || "local-tei";
const TEI_API_KEY = process.env.KN_TEI_API_KEY || "";
const TEI_DIM = process.env.KN_TEI_DIM ? Number.parseInt(process.env.KN_TEI_DIM, 10) : undefined;
const RUN_CODEX_CLI_E2E = process.env.KN_CODEX_CLI_E2E === "1";
const CODEX_BIN = process.env.KN_CODEX_BIN || "codex";
const CODEX_TIMEOUT_MS = process.env.KN_CODEX_TIMEOUT_MS
  ? Number.parseInt(process.env.KN_CODEX_TIMEOUT_MS, 10)
  : 240_000;
const ALL_TESTDATA_TIMEOUT_MS = process.env.KN_TEI_ALL_TESTDATA_TIMEOUT_MS
  ? Number.parseInt(process.env.KN_TEI_ALL_TESTDATA_TIMEOUT_MS, 10)
  : 900_000;
const VAULT_NAME = "tei-e2e";
const E2E_DATE = "2026-04-16";
const E2E_SOURCE_BASENAME = `${E2E_DATE}.md`;
const E2E_SOURCE_REL_PATH = `sources/${E2E_DATE}/${E2E_SOURCE_BASENAME}`;
const E2E_REWRITTEN_REL_PATH = `rewritten/${E2E_DATE}/daily-rewritten.md`;
const E2E_ARTIFACT_REL_PATH = `artifacts/${E2E_DATE}/daily-report.md`;
const E2E_SOURCE_NOTE_ID = "source-2026-04-16";

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

function buildTeiProvider(): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider({
    baseUrl: TEI_BASE_URL!,
    apiKey: TEI_API_KEY,
    model: TEI_MODEL,
  });
}

function buildTeiVaultConfig(): VaultConfig {
  return {
    embedding: {
      baseUrl: TEI_BASE_URL,
      apiKey: TEI_API_KEY,
      model: TEI_MODEL,
    },
    search: {
      fusionAlpha: 0.8,
    },
    preprocessor: null,
  };
}

type AddNoteVectorCollection = NonNullable<AddMarkdownNoteInput["vectorCollection"]>;

function asAddNoteVectorCollection(
  collection: ReturnType<typeof createVaultCollection> | null,
): AddNoteVectorCollection {
  if (!collection) throw new Error("zvec collection was not initialized");
  return collection as unknown as AddNoteVectorCollection;
}

function destroyCollection(collection: ReturnType<typeof createVaultCollection> | null): void {
  if (collection) collection.destroySync();
}

async function resolveEmbeddingDimension(provider: OpenAIEmbeddingProvider): Promise<number> {
  if (TEI_DIM !== undefined) return TEI_DIM;
  const [probe] = await provider.embed(["한국어 임베딩 차원 확인"]);
  assertEmbeddingVector(probe!);
  return probe!.length;
}

async function withResolvedTeiDimension<T>(
  provider: OpenAIEmbeddingProvider,
  fn: (embeddingDim: number) => Promise<T>,
): Promise<T> {
  const embeddingDim = await resolveEmbeddingDimension(provider);
  const previousDimension = EMBEDDING_DIMENSIONS[TEI_MODEL];
  EMBEDDING_DIMENSIONS[TEI_MODEL] = embeddingDim;
  try {
    return await fn(embeddingDim);
  } finally {
    if (previousDimension === undefined) {
      delete EMBEDDING_DIMENSIONS[TEI_MODEL];
    } else {
      EMBEDDING_DIMENSIONS[TEI_MODEL] = previousDimension;
    }
  }
}

function buildCodexRewritePrompt(input: {
  context: Record<string, unknown>;
  templateContent: string;
  sourceNoteId: string;
  sourcePath: string;
  rewrittenVaultPath: string;
  rewrittenPath: string;
  artifactPath: string;
}): string {
  return [
    "You are Codex acting as knoter's external rewrite agent.",
    "Task: produce both a chunk-friendly rewritten-source Markdown and a user-facing artifact Markdown.",
    "",
    "Hard requirements:",
    "- Use only facts present in the source evidence.",
    "- Do not invent tasks, workout counts, dates, or project status.",
    "- Write files only to the exact output paths below.",
    "- The rewritten file must include YAML frontmatter with layer: rewritten.",
    "- The artifact file must include YAML frontmatter with layer: artifact.",
    `- In rewritten frontmatter, set source_note_id: ${input.sourceNoteId}.`,
    `- In rewritten frontmatter, set source_path: ${input.sourcePath}.`,
    "- Set rewrite_agent: codex-cli in rewritten frontmatter.",
    "- Set artifact_template_id: daily-report in artifact frontmatter.",
    `- In artifact frontmatter, set source_path: ${input.rewrittenVaultPath}.`,
    "- Normalize Korean headings, task markers, metrics, and project terms for retrieval.",
    "- The rewritten file must include a '## 검색 키워드' section with the exact terms: 자연어처리, Seq2Seq, Attention, 임베딩, 하이브리드 검색.",
    "- Use the template content as the artifact structure, but omit sections with no evidence by writing an explicit no-record note.",
    "",
    `Rewritten output path: ${input.rewrittenPath}`,
    `Artifact output path: ${input.artifactPath}`,
    "",
    "Template Markdown:",
    input.templateContent,
    "",
    "Rewrite context JSON:",
    JSON.stringify(input.context, null, 2),
  ].join("\n");
}

function buildCodexAuthoredRewrittenFixture(input: {
  sourceNoteId: string;
  sourcePath: string;
  sourceContent: string;
}): string {
  const sourceExcerpt = input.sourceContent.slice(0, 2200);
  return [
    "---",
    'title: "2026-04-16 일일 노트 재작성"',
    `date: ${E2E_DATE}`,
    "layer: rewritten",
    "kind: daily",
    `source_note_id: ${input.sourceNoteId}`,
    `source_path: ${input.sourcePath}`,
    'rewrite_agent: "codex-test-harness"',
    "---",
    "",
    "# 2026-04-16 일일 노트 재작성",
    "",
    "## 핵심 요약",
    "- 이 문서는 testdata의 2026-04-16 일일 노트를 Codex rewrite prompt 계약에 맞춰 재작성한 테스트 산출물이다.",
    "- 핵심 주제는 개인 컨디션 기록, 자연어처리 Seq2Seq/Attention 수업 노트, CJK 청킹, 하이브리드 검색, 임베딩이다.",
    "- source traceability를 유지하기 위해 원본 source_path와 source_note_id를 frontmatter에 남긴다.",
    "",
    "## 검색 키워드",
    "- 자연어처리",
    "- Seq2Seq Attention",
    "- 한국어 하이브리드 검색",
    "- 로컬 TEI 임베딩",
    "- 벡터 데이터베이스",
    "- MCP 외부 LLM 에이전트",
    "",
    "## 작업 후보",
    "- [ ] 이비인후과 방문 필요 여부를 확인한다.",
    "- [ ] 자연어처리 시험 범위와 치팅시트 준비 항목을 정리한다.",
    "- [ ] TEI에 올라간 한국어 임베딩 모델로 rewritten 문서를 실제 인덱싱한다.",
    "- [ ] 한국어 키워드 검색으로 하이브리드 검색과 임베딩 관련 청크가 검색되는지 확인한다.",
    "",
    "## 원본 근거 발췌",
    "```text",
    sourceExcerpt,
    "```",
  ].join("\n");
}

function buildCodexAuthoredArtifactFixture(input: {
  rewrittenPath: string;
}): string {
  return [
    "---",
    'title: "2026-04-16 일일 보고서"',
    `date: ${E2E_DATE}`,
    "layer: artifact",
    "kind: daily-report",
    `source_path: ${input.rewrittenPath}`,
    "artifact_template_id: daily-report",
    "---",
    "",
    `# Daily Report: ${E2E_DATE}`,
    "",
    "## Summary",
    "- 오늘 자료는 개인 컨디션, 자연어처리 Seq2Seq/Attention 수업, knoter CJK 청킹 및 임베딩 메모가 섞인 일일 노트다.",
    "- 완료 기록이나 운동 기록은 원본에 없으므로 완료 항목으로 단정하지 않는다.",
    "",
    "## Today Done",
    "- 기록된 완료 작업 없음.",
    "",
    "## Open Tasks",
    "- [ ] 내일 이비인후과 방문 여부를 챙긴다.",
    "- [ ] 4월 23일 자연어처리 시험 치팅시트를 준비한다.",
    "- [ ] TEI 한국어 임베딩 모델로 rewritten 문서를 인덱싱한다.",
    "- [ ] 한국어 키워드 검색과 zvec semantic query를 함께 검증한다.",
    "",
    "## Workout",
    "- Workout 기록 없음. 원본에는 운동 종류와 횟수가 없다.",
  ].join("\n");
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function testdataDocDate(relPath: string): string {
  const isoDate = relPath.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const monthDay = relPath.match(/(^|\/)(\d{2})-(\d{2})\.md$/);
  if (monthDay) return `2026-${monthDay[2]}-${monthDay[3]}`;
  return "2026-05-08";
}

function buildCorpusRewriteFixture(input: {
  index: number;
  relPath: string;
  sourceNoteId: string;
  sourceVaultPath: string;
  sourceContent: string;
}): string {
  const docDate = testdataDocDate(input.relPath);
  const title = input.relPath.replace(/\.md$/i, "");
  return [
    "---",
    `title: ${yamlQuote(`rewritten ${title}`)}`,
    `date: ${docDate}`,
    "layer: rewritten",
    "kind: testdata-corpus",
    `source_note_id: ${input.sourceNoteId}`,
    `source_path: ${yamlQuote(input.sourceVaultPath)}`,
    "rewrite_agent: codex-test-harness",
    "tags:",
    "  - testdata",
    "  - embedding-integration",
    "---",
    "",
    `# Rewritten Testdata ${input.index + 1}: ${title}`,
    "",
    "## 검색 최적화 요약",
    "",
    `- 원본 파일 ${input.relPath}을 전체 corpus 통합 테스트용 rewritten 문서로 정규화했다.`,
    "- 이 문서는 source 원문을 보존하면서 heading, lineage, tag, chunk context가 임베딩 입력에 포함되는지 검증한다.",
    "- 전체 testdata corpus에 대해 청킹, 실제 TEI 임베딩 생성, SQLite FTS 저장, zvec vector 저장을 수행한다.",
    "",
    "## 원본 재작성 본문",
    "",
    input.sourceContent.trim(),
    "",
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function runCodexCliAgent(input: {
  workspace: string;
  prompt: string;
}): Promise<{
  rewrittenContent: string;
  artifactContent: string;
  lastMessage: string;
  stdout: string;
  stderr: string;
}> {
  if (!Number.isFinite(CODEX_TIMEOUT_MS) || CODEX_TIMEOUT_MS <= 0) {
    throw new Error("KN_CODEX_TIMEOUT_MS must be a positive integer when set.");
  }

  const promptPath = join(input.workspace, "prompt.md");
  const lastMessagePath = join(input.workspace, "last-message.txt");
  const rewrittenPath = join(input.workspace, "rewritten.md");
  const artifactPath = join(input.workspace, "artifact.md");
  await Bun.write(promptPath, input.prompt);

  const command = [
    shellQuote(CODEX_BIN),
    "exec",
    "-C",
    shellQuote(input.workspace),
    "--skip-git-repo-check",
    "-s",
    "workspace-write",
    "-o",
    shellQuote(lastMessagePath),
    "-",
    "<",
    shellQuote(promptPath),
  ].join(" ");
  const proc = Bun.spawn(["bash", "-lc", command], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, CODEX_TIMEOUT_MS);

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (timedOut) {
      throw new Error(`Codex CLI timed out after ${CODEX_TIMEOUT_MS}ms`);
    }
    if (exitCode !== 0) {
      throw new Error(`Codex CLI exited with ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    const rewrittenContent = await Bun.file(rewrittenPath).text();
    const artifactContent = await Bun.file(artifactPath).text();
    const lastMessage = await Bun.file(lastMessagePath).text();

    return {
      rewrittenContent,
      artifactContent,
      lastMessage,
      stdout,
      stderr,
    };
  } finally {
    clearTimeout(timer);
  }
}

function printE2EDocument(label: string, path: string, content: string): void {
  console.log(`\n===== ${label}: ${path} =====`);
  console.log(content.trimEnd());
  console.log(`===== END ${label}: ${path} =====\n`);
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
    const provider = buildTeiProvider();
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

  test("writes live TEI embeddings to zvec, reads them back, queries, and deletes rows", async () => {
    const provider = buildTeiProvider();
    await withResolvedTeiDimension(provider, async (embeddingDim) => {
      const indexDir = join("/tmp", `kn-tei-zvec-${randomUUID()}`);
      let collection: ReturnType<typeof createVaultCollection> | null = null;

      try {
        collection = createVaultCollection(indexDir, "tei-vector-io", TEI_MODEL);

        const indexedTexts = [
          "한국어 자연어 처리와 문장 임베딩 검색은 의미 기반 검색 품질을 좌우한다.",
          "Rust ownership and borrowing prevent memory safety bugs at compile time.",
          "푸시업 30회와 스쿼트 50회를 운동 기록으로 남긴다.",
        ];
        const embeddings = await provider.embed(indexedTexts);
        expect(embeddings).toHaveLength(indexedTexts.length);
        for (const embedding of embeddings) {
          assertEmbeddingVector(embedding, embeddingDim);
        }

        const inserted = collection.insertSync([
          toZVecDoc({
            id: "chunk-ko-nlp",
            noteId: "note-ko",
            filePath: "rewritten/2026-05-08/korean-nlp.md",
            title: "한국어 NLP",
            layer: "rewritten",
            heading: "임베딩 검색",
            headingPath: ["# 한국어 NLP", "## 임베딩 검색"],
            content: indexedTexts[0]!,
            offsetStart: 0,
            offsetEnd: indexedTexts[0]!.length,
            tokenCount: 24,
            seqIndex: 0,
            docTitle: "한국어 NLP",
            tags: ["nlp", "korean"],
            embedding: embeddings[0]!,
          }),
          toZVecDoc({
            id: "chunk-en-rust",
            noteId: "note-rust",
            filePath: "rewritten/2026-05-08/rust.md",
            title: "Rust",
            layer: "rewritten",
            content: indexedTexts[1]!,
            offsetStart: 0,
            offsetEnd: indexedTexts[1]!.length,
            tokenCount: 15,
            seqIndex: 0,
            docTitle: "Rust",
            tags: ["rust"],
            embedding: embeddings[1]!,
          }),
          toZVecDoc({
            id: "chunk-ko-workout",
            noteId: "note-workout",
            filePath: "rewritten/2026-05-08/workout.md",
            title: "운동 기록",
            layer: "rewritten",
            content: indexedTexts[2]!,
            offsetStart: 0,
            offsetEnd: indexedTexts[2]!.length,
            tokenCount: 12,
            seqIndex: 0,
            docTitle: "운동 기록",
            tags: ["workout"],
            embedding: embeddings[2]!,
          }),
        ]);
        expect(inserted.every((status) => status.ok)).toBe(true);

        const fetched = collection.fetchSync(["chunk-ko-nlp", "chunk-en-rust"]);
        expect(fetched["chunk-ko-nlp"]?.fields?.file_path).toBe(
          "rewritten/2026-05-08/korean-nlp.md",
        );
        expect(fetched["chunk-ko-nlp"]?.vectors?.embedding).toHaveLength(embeddingDim);
        expect(fetched["chunk-en-rust"]?.fields?.tags).toEqual(["rust"]);

        const [queryEmbedding] = await provider.embed([
          "한국어 문장 임베딩으로 자연어 처리 노트를 찾는다.",
        ]);
        assertEmbeddingVector(queryEmbedding!, embeddingDim);
        const results = collection.querySync(semanticQuery(queryEmbedding!, 3)).map(toSearchResult);
        expect(results.length).toBeGreaterThan(0);
        expect(results.map((result) => result.id)).toContain("chunk-ko-nlp");
        expect(results[0]?.filePath).toBe("rewritten/2026-05-08/korean-nlp.md");

        const deleted = collection.deleteSync("chunk-en-rust");
        expect(deleted.ok).toBe(true);
        const afterDelete = collection.fetchSync("chunk-en-rust");
        expect(afterDelete["chunk-en-rust"]).toBeUndefined();
      } finally {
        destroyCollection(collection);
        rmSync(indexDir, { recursive: true, force: true });
      }
    });
  });

  test("indexes, searches, updates, and preserves metadata using real TEI embeddings", async () => {
    const provider = buildTeiProvider();
    await withResolvedTeiDimension(provider, async (embeddingDim) => {
      const vaultRoot = join("/tmp", `kn-tei-db-${randomUUID()}`);
      const vectorPath = join(vaultRoot, ".kn", "vectors");
      const vaultConfig = buildTeiVaultConfig();
      let collection: ReturnType<typeof createVaultCollection> | null = null;

      const sourceRelPath = "sources/2026-05-08/raw.md";
      const rewrittenRelPath = "rewritten/2026-05-08/embedding-note.md";
      const artifactRelPath = "artifacts/2026-05-08/daily-report.md";

      try {
        mkdirSync(join(vaultRoot, "sources", "2026-05-08"), { recursive: true });
        await saveVaultConfig(vaultRoot, vaultConfig);
        collection = createVaultCollection(vectorPath, "vault", TEI_MODEL);

        const sourceContent = [
          "---",
          "title: Raw capture",
          "date: 2026-05-08",
          "layer: source",
          "kind: source",
          "---",
          "",
          "# Raw capture",
          "",
          "한국어 임베딩 모델과 하이브리드 검색 테스트를 위한 원본 메모.",
        ].join("\n");
        await Bun.write(join(vaultRoot, sourceRelPath), sourceContent);

        const sourceDb = new MetaDB(vaultRoot);
        try {
          sourceDb.upsertNote({
            id: "source-live-embedding",
            vaultId: VAULT_NAME,
            filePath: sourceRelPath,
            title: "Raw capture",
            fileHash: hashContent(sourceContent),
            docDate: "2026-05-08",
            layer: "source",
            kind: "source",
            language: "cjk",
          });
          sourceDb.markSynced("source-live-embedding");
          expect(sourceDb.getChunksByNote("source-live-embedding")).toEqual([]);
        } finally {
          sourceDb.close();
        }

        const rewrittenContent = [
          "---",
          "title: Live Embedding Note",
          "date: 2026-05-08",
          "layer: rewritten",
          "kind: daily",
          "source_note_id: source-live-embedding",
          `source_path: ${sourceRelPath}`,
          "rewrite_agent: codex-test",
          "tags:",
          "  - embedding",
          "  - korean",
          "---",
          "",
          "# Live Embedding Note",
          "",
          "## 한국어 임베딩",
          "",
          "한국어 자연어 처리 문장을 실제 TEI 임베딩 모델로 벡터화하고 zvec에 저장한다.",
          "",
          "## 하이브리드 검색",
          "",
          "SQLite FTS와 semantic vector search를 함께 사용해 하이브리드 검색 결과를 검증한다.",
        ].join("\n");

        const firstAdd = await addMarkdownNoteToVault({
          vaultRoot,
          vaultName: VAULT_NAME,
          relPath: rewrittenRelPath,
          content: rewrittenContent,
          vaultConfig,
          embedProvider: provider,
          vectorCollection: asAddNoteVectorCollection(collection),
        });
        expect(firstAdd.status).toBe("added");
        expect(firstAdd.chunkCount).toBeGreaterThan(0);

        const artifactContent = [
          "---",
          "title: Live Artifact",
          "date: 2026-05-08",
          "layer: artifact",
          "kind: daily-report",
          `source_path: ${rewrittenRelPath}`,
          "artifact_template_id: daily-report",
          "---",
          "",
          "# Live Artifact",
          "",
          "## Summary",
          "",
          "Workout 검증용 artifact 문장. 기본 검색에서는 제외되어야 한다.",
        ].join("\n");
        const artifactAdd = await addMarkdownNoteToVault({
          vaultRoot,
          vaultName: VAULT_NAME,
          relPath: artifactRelPath,
          content: artifactContent,
          vaultConfig,
          embedProvider: provider,
          vectorCollection: asAddNoteVectorCollection(collection),
        });
        expect(artifactAdd.status).toBe("added");

        let originalChunkIds: string[] = [];
        const indexedDb = new MetaDB(vaultRoot);
        try {
          const sourceNote = indexedDb.getNoteByPath(VAULT_NAME, sourceRelPath);
          const rewrittenNote = indexedDb.getNoteByPath(VAULT_NAME, rewrittenRelPath);
          const artifactNote = indexedDb.getNoteByPath(VAULT_NAME, artifactRelPath);
          expect(sourceNote?.layer).toBe("source");
          expect(rewrittenNote?.layer).toBe("rewritten");
          expect(rewrittenNote?.vector_sync_status).toBe("synced");
          expect(rewrittenNote?.source_note_id).toBe("source-live-embedding");
          expect(rewrittenNote?.source_path).toBe(sourceRelPath);
          expect(artifactNote?.layer).toBe("artifact");
          expect(artifactNote?.artifact_template_id).toBe("daily-report");

          const rewrittenChunks = rewrittenNote ? indexedDb.getChunksByNote(rewrittenNote.id) : [];
          const artifactChunks = artifactNote ? indexedDb.getChunksByNote(artifactNote.id) : [];
          expect(rewrittenChunks.length).toBe(firstAdd.chunkCount);
          expect(artifactChunks.length).toBe(artifactAdd.chunkCount);
          originalChunkIds = rewrittenChunks.map((chunk) => chunk.id);

          const ftsHits = indexedDb.searchFts("하이브리드 검색", 10, VAULT_NAME);
          expect(ftsHits.some((hit) => hit.noteId === rewrittenNote?.id)).toBe(true);
        } finally {
          indexedDb.close();
        }

        const fetchedVectors = collection.fetchSync(originalChunkIds);
        expect(Object.keys(fetchedVectors).length).toBe(originalChunkIds.length);
        for (const chunkId of originalChunkIds) {
          expect(fetchedVectors[chunkId]?.vectors?.embedding).toHaveLength(embeddingDim);
          expect(fetchedVectors[chunkId]?.fields?.file_path).toBe(rewrittenRelPath);
        }

        const semanticResult = await search(vaultRoot, VAULT_NAME, "한국어 임베딩 벡터 검색", {
          mode: "semantic",
          top: 5,
        });
        expect(semanticResult.results.some((result) => result.filePath === rewrittenRelPath)).toBe(true);

        const hybridResult = await search(vaultRoot, VAULT_NAME, "하이브리드 검색", {
          mode: "hybrid",
          top: 5,
        });
        expect(hybridResult.results[0]?.filePath).toBe(rewrittenRelPath);
        expect(hybridResult.results[0]?.scoreDetail?.fused).toBeGreaterThan(0);

        const artifactExcluded = await search(vaultRoot, VAULT_NAME, "Workout", {
          mode: "keyword",
          top: 5,
        });
        expect(artifactExcluded.results.some((result) => result.filePath === artifactRelPath)).toBe(false);

        const artifactIncluded = await search(vaultRoot, VAULT_NAME, "Workout", {
          mode: "keyword",
          top: 5,
          includeArtifacts: true,
        });
        expect(artifactIncluded.results.some((result) => result.filePath === artifactRelPath)).toBe(true);

        const updatedContent = rewrittenContent.replace(
          "SQLite FTS와 semantic vector search를 함께 사용해 하이브리드 검색 결과를 검증한다.",
          "SQLite FTS와 semantic vector search를 함께 사용해 하이브리드 검색 결과를 검증한다.\n\n## 업데이트 검증\n\n벡터 교체 작업이 기존 chunk id를 제거하고 새 chunk id를 저장하는지 확인한다.",
        );
        const updatedAdd = await addMarkdownNoteToVault({
          vaultRoot,
          vaultName: VAULT_NAME,
          relPath: rewrittenRelPath,
          content: updatedContent,
          vaultConfig,
          embedProvider: provider,
          vectorCollection: asAddNoteVectorCollection(collection),
        });
        expect(updatedAdd.status).toBe("updated");

        const afterUpdateDb = new MetaDB(vaultRoot);
        try {
          const updatedNote = afterUpdateDb.getNoteByPath(VAULT_NAME, rewrittenRelPath);
          expect(updatedNote?.vector_sync_status).toBe("synced");
          const updatedChunks = updatedNote ? afterUpdateDb.getChunksByNote(updatedNote.id) : [];
          expect(updatedChunks.length).toBe(updatedAdd.chunkCount);
          expect(updatedChunks.map((chunk) => chunk.content).join("\n")).toContain("업데이트 검증");
          const updatedChunkIds = updatedChunks.map((chunk) => chunk.id);
          expect(updatedChunkIds.some((chunkId) => originalChunkIds.includes(chunkId))).toBe(false);

          const staleVectors = collection.fetchSync(originalChunkIds);
          expect(Object.keys(staleVectors)).toHaveLength(0);
          const currentVectors = collection.fetchSync(updatedChunkIds);
          expect(Object.keys(currentVectors)).toHaveLength(updatedChunkIds.length);
        } finally {
          afterUpdateDb.close();
        }
      } finally {
        destroyCollection(collection);
        rmSync(vaultRoot, { recursive: true, force: true });
      }
    });
  });

  test("rewrites every testdata markdown file, chunks the corpus, and embeds all chunks with TEI", async () => {
    if (!Number.isFinite(ALL_TESTDATA_TIMEOUT_MS) || ALL_TESTDATA_TIMEOUT_MS <= 0) {
      throw new Error("KN_TEI_ALL_TESTDATA_TIMEOUT_MS must be a positive integer when set.");
    }

    const provider = buildTeiProvider();
    await withResolvedTeiDimension(provider, async (embeddingDim) => {
      const vaultRoot = join("/tmp", `kn-tei-corpus-${randomUUID()}`);
      const vectorPath = join(vaultRoot, ".kn", "vectors");
      const vaultConfig = buildTeiVaultConfig();
      const testdataRoot = join(process.cwd(), "testdata");
      const testdataFiles = [...new Bun.Glob("**/*.md").scanSync({ cwd: testdataRoot })].sort();
      let collection: ReturnType<typeof createVaultCollection> | null = null;

      expect(testdataFiles.length).toBeGreaterThan(0);

      try {
        await saveVaultConfig(vaultRoot, vaultConfig);
        collection = createVaultCollection(vectorPath, "vault", TEI_MODEL);

        const sourceDb = new MetaDB(vaultRoot);
        try {
          for (let index = 0; index < testdataFiles.length; index++) {
            const relFile = testdataFiles[index]!;
            const sourceContent = await Bun.file(join(testdataRoot, relFile)).text();
            const sourceVaultPath = `sources/testdata/${relFile}`;
            const sourceNoteId = `source-testdata-${index}-${hashContent(relFile).slice(0, 8)}`;

            mkdirSync(dirname(join(vaultRoot, sourceVaultPath)), { recursive: true });
            await Bun.write(join(vaultRoot, sourceVaultPath), sourceContent);
            sourceDb.upsertNote({
              id: sourceNoteId,
              vaultId: VAULT_NAME,
              filePath: sourceVaultPath,
              title: relFile,
              fileHash: hashContent(sourceContent),
              docDate: testdataDocDate(relFile),
              layer: "source",
              kind: "source",
              language: "cjk",
            });
            sourceDb.markSynced(sourceNoteId);
          }
        } finally {
          sourceDb.close();
        }

        const addResults: Array<{
          relFile: string;
          sourceNoteId: string;
          rewrittenRelPath: string;
          noteId: string;
          chunkCount: number;
        }> = [];

        for (let index = 0; index < testdataFiles.length; index++) {
          const relFile = testdataFiles[index]!;
          const sourceContent = await Bun.file(join(testdataRoot, relFile)).text();
          const docDate = testdataDocDate(relFile);
          const sourceVaultPath = `sources/testdata/${relFile}`;
          const sourceNoteId = `source-testdata-${index}-${hashContent(relFile).slice(0, 8)}`;
          const rewrittenRelPath = `rewritten/testdata/${docDate}/${relFile}`;
          const rewrittenContent = buildCorpusRewriteFixture({
            index,
            relPath: relFile,
            sourceNoteId,
            sourceVaultPath,
            sourceContent,
          });

          const result = await addMarkdownNoteToVault({
            vaultRoot,
            vaultName: VAULT_NAME,
            relPath: rewrittenRelPath,
            content: rewrittenContent,
            vaultConfig,
            embedProvider: provider,
            vectorCollection: asAddNoteVectorCollection(collection),
          });

          expect(result.status).toBe("added");
          expect(result.layer).toBe("rewritten");
          expect(result.chunkCount).toBeGreaterThan(0);
          addResults.push({
            relFile,
            sourceNoteId,
            rewrittenRelPath,
            noteId: result.noteId,
            chunkCount: result.chunkCount,
          });
        }

        expect(addResults).toHaveLength(testdataFiles.length);

        const indexedDb = new MetaDB(vaultRoot);
        try {
          const sourceNotes = indexedDb
            .listNotes(VAULT_NAME, 100_000, 0)
            .filter((note) => note.layer === "source");
          const rewrittenNotes = indexedDb
            .listNotes(VAULT_NAME, 100_000, 0)
            .filter((note) => note.layer === "rewritten");
          expect(sourceNotes.length).toBe(testdataFiles.length);
          expect(rewrittenNotes.length).toBe(testdataFiles.length);

          let totalChunks = 0;
          const allChunkIds: string[] = [];
          for (const result of addResults) {
            const sourceNote = indexedDb.getNote(result.sourceNoteId);
            const rewrittenNote = indexedDb.getNoteByPath(VAULT_NAME, result.rewrittenRelPath);
            expect(sourceNote?.layer).toBe("source");
            expect(indexedDb.getChunksByNote(result.sourceNoteId)).toEqual([]);
            expect(rewrittenNote?.source_note_id).toBe(result.sourceNoteId);
            expect(rewrittenNote?.source_path).toBe(`sources/testdata/${result.relFile}`);
            expect(rewrittenNote?.vector_sync_status).toBe("synced");

            const chunks = indexedDb.getChunksByNote(result.noteId);
            expect(chunks.length).toBe(result.chunkCount);
            expect(chunks.length).toBeGreaterThan(0);
            totalChunks += chunks.length;
            allChunkIds.push(...chunks.map((chunk) => chunk.id));
          }

          expect(totalChunks).toBeGreaterThan(testdataFiles.length);
          const fetchedVectors = collection.fetchSync(allChunkIds);
          expect(Object.keys(fetchedVectors).length).toBe(allChunkIds.length);
          for (const chunkId of allChunkIds) {
            const fetched = fetchedVectors[chunkId];
            expect(fetched?.vectors?.embedding).toHaveLength(embeddingDim);
            expect(String(fetched?.fields?.file_path).startsWith("rewritten/testdata/")).toBe(true);
          }

          const keywordHits = indexedDb.searchFts("임베딩", 20, VAULT_NAME);
          expect(keywordHits.length).toBeGreaterThan(0);
        } finally {
          indexedDb.close();
        }

        const semanticCorpusSearch = await search(vaultRoot, VAULT_NAME, "한국어 임베딩 하이브리드 검색", {
          mode: "semantic",
          top: 10,
        });
        expect(semanticCorpusSearch.results.length).toBeGreaterThan(0);
        expect(
          semanticCorpusSearch.results.every((result) =>
            result.filePath.startsWith("rewritten/testdata/"),
          ),
        ).toBe(true);

        const hybridCorpusSearch = await search(vaultRoot, VAULT_NAME, "자연어처리 임베딩", {
          mode: "hybrid",
          top: 10,
        });
        expect(hybridCorpusSearch.results.length).toBeGreaterThan(0);
        expect(
          hybridCorpusSearch.results.some((result) =>
            result.content.includes("자연어") || result.content.includes("임베딩"),
          ),
        ).toBe(true);
      } finally {
        destroyCollection(collection);
        rmSync(vaultRoot, { recursive: true, force: true });
      }
    });
  }, ALL_TESTDATA_TIMEOUT_MS);

  test("rewrites testdata through Codex agent contract, embeds with TEI, and searches in Korean", async () => {
    const provider = buildTeiProvider();

    const vaultRoot = join("/tmp", `kn-tei-e2e-vault-${randomUUID()}`);
    const vectorPath = join(vaultRoot, ".kn", "vectors");
    const sourceRelPath = E2E_SOURCE_REL_PATH;
    const rewrittenRelPath = E2E_REWRITTEN_REL_PATH;
    const artifactRelPath = E2E_ARTIFACT_REL_PATH;
    const sourceNoteId = E2E_SOURCE_NOTE_ID;
    const sourceContent = await Bun.file(join(process.cwd(), "testdata", E2E_SOURCE_BASENAME)).text();
    const templateContent = await Bun.file(join(process.cwd(), "docs", "template.md")).text();
    const vaultConfig = buildTeiVaultConfig();

    let collection: ReturnType<typeof createVaultCollection> | null = null;

    try {
      await withResolvedTeiDimension(provider, async () => {
        mkdirSync(join(vaultRoot, "sources", E2E_DATE), { recursive: true });
        mkdirSync(join(vaultRoot, "codex-agent"), { recursive: true });
        await Bun.write(join(vaultRoot, sourceRelPath), sourceContent);
        printE2EDocument("SOURCE", sourceRelPath, sourceContent);
        await saveVaultConfig(vaultRoot, vaultConfig);
        collection = createVaultCollection(vectorPath, "vault", TEI_MODEL);

        const metaDb = new MetaDB(vaultRoot);
        try {
          metaDb.upsertNote({
            id: sourceNoteId,
            vaultId: VAULT_NAME,
            filePath: sourceRelPath,
            title: `${E2E_DATE} daily source`,
            fileHash: hashContent(sourceContent),
            docDate: E2E_DATE,
            layer: "source",
            kind: "source",
            language: "cjk",
          });

          const rewriteContext = await buildRewriteContextBundle({
            metaDb,
            vaultRoot,
            vaultName: VAULT_NAME,
            source: sourceRelPath,
            includeContent: true,
            maxChars: 8_000,
          });
          const codexPrompt = buildCodexRewritePrompt({
            context: rewriteContext,
            templateContent,
            sourceNoteId,
            sourcePath: sourceRelPath,
            rewrittenVaultPath: rewrittenRelPath,
            rewrittenPath: "rewritten.md",
            artifactPath: "artifact.md",
          });

          expect(codexPrompt).toContain("You are Codex");
          expect(codexPrompt).toContain("layer: rewritten");
          expect(codexPrompt).toContain("layer: artifact");
          expect(codexPrompt).toContain("source_path");
          expect(codexPrompt).toContain("Do not invent");
          expect(codexPrompt).toContain(E2E_DATE);
          expect(codexPrompt).toContain("자연어처리");

          let rewrittenContent: string;
          let artifactContent: string;
          if (RUN_CODEX_CLI_E2E) {
            const agentWorkspace = join(vaultRoot, "codex-agent");
            await Bun.write(join(agentWorkspace, "source.md"), sourceContent);
            await Bun.write(join(agentWorkspace, "template.md"), templateContent);
            const agentResult = await runCodexCliAgent({
              workspace: agentWorkspace,
              prompt: codexPrompt,
            });
            rewrittenContent = agentResult.rewrittenContent;
            artifactContent = agentResult.artifactContent;
            expect(agentResult.lastMessage).toContain("rewritten.md");
            expect(agentResult.lastMessage).toContain("artifact.md");
          } else {
            rewrittenContent = buildCodexAuthoredRewrittenFixture({
              sourceNoteId,
              sourcePath: sourceRelPath,
              sourceContent,
            });
            artifactContent = buildCodexAuthoredArtifactFixture({
              rewrittenPath: rewrittenRelPath,
            });
          }

          printE2EDocument("REWRITTEN", rewrittenRelPath, rewrittenContent);
          printE2EDocument("ARTIFACT", artifactRelPath, artifactContent);

          if (!collection) throw new Error("zvec collection was not initialized");
          const addResult = await addMarkdownNoteToVault({
            vaultRoot,
            vaultName: VAULT_NAME,
            relPath: rewrittenRelPath,
            content: rewrittenContent,
            vaultConfig,
            embedProvider: provider,
            vectorCollection: asAddNoteVectorCollection(collection),
          });

          expect(addResult.status).toBe("added");
          expect(addResult.layer).toBe("rewritten");
          expect(addResult.chunkCount).toBeGreaterThan(0);

          const artifactResult = await addMarkdownNoteToVault({
            vaultRoot,
            vaultName: VAULT_NAME,
            relPath: artifactRelPath,
            content: artifactContent,
            vaultConfig,
            embedProvider: provider,
            vectorCollection: asAddNoteVectorCollection(collection),
          });

          expect(artifactResult.status).toBe("added");
          expect(artifactResult.layer).toBe("artifact");
          expect(artifactResult.chunkCount).toBeGreaterThan(0);
        } finally {
          metaDb.close();
        }

        const indexedDb = new MetaDB(vaultRoot);
        try {
          const rewrittenNote = indexedDb.getNoteByPath(VAULT_NAME, rewrittenRelPath);
          const artifactNote = indexedDb.getNoteByPath(VAULT_NAME, artifactRelPath);
          if (!rewrittenNote || !artifactNote) {
            throw new Error("Expected rewritten and artifact notes to be indexed");
          }
          expect(rewrittenNote.vector_sync_status).toBe("synced");
          expect(rewrittenNote.layer).toBe("rewritten");
          expect(rewrittenNote.source_note_id).toBe(sourceNoteId);
          expect(rewrittenNote.source_path).toBe(sourceRelPath);
          expect(rewrittenNote.rewrite_agent).toBe(RUN_CODEX_CLI_E2E ? "codex-cli" : "codex-test-harness");
          expect(indexedDb.getChunksByNote(rewrittenNote.id).length).toBeGreaterThan(0);
          expect(artifactNote.vector_sync_status).toBe("synced");
          expect(artifactNote.layer).toBe("artifact");
          expect(artifactNote.source_path).toBe(rewrittenRelPath);
          expect(artifactNote.artifact_template_id).toBe("daily-report");
          expect(indexedDb.getChunksByNote(artifactNote.id).length).toBeGreaterThan(0);

          const keywordHits = indexedDb.searchFts("임베딩", 10, VAULT_NAME);
          expect(keywordHits.length).toBeGreaterThan(0);
          expect(keywordHits.some((hit) => hit.noteId === rewrittenNote.id)).toBe(true);
        } finally {
          indexedDb.close();
        }

        const keywordResult = await search(vaultRoot, VAULT_NAME, "임베딩", {
          mode: "keyword",
          top: 5,
        });
        expect(keywordResult.results.length).toBeGreaterThan(0);
        expect(keywordResult.results[0]?.filePath).toBe(rewrittenRelPath);
        expect(keywordResult.results[0]?.content).toContain("임베딩");

        const artifactExcluded = await search(vaultRoot, VAULT_NAME, "Workout", {
          mode: "keyword",
          top: 5,
        });
        expect(artifactExcluded.results.some((result) => result.filePath === artifactRelPath)).toBe(false);

        const artifactIncluded = await search(vaultRoot, VAULT_NAME, "Workout", {
          mode: "keyword",
          top: 5,
          includeArtifacts: true,
        });
        expect(artifactIncluded.results.some((result) => result.filePath === artifactRelPath)).toBe(true);

        const [queryEmbedding] = await provider.embed(["로컬 TEI 임베딩과 벡터 검색"]);
        const semanticRows = collection.querySync(semanticQuery(queryEmbedding!, 5));
        expect(semanticRows.length).toBeGreaterThan(0);
        expect(
          semanticRows.some((row: any) =>
            row.fields?.file_path === rewrittenRelPath || row.data?.file_path === rewrittenRelPath
          ),
        ).toBe(true);
      });
    } finally {
      destroyCollection(collection);
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  }, CODEX_TIMEOUT_MS + 60_000);
});
