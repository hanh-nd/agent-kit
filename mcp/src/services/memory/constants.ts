import { type MemoryConfig, EmbeddingModelName } from './types.js';

export const EMBEDDING_MODEL_DIMENSIONS: Record<EmbeddingModelName, number> = {
  [EmbeddingModelName.TINY]: 384,
  [EmbeddingModelName.BASE]: 384,
  [EmbeddingModelName.LARGE]: 768,
};

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: false,
  wikiDir: '',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.BASE,
  vectorDimension: EMBEDDING_MODEL_DIMENSIONS[EmbeddingModelName.BASE],
};

export const LOCK_RETRY_MS = 50;
export const LOCK_TIMEOUT_MS = 500;
export const RRF_K = 60;
