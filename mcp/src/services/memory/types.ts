import type { ConversationDigestSettings } from '../digest/types.js';

export enum EmbeddingModelName {
  TINY = 'tiny',
  BASE = 'base',
  LARGE = 'large',
}

export const SOURCE_TYPES = ['digest', 'concept', 'entity', 'preference', 'wiki'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface MemoryChunk {
  id: string;
  source: string;
  sourceType: SourceType;
  heading: string;
  headingLevel: number;
  content: string;
  lineStart: number;
  lineEnd: number;
  fileMtimeAt: number;
}

export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  retriever: 'dense' | 'bm25' | 'both';
  contentSource: 'file' | 'fallback';
}

export interface MemoryConfig {
  enabled: boolean;
  wikiDir: string;
  topK: number;
  chunkSize: number;
  overlapLines: number;
  embeddingModel: EmbeddingModelName;
  vectorDimension: number;
  conversationDigest?: ConversationDigestSettings;
}

export interface IndexStats {
  indexed: number;
  deleted: number;
  skipped: number;
}

export interface RecentSource {
  source: string;
  fileMtimeAt: number;
}
