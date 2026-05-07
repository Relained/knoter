import { test, expect, afterAll } from "bun:test";
import { MetaDB } from "../src/stores/meta-store";
import type { NoteInput, ChunkInsert } from "../src/stores/meta-store";

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
  // v3 additions
  expect(names).toContain("preprocessors");
  // document-layer/report additions
  expect(names).toContain("note_signals");
  expect(names).toContain("pageindex_documents");
  expect(names).toContain("pageindex_nodes");
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
  db.upsertNote(sampleNote);
  const row = db.getNote("note_001");
  expect(row).not.toBeNull();
  expect(row!.vault_id).toBe("personal");
  expect(row!.file_path).toBe("notes/linux/btrfs-guide.md");
  expect(row!.title).toBe("BTRFS 관리 가이드");
  expect(row!.file_hash).toBe("abc123hash");
  expect(row!.layer).toBe("source");
  expect(row!.kind).toBeNull();
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
  db.upsertNote({
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

test("document layer, date, kind, and lineage are stored", () => {
  db.upsertNote({
    id: "note_rewritten_001",
    vaultId: "personal",
    filePath: "rewritten/2026-05-08/daily.md",
    title: "Daily rewritten source",
    fileHash: "rewrittenhash",
    docDate: "2026-05-08T09:00:00Z",
    layer: "rewritten",
    kind: "daily",
    lineage: {
      sourceNoteId: "note_001",
      sourcePath: "sources/2026-05-08/raw.md",
      rewriteAgent: "codex",
      rewritePromptHash: "prompt_hash",
    },
  });

  const row = db.getNote("note_rewritten_001");
  expect(row!.doc_date).toBe("2026-05-08");
  expect(row!.layer).toBe("rewritten");
  expect(row!.kind).toBe("daily");
  expect(row!.source_note_id).toBe("note_001");
  expect(row!.source_path).toBe("sources/2026-05-08/raw.md");
  expect(row!.rewrite_agent).toBe("codex");

  const byDate = db.listNotesByDate("personal", "2026-05-08", "rewritten");
  expect(byDate.map((note) => note.id)).toContain("note_rewritten_001");

  const derived = db.listDerivedNotes("note_001");
  expect(derived.map((note) => note.id)).toContain("note_rewritten_001");
});

test("kind is explicit only and does not infer from path", () => {
  db.upsertNote({
    id: "note_no_kind_inference",
    vaultId: "personal",
    filePath: "rewritten/2026-05-09/workout-daily-todo.md",
    title: "운동 todo daily",
    fileHash: "no-kind-hash",
    docDate: "2026-05-09",
    layer: "rewritten",
  });

  const row = db.getNote("note_no_kind_inference");
  expect(row!.kind).toBeNull();
});

// ── Chunks CRUD ─────────────────────────────────────────────────────────────

const sampleChunks: ChunkInsert[] = [
  {
    id: "chunk_001",
    noteId: "note_001",
    heading: "서브볼륨 스냅샷",
    headingPath: ["# BTRFS 관리 가이드", "## 서브볼륨 스냅샷"],
    content: "서브볼륨 스냅샷은 COW 특성을 활용하여 효율적으로 백업을 수행한다.",
    offsetStart: 0,
    offsetEnd: 120,
    tokenCount: 32,
    seqIndex: 0,
    nextChunkId: "chunk_002",
  },
  {
    id: "chunk_002",
    noteId: "note_001",
    heading: "마운트 옵션",
    headingPath: ["# BTRFS 관리 가이드", "## 마운트 옵션"],
    content: "compress=zstd 옵션을 사용하면 투명 압축이 활성화된다.",
    offsetStart: 120,
    offsetEnd: 240,
    tokenCount: 28,
    seqIndex: 1,
    prevChunkId: "chunk_001",
  },
];

test("insert and query chunks", () => {
  db.insertChunks(sampleChunks);
  // Mark note as synced so FTS search can find it
  db.markSynced("note_001");

  const chunks = db.getChunksByNote("note_001");
  expect(chunks.length).toBe(2);
  // seq_index 순 정렬
  expect(chunks[0]!.id).toBe("chunk_001");
  expect(chunks[1]!.id).toBe("chunk_002");
  expect(chunks[0]!.heading).toBe("서브볼륨 스냅샷");
  expect(chunks[0]!.seq_index).toBe(0);
  expect(chunks[0]!.next_chunk_id).toBe("chunk_002");
  expect(chunks[1]!.prev_chunk_id).toBe("chunk_001");

  // heading_path is stored as JSON
  const parsed = JSON.parse(chunks[0]!.heading_path!);
  expect(parsed).toEqual(["# BTRFS 관리 가이드", "## 서브볼륨 스냅샷"]);
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

test("FTS5 excludes artifacts by default and can include them explicitly", () => {
  db.upsertNote({
    id: "note_artifact_001",
    vaultId: "personal",
    filePath: "artifacts/2026-05-08/daily-report.md",
    title: "Daily Report",
    fileHash: "artifacthash",
    docDate: "2026-05-08",
    layer: "artifact",
    kind: "daily-report",
  });
  db.insertChunks([
    {
      id: "chunk_artifact_001",
      noteId: "note_artifact_001",
      content: "artifact-only-search-token",
      offsetStart: 0,
      offsetEnd: 26,
      tokenCount: 7,
      seqIndex: 0,
    },
  ]);
  db.markSynced("note_artifact_001");

  expect(db.searchFts("artifact-only-search-token", 10, "personal").length).toBe(0);
  expect(db.searchFts("artifact-only-search-token", 10, "personal", 0, true).length).toBe(1);
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

// ── Signals / PageIndex ────────────────────────────────────────────────────

test("note signals store structured task and workout data", () => {
  const signalId = db.addNoteSignal({
    noteId: "note_rewritten_001",
    kind: "task",
    key: "open",
    value: { text: "template command 구현", status: "open" },
    confidence: 0.95,
    source: "extractor",
  });

  expect(signalId).toBeGreaterThan(0);

  db.addNoteSignal({
    noteId: "note_rewritten_001",
    kind: "workout",
    key: "pushup",
    value: { count: 30, sets: 3 },
  });

  const taskSignals = db.getNoteSignals("note_rewritten_001", "task");
  expect(taskSignals.length).toBe(1);
  expect(JSON.parse(taskSignals[0]!.value_json).status).toBe("open");

  const dateSignals = db.listSignalsByDate("personal", "2026-05-08");
  expect(dateSignals.length).toBeGreaterThanOrEqual(2);
});

test("PageIndex metadata stores document and tree nodes", () => {
  db.upsertPageIndexDocument({
    noteId: "note_rewritten_001",
    indexPath: ".kn/pageindex/note_rewritten_001.json",
    model: "gpt-4o",
    status: "ready",
  });
  db.replacePageIndexNodes("note_rewritten_001", [
    {
      noteId: "note_rewritten_001",
      nodeId: "0001",
      title: "Daily Report Source",
      summary: "Top-level rewritten daily source",
      depth: 0,
    },
    {
      noteId: "note_rewritten_001",
      nodeId: "0002",
      parentNodeId: "0001",
      title: "Workout",
      summary: "Workout metrics",
      startIndex: 10,
      endIndex: 12,
      depth: 1,
    },
  ]);

  const doc = db.getPageIndexDocument("note_rewritten_001");
  expect(doc!.status).toBe("ready");
  expect(doc!.index_path).toBe(".kn/pageindex/note_rewritten_001.json");

  const nodes = db.listPageIndexNodes("note_rewritten_001");
  expect(nodes.length).toBe(2);
  expect(nodes[1]!.parent_node_id).toBe("0001");
});

// ── Vault Status ────────────────────────────────────────────────────────────

test("getVaultStatus", () => {
  const status = db.getVaultStatus("personal");
  expect(status.noteCount).toBe(5);
  expect(status.chunkCount).toBe(3);
  expect(status.tagCount).toBeGreaterThanOrEqual(2);
  expect(status.sourceCount).toBe(2);
  expect(status.rewrittenCount).toBe(2);
  expect(status.artifactCount).toBe(1);
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
  db.upsertNote(note);
  db.insertChunks([
    {
      id: "old_chunk_1",
      noteId: "note_reindex",
      content: "old content alpha",
      offsetStart: 0,
      offsetEnd: 50,
      tokenCount: 10,
      seqIndex: 0,
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
        seqIndex: 0,
        nextChunkId: "new_chunk_2",
      },
      {
        id: "new_chunk_2",
        noteId: "note_reindex",
        content: "new content gamma",
        offsetStart: 60,
        offsetEnd: 120,
        tokenCount: 14,
        seqIndex: 1,
        prevChunkId: "new_chunk_1",
      },
    ],
    [{ tag: "new_tag", source: "auto" }],
  );

  // Mark as synced so FTS search can see it
  db.markSynced("note_reindex");

  // 검증
  const updatedNote = db.getNote("note_reindex");
  expect(updatedNote!.file_hash).toBe("hash_v2");
  expect(updatedNote!.title).toBe("Reindex Test v2");
  expect(updatedNote!.vector_sync_status).toBe("synced");

  const chunks = db.getChunksByNote("note_reindex");
  expect(chunks.length).toBe(2);
  expect(chunks[0]!.id).toBe("new_chunk_1");
  expect(chunks[0]!.seq_index).toBe(0);
  expect(chunks[1]!.prev_chunk_id).toBe("new_chunk_1");

  const tags = db.getTagsByNote("note_reindex");
  expect(tags.length).toBe(1);
  expect(tags[0]!.tag).toBe("new_tag");
  expect(tags[0]!.source).toBe("auto");

  // 기존 청크는 FTS에서도 사라져야 함
  expect(db.searchFts("alpha").length).toBe(0);
  // 새 청크는 FTS에서 검색 가능
  expect(db.searchFts("beta").length).toBe(1);
});
