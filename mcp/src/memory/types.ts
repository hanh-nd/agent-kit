import type { ConversationDigestSettings } from './digest/types.js';

export interface MemoryChunk {
  id: string;
  source: string;
  heading: string;
  headingLevel: number;
  content: string;
  lineStart: number;
  lineEnd: number;
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
  embeddingModel: string;
  vectorDimension: number;
  conversationDigest?: ConversationDigestSettings;
}

export interface IndexStats {
  indexed: number;
  deleted: number;
  skipped: number;
}
