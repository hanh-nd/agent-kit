import * as fs from 'fs';
import * as path from 'path';
import { chunkMarkdown } from './chunker.js';
import type { MemoryStore } from './store.js';
import type {
  IndexDirectoryOptions,
  IndexStats,
  MemoryConfig,
  PreparedIndexMutation,
  SearchResult,
  SourceType,
} from './types.js';
import {
  DENSE_SCORE_FLOOR,
  FETCH_MULTIPLIER,
  LOCK_RETRY_MS,
  LOCK_TIMEOUT_MS,
  RECENCY_WEIGHT,
  RRF_K,
} from './constants.js';
import { mapLimit } from '../../utils/async.js';
import { acquireLock, releaseLock } from '../../utils/files.js';

interface TextEmbedder {
  embed(texts: string[]): Promise<Float32Array[]>;
  initialize(): Promise<void>;
}

export function deriveSourceType(source: string): SourceType {
  if (source.startsWith('compiled/provisional/conversation-digests/')) return 'digest';
  if (source.startsWith('compiled/concepts/')) return 'concept';
  if (source.startsWith('compiled/entities/')) return 'entity';
  if (source === 'compiled/preferences.md') return 'preference';
  return 'wiki';
}

export class MemoryIndexer {
  private _ready = false;

  constructor(
    private readonly store: MemoryStore,
    private readonly embedder: TextEmbedder,
    private readonly config: MemoryConfig,
  ) {}

  async indexFile(absolutePath: string): Promise<IndexStats> {
    const mutation = await this.prepareIndexFileRelativeTo(absolutePath, this.config.wikiDir);
    return this.commitPreparedMutation(mutation);
  }

  private makeSkippedMutation(source: string, skipped: number): PreparedIndexMutation {
    return {
      source,
      chunksToUpsert: [],
      embeddings: [],
      idsToDelete: [],
      stats: { indexed: 0, deleted: 0, skipped },
    };
  }

  private async prepareIndexFileRelativeTo(absolutePath: string, sourceRoot: string): Promise<PreparedIndexMutation> {
    const source = path.relative(sourceRoot, absolutePath);
    const existingChunkIds = this.store.hashesBySource(source);

    let text: string;
    try {
      text = await fs.promises.readFile(absolutePath, 'utf8');
    } catch (err) {
      console.warn(`[memory-indexer] Cannot read file ${absolutePath}:`, err);
      return this.makeSkippedMutation(source, existingChunkIds.size);
    }

    let fileMtimeAt: number;
    try {
      fileMtimeAt = (await fs.promises.stat(absolutePath)).mtimeMs;
    } catch (err) {
      console.warn(`[memory-indexer] Cannot stat file ${absolutePath}:`, err);
      fileMtimeAt = Date.now();
    }

    const sourceType = deriveSourceType(source);
    const allChunks = chunkMarkdown(text, source, this.config, { sourceType, fileMtimeAt });
    const currentChunkIds = new Set(allChunks.map((chunk) => chunk.id));

    const toIndex = allChunks.filter((chunk) => !existingChunkIds.has(chunk.id));
    const toDelete = [...existingChunkIds].filter((id) => !currentChunkIds.has(id));

    let embeddings: Float32Array[] = [];
    if (toIndex.length > 0) {
      try {
        embeddings = await this.embedder.embed(toIndex.map((c) => c.content));
      } catch (err) {
        console.warn(`[memory-indexer] Embedding failed for ${absolutePath}:`, err);
        return this.makeSkippedMutation(source, existingChunkIds.size);
      }
    }

    return {
      source,
      chunksToUpsert: toIndex,
      embeddings,
      idsToDelete: toDelete,
      stats: {
        indexed: toIndex.length,
        deleted: toDelete.length,
        skipped: allChunks.length - toIndex.length,
      },
    };
  }

  private commitPreparedMutation(mutation: PreparedIndexMutation): IndexStats {
    if (mutation.chunksToUpsert.length > 0) {
      this.store.upsert(mutation.chunksToUpsert, mutation.embeddings);
    }
    if (mutation.idsToDelete.length > 0) {
      this.store.deleteByIds(mutation.idsToDelete);
    }
    return mutation.stats;
  }

  async indexDirectory(rootDir: string, opts: IndexDirectoryOptions = {}): Promise<IndexStats> {
    const totals: IndexStats = { indexed: 0, deleted: 0, skipped: 0 };

    let rootExists: boolean;
    try {
      await fs.promises.stat(rootDir);
      rootExists = true;
    } catch {
      rootExists = false;
    }
    if (!rootExists) return totals;

    const relativeBase = opts.relativeBase ?? this.config.wikiDir;
    const excludeFiles = new Set(opts.excludeFiles ?? []);
    const files: string[] = [];

    const walk = async (dirPath: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      } catch (err) {
        console.warn(`[memory-indexer] Cannot scan directory ${dirPath}:`, err);
        return;
      }

      // Sort for deterministic traversal order
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
          continue;
        }
        if (entry.isFile() && /\.md$/i.test(entry.name) && !excludeFiles.has(entry.name)) {
          files.push(entryPath);
        }
      }
    };

    await walk(rootDir);

    const currentSources = new Set(files.map((file) => path.relative(relativeBase, file)));

    // Remove stale sources (deleted files or pre-migration daily-file sources)
    for (const stale of this.store.indexedSources()) {
      if (!currentSources.has(stale)) {
        this.store.deleteBySource(stale);
        totals.deleted += 1;
      }
    }

    const preparedMutations = await mapLimit(files, opts.fileConcurrency ?? 2, (file) =>
      this.prepareIndexFileRelativeTo(file, relativeBase),
    );

    for (const mutation of preparedMutations) {
      const stats = this.commitPreparedMutation(mutation);
      totals.indexed += stats.indexed;
      totals.deleted += stats.deleted;
      totals.skipped += stats.skipped;
    }

    return totals;
  }

  async search(query: string, topK: number): Promise<SearchResult[]> {
    const fetchLimit = topK * FETCH_MULTIPLIER;

    let embedding: Float32Array | undefined;
    if (this.store.vecAvailable) {
      try {
        const embeddings = await this.embedder.embed([query]);
        embedding = embeddings[0];
      } catch (err) {
        console.warn('[memory-indexer] Dense search embedding failed:', err);
      }
    }

    const rows = this.store.searchHybrid({
      query,
      embedding,
      topK,
      fetchLimit,
      denseScoreFloor: DENSE_SCORE_FLOOR,
      recencyWeight: RECENCY_WEIGHT,
      rrfK: RRF_K,
    });

    if (rows.length === 0) return [];

    const results: SearchResult[] = [];
    for (const row of rows) {
      let contentSource: 'file' | 'fallback' = 'file';
      try {
        row.chunk.content = await fs.promises.readFile(path.join(this.config.wikiDir, row.chunk.source), 'utf8');
      } catch {
        contentSource = 'fallback';
      }
      results.push({ chunk: row.chunk, score: row.score, retriever: row.retriever, contentSource });
    }

    return results;
  }

  async save(content: string): Promise<IndexStats> {
    const datePart = new Date().toISOString().slice(0, 10);
    const rawDir = path.join(this.config.wikiDir, 'raw');
    const savePath = path.join(rawDir, `conv_save_${datePart}.md`);
    const lockPath = `${savePath}.lock`;

    await fs.promises.mkdir(rawDir, { recursive: true });

    const acquired = await acquireLock(lockPath, LOCK_TIMEOUT_MS, LOCK_RETRY_MS);
    if (!acquired) {
      console.warn('[memory-indexer] Could not acquire write lock, writing anyway (fail-open)');
    }

    try {
      await fs.promises.appendFile(savePath, `\n${content}\n`, 'utf8');
    } finally {
      if (acquired) releaseLock(lockPath, { ignoreErrors: true });
    }

    return { indexed: 0, deleted: 0, skipped: 0 };
  }

  async startupIndex(): Promise<void> {
    try {
      await this.embedder.initialize();
      await this.indexDirectory(path.join(this.config.wikiDir, 'compiled'), {
        relativeBase: this.config.wikiDir,
        excludeFiles: ['index.md', 'log.md'],
      });
    } catch (err) {
      console.warn('[memory-indexer] Startup indexing failed:', err);
    } finally {
      this._ready = true;
    }
  }

  get ready(): boolean {
    return this._ready;
  }
}
