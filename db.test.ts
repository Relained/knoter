import { test, expect, afterAll } from "bun:test";
import { MetaDB } from "./db";
import type { NoteInput, ChunkInsert } from "./db";

const db = MetaDB.openInMemory();

afterAll(() => {
  db.close();
});

// ── Schema ──────────────────────────────────────────────────────────────────

test("schema tables are created", () => {
  const tables = db.db
    .query(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  const names = tables.map((t) => t.name);

  expect(names).toContain("notes");
  expect(names).toContain("chunks");
  expect(names).toContain("tags");
  expect(names).toContain("chunks_fts");
  expect(names).toContain("chunks_ai");
  expect(names).toContain("chunks_ad");
  expect(names).toContain("chunks_au");
});

// ── Notes CRUD ──────────────────────────────────────────────────────────────

const sampleNote: NoteInput = {
  id: "note_001",
  vaultId: "personal",
  filePath: "notes/linux/btrfs-guide.md",
  title: "BTRFS 관리 가이드",
  fileHash: "abc123hash",
  createdAt: new Date("2025-11-03T14:22:00Z"),
};

test("insert and get note", () => {
  db.insertNote(sampleNote);
  const row = db.getNote("note_001");
  expect(row).not.toBeNull();
  expect(row!.vault_id).toBe("personal");
  expect(row!.file_path).toBe("notes/linux/btrfs-guide.md");
  expect(row!.title).toBe("BTRFS 관리 가이드");
  expect(row!.file_hash).toBe("abc123hash");
  expect(row!.indexed_at).toBeTruthy();
});

test("getNoteByPath", () => {
  const row = db.getNoteByPath("personal", "notes/linux/btrfs-guide.md");
  expect(row).not.toBeNull();
  expect(row!.id).toBe("note_001");
});

test("upsert note updates file_hash", () => {
  db.upsertNote({ ...sampleNote, fileHash: "newhash456" });
  const row = db.getNote("note_001");
  expect(row!.file_hash).toBe("newhash456");
});

test("listNotes returns notes for vault", () => {
  db.insertNote({
    id: "note_002",
    vaultId: "personal",
    filePath: "notes/capstone/week1.md",
    title: "캡스톤 1주차",
    fileHash: "def789hash",
  });
  const notes = db.listNotes("personal");
  expect(notes.length).toBe(2);
  // file_path 순 정렬
  expect(notes[0]!.file_path).toBe("notes/capstone/week1.md");
  expect(notes[1]!.file_path).toBe("notes/linux/btrfs-guide.md");
});

// ── Chunks CRUD ─────────────────────────────────────────────────────────────

const sampleChunks: ChunkInsert[] = [
  {
    id: "chunk_001",
    noteId: "note_001",
    heading: "서브볼륨 스냅샷",
    content: "서브볼륨 스냅샷은 COW 특성을 활용하여 효율적으로 백업을 수행한다.",
    offsetStart: 0,
    offsetEnd: 120,
    tokenCount: 32,
  },
  {
    id: "chunk_002",
    noteId: "note_001",
    heading: "마운트 옵션",
    content: "compress=zstd 옵션을 사용하면 투명 압축이 활성화된다.",
    offsetStart: 120,
    offsetEnd: 240,
    tokenCount: 28,
  },
];

test("insert and query chunks", () => {
  db.insertChunks(sampleChunks);
  const chunks = db.getChunksByNote("note_001");
  expect(chunks.length).toBe(2);
  // offset_start 순 정렬
  expect(chunks[0]!.id).toBe("chunk_001");
  expect(chunks[1]!.id).toBe("chunk_002");
  expect(chunks[0]!.heading).toBe("서브볼륨 스냅샷");
});

// ── FTS5 Search ─────────────────────────────────────────────────────────────

test("FTS5 search returns matching chunks", () => {
  // FTS5 기본 토크나이저는 한국어 단독 토큰 분리를 보장하지 않으므로
  // 영어 키워드(compress, zstd, COW)로 테스트
  const results = db.searchFts("compress");
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]!.chunkId).toBe("chunk_002");
  expect(results[0]!.content).toContain("compress");
});

test("FTS5 search for non-matching term returns empty", () => {
  const results = db.searchFts("nonexistentword12345");
  expect(results.length).toBe(0);
});

// ── Tags CRUD ───────────────────────────────────────────────────────────────

test("setTags and getTagsByNote", () => {
  db.setTags("note_001", [
    { tag: "linux", source: "frontmatter" },
    { tag: "filesystem", source: "frontmatter" },
  ]);
  const tags = db.getTagsByNote("note_001");
  expect(tags.length).toBe(2);
  expect(tags.map((t) => t.tag).sort()).toEqual(["filesystem", "linux"]);
  expect(tags[0]!.source).toBe("filesystem" === tags[0]!.tag ? "frontmatter" : "frontmatter");
});

test("addTag and removeTag", () => {
  db.addTag("note_001", "btrfs", "auto");
  let tags = db.getTagsByNote("note_001");
  expect(tags.map((t) => t.tag)).toContain("btrfs");

  db.removeTag("note_001", "btrfs");
  tags = db.getTagsByNote("note_001");
  expect(tags.map((t) => t.tag)).not.toContain("btrfs");
});

test("addTag ignores duplicates", () => {
  db.addTag("note_001", "linux");
  const tags = db.getTagsByNote("note_001");
  const linuxCount = tags.filter((t) => t.tag === "linux").length;
  expect(linuxCount).toBe(1);
});

test("getNotesByTag", () => {
  db.setTags("note_002", [{ tag: "capstone" }]);
  const linuxNotes = db.getNotesByTag("linux", "personal");
  expect(linuxNotes.length).toBe(1);
  expect(linuxNotes[0]!.id).toBe("note_001");

  const capstoneNotes = db.getNotesByTag("capstone");
  expect(capstoneNotes.length).toBe(1);
  expect(capstoneNotes[0]!.id).toBe("note_002");
});

test("listAllTags returns counts", () => {
  const allTags = db.listAllTags("personal");
  expect(allTags.length).toBeGreaterThanOrEqual(3);
  // count DESC 정렬
  for (let i = 1; i < allTags.length; i++) {
    expect(allTags[i - 1]!.count).toBeGreaterThanOrEqual(allTags[i]!.count);
  }
});

// ── Vault Status ────────────────────────────────────────────────────────────

test("getVaultStatus", () => {
  const status = db.getVaultStatus("personal");
  expect(status.noteCount).toBe(2);
  expect(status.chunkCount).toBe(2); // only note_001 has chunks
  expect(status.tagCount).toBeGreaterThanOrEqual(2);
  expect(status.lastIndexedAt).toBeTruthy();
});

// ── Delete Cascade ──────────────────────────────────────────────────────────

test("delete note cascades to chunks and tags", () => {
  db.deleteNote("note_001");

  expect(db.getNote("note_001")).toBeNull();
  expect(db.getChunksByNote("note_001").length).toBe(0);
  expect(db.getTagsByNote("note_001").length).toBe(0);

  // FTS should also be cleaned via trigger
  const ftsResults = db.searchFts("스냅샷");
  expect(ftsResults.length).toBe(0);
});

// ── Reindex ─────────────────────────────────────────────────────────────────

test("reindexNote atomically replaces chunks and tags", () => {
  // 초기 데이터 삽입
  const note: NoteInput = {
    id: "note_reindex",
    vaultId: "personal",
    filePath: "notes/test/reindex.md",
    title: "Reindex Test",
    fileHash: "hash_v1",
  };
  db.insertNote(note);
  db.insertChunks([
    {
      id: "old_chunk_1",
      noteId: "note_reindex",
      content: "old content alpha",
      offsetStart: 0,
      offsetEnd: 50,
      tokenCount: 10,
    },
  ]);
  db.setTags("note_reindex", [{ tag: "old_tag" }]);

  // 재인덱싱
  db.reindexNote(
    { ...note, fileHash: "hash_v2", title: "Reindex Test v2" },
    [
      {
        id: "new_chunk_1",
        noteId: "note_reindex",
        content: "new content beta",
        offsetStart: 0,
        offsetEnd: 60,
        tokenCount: 12,
      },
      {
        id: "new_chunk_2",
        noteId: "note_reindex",
        content: "new content gamma",
        offsetStart: 60,
        offsetEnd: 120,
        tokenCount: 14,
      },
    ],
    [{ tag: "new_tag", source: "auto" }],
  );

  // 검증
  const updatedNote = db.getNote("note_reindex");
  expect(updatedNote!.file_hash).toBe("hash_v2");
  expect(updatedNote!.title).toBe("Reindex Test v2");

  const chunks = db.getChunksByNote("note_reindex");
  expect(chunks.length).toBe(2);
  expect(chunks[0]!.id).toBe("new_chunk_1");

  const tags = db.getTagsByNote("note_reindex");
  expect(tags.length).toBe(1);
  expect(tags[0]!.tag).toBe("new_tag");
  expect(tags[0]!.source).toBe("auto");

  // 기존 청크는 FTS에서도 사라져야 함
  expect(db.searchFts("alpha").length).toBe(0);
  // 새 청크는 FTS에서 검색 가능
  expect(db.searchFts("beta").length).toBe(1);
});
