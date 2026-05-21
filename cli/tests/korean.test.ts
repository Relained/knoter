import { test, expect, afterAll, beforeAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { MetaDB } from "../src/stores/meta-store";
import type { NoteInput, ChunkInsert } from "../src/stores/meta-store";
import {
  createVaultCollection,
  toZVecDoc,
  semanticQuery,
  toSearchResult,
  EMBEDDING_DIMENSIONS,
} from "../src/stores/vec-store";
import type { ChunkInput } from "../src/stores/vec-store";
import { detectLanguage } from "../src/pipeline/chunker";
import { testOutputPath } from "./helpers/test-paths";

// ─── Deterministic embedding ──────────────────────────────────────────────────
// To keep tests hermetic, we don't call a real embedding provider. Instead we
// build a reproducible 768-dim vector by hashing text bytes into buckets. Texts
// that share more characters get more overlap, so cosine similarity is a rough
// proxy for lexical overlap — sufficient to verify that a semantic query ranks
// the matching Korean note above unrelated notes.

const DIM = EMBEDDING_DIMENSIONS["nomic-embed-text"]!; // 768

function embed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  // Iterate by Unicode code points so Hangul syllables (each 3 bytes in UTF-8)
  // contribute as a single unit.
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // Spread each code point across a few buckets for smoother vectors.
    v[cp % DIM]! += 1;
    v[(cp * 131) % DIM]! += 0.5;
    v[(cp * 977) % DIM]! += 0.25;
  }
  // L2 normalize.
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_DIR = testOutputPath("test_korean_vault");
const VAULT_ID = "korean-vault";

let db: MetaDB;
let collection: ReturnType<typeof createVaultCollection>;

const notes: Array<{ id: string; title: string; content: string }> = [
  {
    id: "note-ko-1",
    title: "한국어 자연어 처리",
    content:
      "한국어 자연어 처리는 형태소 분석이 핵심이다. 조사가 단어에 붙어 있어 토큰화가 어렵다. 한글 임베딩 모델은 문맥을 잘 포착한다.",
  },
  {
    id: "note-ko-2",
    title: "검색 엔진 기초",
    content:
      "전문 검색은 역색인을 사용한다. BM25는 전통적인 가중치 함수이다. 벡터 검색은 의미적 유사도를 측정한다.",
  },
  {
    id: "note-en-1",
    title: "Rust Ownership",
    content:
      "Rust uses ownership and borrowing to ensure memory safety without garbage collection. The compiler enforces lifetimes at compile time.",
  },
];

beforeAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  mkdirSync(TEST_DIR, { recursive: true });

  db = new MetaDB(`${TEST_DIR}/meta.db`);
  db.setEmbeddingModel(VAULT_ID, "nomic-embed-text");

  collection = createVaultCollection(
    `${TEST_DIR}/zvec`,
    VAULT_ID,
    "nomic-embed-text",
  );

  for (const n of notes) {
    const note: NoteInput = {
      id: n.id,
      vaultId: VAULT_ID,
      filePath: `${n.id}.md`,
      title: n.title,
      fileHash: `hash-${n.id}`,
    };
    db.upsertNote(note);

    const chunkId = `${n.id}-c0`;
    const chunk: ChunkInsert = {
      id: chunkId,
      noteId: n.id,
      content: n.content,
      offsetStart: 0,
      offsetEnd: n.content.length,
      tokenCount: Math.ceil(n.content.length / 4),
      seqIndex: 0,
    };
    db.insertChunks([chunk]);
    // searchFts filters by `vector_sync_status = 'synced'`; mark notes synced
    // so they are eligible for keyword search results.
    db.markSynced(n.id);

    const docInput: ChunkInput = {
      id: chunkId,
      noteId: n.id,
      filePath: note.filePath,
      title: n.title,
      content: n.content,
      offsetStart: 0,
      offsetEnd: n.content.length,
      tokenCount: chunk.tokenCount,
      seqIndex: 0,
      docTitle: n.title,
      embedding: embed(n.content),
    };
    collection.insertSync(toZVecDoc(docInput));
  }
});

afterAll(() => {
  try {
    collection.destroySync();
  } catch {}
  db.close();
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
});

// ─── Language detection ───────────────────────────────────────────────────────

test("detectLanguage classifies Korean content as cjk", () => {
  expect(detectLanguage(notes[0]!.content)).toBe("cjk");
  expect(detectLanguage(notes[2]!.content)).toBe("latin");
});

// ─── FTS5 keyword search (trigram tokenizer, CJK-friendly) ────────────────────

test("Korean keyword search matches hangul substring", () => {
  // "한국어" is a substring of the first note only.
  const hits = db.searchFts("한국어", 10, VAULT_ID);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]!.chunkId).toBe("note-ko-1-c0");
});

test("Korean keyword search ignores notes in other languages", () => {
  const hits = db.searchFts("형태소", 10, VAULT_ID);
  // Only note-ko-1 mentions 형태소 (morpheme).
  expect(hits.map((h) => h.chunkId)).toEqual(["note-ko-1-c0"]);
});

test("Korean keyword search matches a 3+ char CJK term", () => {
  // "역색인" (inverted index) appears only in note-ko-2.
  // trigram tokenizer requires terms of at least 3 characters.
  const hits = db.searchFts("역색인", 10, VAULT_ID);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0]!.chunkId).toBe("note-ko-2-c0");
});

test("short CJK query falls back when trigram cannot match", () => {
  // "검색" is only 2 hangul syllables. FTS5 trigram cannot match this, so
  // search should now fall back to a scoped LIKE query.
  const hits = db.searchFts("검색", 10, VAULT_ID);
  expect(hits.map((h) => h.chunkId)).toEqual(["note-ko-2-c0"]);
  expect(hits[0]!.score).toBeGreaterThan(0);
});

test("short CJK fallback treats SQL LIKE wildcards as literals", () => {
  const hits = db.searchFts("검%", 10, VAULT_ID);
  expect(hits).toEqual([]);
});

test("short CJK fallback does not drop other query terms", () => {
  const hits = db.searchFts("존재하지않는단어 검색", 10, VAULT_ID);
  expect(hits).toEqual([]);
});

test("short CJK fallback does not split longer CJK queries into partial OR terms", () => {
  const hits = db.searchFts("검색엔진", 10, VAULT_ID);
  expect(hits).toEqual([]);
});

test("short CJK fallback still excludes artifact notes by default", () => {
  const artifactNote: NoteInput = {
    id: "note-artifact-ko",
    vaultId: VAULT_ID,
    filePath: "artifact-ko.md",
    title: "artifact",
    fileHash: "hash-note-artifact-ko",
    layer: "artifact",
  };
  db.upsertNote(artifactNote);
  db.insertChunks([
    {
      id: "note-artifact-ko-c0",
      noteId: "note-artifact-ko",
      content: "검색 아티팩트 결과",
      offsetStart: 0,
      offsetEnd: 10,
      tokenCount: 3,
      seqIndex: 0,
    },
  ]);
  db.markSynced(artifactNote.id);

  const defaultHits = db.searchFts("검색", 10, VAULT_ID);
  expect(defaultHits.map((h) => h.chunkId)).toEqual(["note-ko-2-c0"]);

  const artifactHits = db.searchFts("검색", 10, VAULT_ID, 0, true);
  expect(artifactHits.map((h) => h.chunkId)).toContain("note-artifact-ko-c0");
});

test("Korean keyword search yields no hits for an absent term", () => {
  const hits = db.searchFts("존재하지않는단어", 10, VAULT_ID);
  expect(hits).toEqual([]);
});

test("mixed-language query finds only the Korean note", () => {
  // English term "Rust" only appears in the English note.
  const english = db.searchFts("Rust", 10, VAULT_ID);
  expect(english.map((h) => h.chunkId)).toEqual(["note-en-1-c0"]);

  // "의미적" appears only in note-ko-2 (3 chars → trigram-friendly).
  const korean = db.searchFts("의미적", 10, VAULT_ID);
  expect(korean.map((h) => h.chunkId)).toEqual(["note-ko-2-c0"]);
});

// ─── zvec semantic search with Korean embeddings ──────────────────────────────

test("Korean embedding vector has correct dimensionality and is normalized", () => {
  const v = embed("한국어 임베딩 테스트");
  expect(v.length).toBe(DIM);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  expect(norm).toBeCloseTo(1, 5);
});

test("semantic search ranks the related Korean note first", () => {
  const queryText = "한국어 형태소 분석과 임베딩";
  const queryVec = embed(queryText);

  const raw = collection.querySync(
    semanticQuery(queryVec, 10),
  );
  const results = raw.map(toSearchResult);

  expect(results.length).toBeGreaterThan(0);
  // The most similar note (by character overlap → vector overlap) should be
  // note-ko-1, which talks about Korean NLP and embeddings.
  expect(results[0]!.id).toBe("note-ko-1-c0");
});

test("semantic search ranks unrelated English note last", () => {
  const queryVec = embed("한국어 검색 엔진");
  const raw = collection.querySync(semanticQuery(queryVec, 10));
  const results = raw.map(toSearchResult);

  const lastId = results.at(-1)!.id;
  expect(lastId).toBe("note-en-1-c0");
});
