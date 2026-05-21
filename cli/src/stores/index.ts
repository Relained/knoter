export { MetaDB } from "./meta-store";
export type {
  NoteRow,
  NoteInput,
  ChunkRow,
  ChunkInsert,
  TagRow,
  TagSource,
  FtsResult,
  VaultConfigRow,
  VaultStatus,
  PreprocessorRow,
  VectorSyncStatus,
} from "./meta-store";
export { buildFtsQuery, normalizeBM25 } from "./meta-store";
export {
  createVaultCollection,
  openVaultCollection,
  createChunkSchema,
  formatForEmbedding,
  toZVecDoc,
  EMBEDDING_DIMENSIONS,
  DEFAULT_FUSION_ALPHA,
} from "./vec-store";
export type { EmbeddingModel, ChunkInput } from "./vec-store";
