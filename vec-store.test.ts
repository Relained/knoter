import { test, expect, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import {
  createVaultCollection,
  toZVecDoc,
  semanticQuery,
  mergeByLinearFusion,
  mergeByRRF,
  toSearchResult,
  tagFilter,
  dateFilter,
  combineFilters,
  formatForEmbedding,
  isStrongSignal,
  isBM25StrongSignal,
  deduplicateAdjacentChunks,
  EMBEDDING_DIMENSIONS,
} from "./vec-store";
import type { SearchResult } from "./vec-store";
import type { FtsResult } from "./meta-store";

const TEST_INDEX_DIR = "./test_zvec_index";
const DIM = EMBEDDING_DIMENSIONS["nomic-embed-text"]; // 768

function randomVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

const collection = createVaultCollection(TEST_INDEX_DIR, "test_vault");

afterAll(() => {
  collection.destroySync();
  try {
    rmSync(TEST_INDEX_DIR, { recursive: true, force: true });
  } catch {}
});

test("schema has correct vector and scalar fields", () => {
  const schema = collection.schema;

  // Vector fields — sparse removed in v3
  const vectors = schema.vectors();
  expect(vectors.length).toBe(1);
  expect(vectors[0]!.name).toBe("embedding");

  // Scalar fields
  const fields = schema.fields();
  const fieldNames = fields.map((f) => f.name).sort();
  expect(fieldNames).toContain("note_id");
  expect(fieldNames).toContain("file_path");
  expect(fieldNames).toContain("title");
  expect(fieldNames).toContain("heading");
  expect(fieldNames).toContain("heading_path");
  expect(fieldNames).toContain("content");
  expect(fieldNames).toContain("offset_start");
  expect(fieldNames).toContain("offset_end");
  expect(fieldNames).toContain("token_count");
  expect(fieldNames).toContain("seq_index");
  expect(fieldNames).toContain("doc_title");
  expect(fieldNames).toContain("tags");
  expect(fieldNames).toContain("created_at");
  expect(fieldNames).toContain("indexed_at");
});

test("insert and fetch chunks", () => {
  const doc = toZVecDoc({
    id: "chunk_001",
    noteId: "note_abc",
    filePath: "notes/linux/btrfs-guide.md",
    title: "BTRFS 관리 가이드",
    heading: "서브볼륨 스냅샷",
    headingPath: ["# BTRFS 관리 가이드", "## 서브볼륨 스냅샷"],
    content: "서브볼륨 스냅샷은 COW 특성을 활용하여 효율적으로 백업을 수행한다.",
    offsetStart: 0,
    offsetEnd: 120,
    tokenCount: 32,
    seqIndex: 0,
    docTitle: "BTRFS 관리 가이드",
    tags: ["linux", "filesystem"],
    createdAt: new Date("2025-11-03T14:22:00Z"),
    embedding: randomVec(DIM),
  });

  const status = collection.insertSync(doc);
  expect(status.ok).toBe(true);

  const fetched = collection.fetchSync("chunk_001");
  expect(fetched["chunk_001"]).toBeDefined();
  expect(fetched["chunk_001"]!.fields!.note_id).toBe("note_abc");
  expect(fetched["chunk_001"]!.fields!.title).toBe("BTRFS 관리 가이드");
  expect(fetched["chunk_001"]!.fields!.tags).toEqual(["linux", "filesystem"]);
  expect(fetched["chunk_001"]!.fields!.seq_index).toBe(0);
  expect(fetched["chunk_001"]!.fields!.doc_title).toBe("BTRFS 관리 가이드");
});

test("insert multiple chunks and search semantically", () => {
  const baseVec = randomVec(DIM);
  const similarVec = baseVec.map((v) => v + (Math.random() - 0.5) * 0.01);
  const differentVec = randomVec(DIM);

  const docs = [
    toZVecDoc({
      id: "chunk_002",
      noteId: "note_abc",
      filePath: "notes/linux/btrfs-guide.md",
      title: "BTRFS 관리 가이드",
      heading: "마운트 옵션",
      content: "compress=zstd 옵션을 사용하면 투명 압축이 활성화된다.",
      offsetStart: 120,
      offsetEnd: 240,
      tokenCount: 28,
      seqIndex: 1,
      tags: ["linux", "filesystem"],
      embedding: baseVec,
    }),
    toZVecDoc({
      id: "chunk_003",
      noteId: "note_def",
      filePath: "notes/capstone/week1-report.md",
      title: "캡스톤 1주차",
      content: "프로젝트 요구사항 분석을 완료했다.",
      offsetStart: 0,
      offsetEnd: 80,
      tokenCount: 15,
      seqIndex: 0,
      tags: ["capstone"],
      embedding: differentVec,
    }),
  ];

  const statuses = collection.insertSync(docs);
  expect(statuses.every((s) => s.ok)).toBe(true);

  const results = collection.querySync(semanticQuery(similarVec, 5));
  expect(results.length).toBeGreaterThan(0);

  const topResult = toSearchResult(results[0]!);
  expect(topResult.id).toBe("chunk_002");
  expect(topResult.filePath).toBe("notes/linux/btrfs-guide.md");
  expect(topResult.seqIndex).toBe(1);
});

test("filter by tags", () => {
  const filter = tagFilter(["capstone"]);
  const results = collection.querySync({
    filter,
    topk: 10,
    outputFields: ["note_id", "file_path", "tags"],
  });
  expect(results.length).toBe(1);
  expect(results[0]!.fields!.tags).toContain("capstone");

  const filter2 = tagFilter(["linux", "filesystem"]);
  const results2 = collection.querySync({
    filter: filter2,
    topk: 10,
    outputFields: ["tags"],
  });
  expect(results2.length).toBe(2);
});

test("linear fusion merge produces combined ranking", () => {
  const vec = randomVec(DIM);
  const semResults = collection.querySync(semanticQuery(vec, 5)).map(toSearchResult);

  const kwResults: FtsResult[] = [
    { chunkId: "chunk_001", noteId: "note_abc", content: "test", rank: -5.0, score: 5 / 6 },
    { chunkId: "chunk_003", noteId: "note_def", content: "test", rank: -2.0, score: 2 / 3 },
  ];

  const merged = mergeByLinearFusion(semResults, kwResults, 10);
  expect(merged.length).toBeGreaterThan(0);
  for (const r of merged) {
    expect(r.score).toBeGreaterThan(0);
    expect(r.scoreDetail).toBeDefined();
    expect(r.scoreDetail!.semantic).toBeDefined();
    expect(r.scoreDetail!.keyword).toBeDefined();
  }
});

test("RRF merge for query expansion sub-queries", () => {
  const vec1 = randomVec(DIM);
  const vec2 = randomVec(DIM);
  const results1 = collection.querySync(semanticQuery(vec1, 5)).map(toSearchResult);
  const results2 = collection.querySync(semanticQuery(vec2, 5)).map(toSearchResult);

  const merged = mergeByRRF([results1, results2], 10);
  expect(merged.length).toBeGreaterThan(0);
  for (const r of merged) {
    expect(r.score).toBeGreaterThan(0);
  }
});

test("toZVecDoc uses safe defaults for optional fields", () => {
  const doc = toZVecDoc({
    id: "chunk_defaults",
    noteId: "note_xyz",
    filePath: "notes/test.md",
    content: "테스트 내용",
    offsetStart: 0,
    offsetEnd: 50,
    tokenCount: 10,
    seqIndex: 0,
    embedding: randomVec(DIM),
  });

  expect(doc.fields!.title).toBe("");
  expect(doc.fields!.heading).toBe("");
  expect(doc.fields!.heading_path).toBe("");
  expect(doc.fields!.tags).toEqual([]);
  expect(doc.fields!.doc_title).toBe("");
  expect(doc.fields!.seq_index).toBe(0);
  expect(typeof doc.fields!.created_at).toBe("number");
  expect(typeof doc.fields!.indexed_at).toBe("number");
});

test("formatForEmbedding creates structured context string", () => {
  const result = formatForEmbedding({
    docTitle: "BTRFS Guide",
    headingPath: ["# Intro", "## Setup"],
    tags: ["linux", "filesystem"],
    content: "Some content here",
  });
  expect(result).toBe(
    "title: BTRFS Guide | section: # Intro > ## Setup | tags: linux, filesystem | text: Some content here",
  );

  // Minimal — content only
  const minimal = formatForEmbedding({ content: "Just content" });
  expect(minimal).toBe("text: Just content");
});

test("strong-signal shortcut", () => {
  const make = (score: number): SearchResult => ({
    id: "c", noteId: "n", filePath: "p", title: null, heading: null,
    headingPath: null, content: "", offsetStart: 0, offsetEnd: 0,
    tokenCount: 0, seqIndex: 0, tags: null, createdAt: null, score,
  });

  // Below floor
  expect(isStrongSignal([make(0.39), make(0.10)])).toBe(false);
  // At floor, product below threshold (0.40 * 0.10 = 0.04 < 0.06)
  expect(isStrongSignal([make(0.40), make(0.30)])).toBe(false);
  // At floor, product at threshold (0.40 * 0.15 = 0.06)
  expect(isStrongSignal([make(0.40), make(0.25)])).toBe(true);
  // Single result above floor
  expect(isStrongSignal([make(0.50)])).toBe(true);
});

test("BM25 strong-signal shortcut", () => {
  const make = (score: number): FtsResult => ({
    chunkId: "c", noteId: "n", content: "", rank: 0, score,
  });

  expect(isBM25StrongSignal([make(0.74), make(0.60)])).toBe(false);
  expect(isBM25StrongSignal([make(0.75), make(0.64)])).toBe(true);
  expect(isBM25StrongSignal([make(0.80)])).toBe(true);
});

test("deduplicateAdjacentChunks merges consecutive seq_index", () => {
  const make = (id: string, noteId: string, seqIndex: number, score: number): SearchResult => ({
    id, noteId, filePath: "test.md", title: null, heading: null,
    headingPath: null, content: `chunk_${seqIndex}`, offsetStart: seqIndex * 100,
    offsetEnd: (seqIndex + 1) * 100, tokenCount: 50, seqIndex, tags: null,
    createdAt: null, score,
  });

  const results = [
    make("c1", "n1", 0, 0.9),
    make("c2", "n1", 1, 0.8),
    make("c3", "n1", 3, 0.7), // gap — not adjacent
    make("c4", "n2", 0, 0.6),
  ];

  const deduped = deduplicateAdjacentChunks(results);
  // n1: chunks 0+1 merged, chunk 3 separate. n2: chunk 0.
  expect(deduped.length).toBe(3);

  const n1Merged = deduped.find((r) => r.noteId === "n1" && r.content.includes("chunk_0"));
  expect(n1Merged).toBeDefined();
  expect(n1Merged!.content).toContain("chunk_0");
  expect(n1Merged!.content).toContain("chunk_1");
  expect(n1Merged!.score).toBe(0.9); // max of merged
});

test("filter helpers", () => {
  expect(tagFilter(["linux", "filesystem"])).toBe(
    'tags CONTAIN_ALL ("linux", "filesystem")',
  );

  const d1 = new Date("2025-01-01");
  const d2 = new Date("2025-12-31");
  expect(dateFilter(d1, d2)).toBe(
    `created_at >= ${d1.getTime()} AND created_at <= ${d2.getTime()}`,
  );

  expect(combineFilters(undefined, "a > 1", undefined, "b < 2")).toBe(
    "a > 1 AND b < 2",
  );
  expect(combineFilters(undefined)).toBeUndefined();
});
