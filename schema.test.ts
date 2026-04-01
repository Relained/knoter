import { test, expect, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import {
  createVaultCollection,
  toZVecDoc,
  semanticQuery,
  keywordQuery,
  mergeByRRF,
  toSearchResult,
  tagFilter,
  dateFilter,
  combineFilters,
  EMBEDDING_DIMENSIONS,
} from "./schema";

const TEST_INDEX_DIR = "./test_zvec_index";
const DIM = EMBEDDING_DIMENSIONS["nomic-embed-text"]; // 768

// 간단한 임의 벡터 생성 (테스트용)
function randomVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

// 테스트 컬렉션
const collection = createVaultCollection(TEST_INDEX_DIR, "test_vault");

afterAll(() => {
  collection.destroySync();
  try {
    rmSync(TEST_INDEX_DIR, { recursive: true, force: true });
  } catch {}
});

test("schema has correct vector and scalar fields", () => {
  const schema = collection.schema;

  // Vector fields
  const vectors = schema.vectors();
  expect(vectors.length).toBe(2);
  expect(vectors.map((v) => v.name).sort()).toEqual(["embedding", "sparse"]);

  // Scalar fields
  const fields = schema.fields();
  const fieldNames = fields.map((f) => f.name).sort();
  expect(fieldNames).toContain("note_id");
  expect(fieldNames).toContain("file_path");
  expect(fieldNames).toContain("title");
  expect(fieldNames).toContain("heading");
  expect(fieldNames).toContain("content");
  expect(fieldNames).toContain("offset_start");
  expect(fieldNames).toContain("offset_end");
  expect(fieldNames).toContain("token_count");
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
    content: "서브볼륨 스냅샷은 COW 특성을 활용하여 효율적으로 백업을 수행한다.",
    offsetStart: 0,
    offsetEnd: 120,
    tokenCount: 32,
    tags: ["linux", "filesystem"],
    createdAt: new Date("2025-11-03T14:22:00Z"),
    embedding: randomVec(DIM),
    sparse: { 42: 0.8, 100: 0.3, 555: 0.5 },
  });

  const status = collection.insertSync(doc);
  expect(status.ok).toBe(true);

  // Fetch by ID
  const fetched = collection.fetchSync("chunk_001");
  expect(fetched["chunk_001"]).toBeDefined();
  expect(fetched["chunk_001"]!.fields.note_id).toBe("note_abc");
  expect(fetched["chunk_001"]!.fields.title).toBe("BTRFS 관리 가이드");
  expect(fetched["chunk_001"]!.fields.tags).toEqual(["linux", "filesystem"]);
});

test("insert multiple chunks and search semantically", () => {
  const baseVec = randomVec(DIM);
  // 약간 변형한 유사 벡터
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
      tags: ["capstone"],
      embedding: differentVec,
    }),
  ];

  const statuses = collection.insertSync(docs);
  expect(statuses.every((s) => s.ok)).toBe(true);

  // Semantic search — similarVec에 가까운 chunk_002가 상위에 와야 함
  const results = collection.querySync(semanticQuery(similarVec, 5));
  expect(results.length).toBeGreaterThan(0);

  const topResult = toSearchResult(results[0]!);
  expect(topResult.id).toBe("chunk_002");
  expect(topResult.filePath).toBe("notes/linux/btrfs-guide.md");
});

test("keyword (sparse) search", () => {
  // chunk_001에 넣은 sparse: { 42: 0.8, 100: 0.3, 555: 0.5 }
  const results = collection.querySync(
    keywordQuery({ 42: 1.0, 555: 0.5 }, 5),
  );
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]!.id).toBe("chunk_001");
});

test("filter by tags", () => {
  const filter = tagFilter(["capstone"]);
  const results = collection.querySync({
    filter,
    topk: 10,
    outputFields: ["note_id", "file_path", "tags"],
  });
  expect(results.length).toBe(1);
  expect(results[0]!.fields.tags).toContain("capstone");

  // 여러 태그 AND 필터
  const filter2 = tagFilter(["linux", "filesystem"]);
  const results2 = collection.querySync({
    filter: filter2,
    topk: 10,
    outputFields: ["tags"],
  });
  expect(results2.length).toBe(2); // chunk_001, chunk_002
});

test("RRF merge produces combined ranking", () => {
  const vec = randomVec(DIM);
  const semanticResults = collection.querySync(semanticQuery(vec, 5));
  const kwResults = collection.querySync(
    keywordQuery({ 42: 1.0, 555: 0.5 }, 5),
  );

  const merged = mergeByRRF(semanticResults, kwResults, 10);
  expect(merged.length).toBeGreaterThan(0);
  // 모든 결과에 score가 있어야 함
  for (const r of merged) {
    expect(r.score).toBeGreaterThan(0);
    expect(r.filePath).toBeTruthy();
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
    embedding: randomVec(DIM),
    // title, heading, tags, sparse, createdAt 모두 생략
  });

  // STRING nullable → "" (not null)
  expect(doc.fields.title).toBe("");
  // heading → ""
  expect(doc.fields.heading).toBe("");
  // ARRAY_STRING nullable → [] (not null)
  expect(doc.fields.tags).toEqual([]);
  // sparse → {} (not null)
  expect(doc.vectors.sparse).toEqual({});
  // createdAt/indexed_at should be numbers
  expect(typeof doc.fields.created_at).toBe("number");
  expect(typeof doc.fields.indexed_at).toBe("number");
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
