import { type MemoryConfig, EmbeddingModelName } from './types.js';

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: false,
  wikiDir: '',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.BASE,
  vectorDimension: 384,
};

export const LOCK_RETRY_MS = 50;
export const LOCK_TIMEOUT_MS = 500;
export const RRF_K = 60;
