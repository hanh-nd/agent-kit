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

export interface HybridSearchOptions {
  query: string;
  embedding?: Float32Array;
  topK: number;
  fetchLimit: number;
  denseScoreFloor: number;
  recencyWeight: number;
  rrfK: number;
  sourceType?: SourceType;
  sinceMtimeAt?: number;
  includeDebug?: boolean;
}

export interface HybridRankDebug {
  denseRank?: number;
  denseScore?: number;
  bm25Rank?: number;
  bm25Score?: number;
  recencyRank: number;
  recencyScore: number;
  totalScore: number;
  droppedReason?: string;
}

export interface HybridSearchRow {
  chunk: MemoryChunk;
  score: number;
  retriever: 'dense' | 'bm25' | 'both';
  debug?: HybridRankDebug;
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

export type MemoryLifecycleState = 'disabled' | 'initializing' | 'warming' | 'ready' | 'degraded' | 'failed';

export interface MemoryLifecycleStatus {
  state: MemoryLifecycleState;
  ready: boolean;
  warming: boolean;
  degraded: boolean;
  error?: string;
}

export interface IndexDirectoryOptions {
  relativeBase?: string;
  excludeFiles?: string[];
  fileConcurrency?: number;
}

export interface PreparedIndexMutation {
  source: string;
  chunksToUpsert: MemoryChunk[];
  embeddings: Float32Array[];
  idsToDelete: string[];
  stats: IndexStats;
}

export interface RecentSource {
  source: string;
  fileMtimeAt: number;
}
