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

// Tunable starting default: fetchLimit = topK * FETCH_MULTIPLIER (was hardcoded topK * 2)
export const FETCH_MULTIPLIER = 4;
// Tunable starting default: weight on the recency RRF channel; < 1 so recency cannot outrank a dual-channel durable hit
export const RECENCY_WEIGHT = 0.5;
// Tunable starting default: min dense retrieval score [0,1] for a dense-only candidate to survive (permissive start)
export const DENSE_SCORE_FLOOR = 0.2;
