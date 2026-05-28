import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { deriveSourceType, MemoryIndexer } from './indexer.js';
import { MemoryStore } from './store.js';
import {
  type HybridSearchOptions,
  type HybridSearchRow,
  type MemoryChunk,
  type MemoryConfig,
  EmbeddingModelName,
} from './types.js';
import { DENSE_SCORE_FLOOR, FETCH_MULTIPLIER, RECENCY_WEIGHT, RRF_K } from './constants.js';

class StubEmbedder {
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(384).fill(0.05));
  }
  initialize(): Promise<void> {
    return Promise.resolve();
  }
}

class FailEmbedder {
  async embed(): Promise<Float32Array[]> {
    throw new Error('embed failed');
  }
  initialize(): Promise<void> {
    return Promise.resolve();
  }
}

class TrackingEmbedder {
  active = 0;
  maxActive = 0;

  constructor(private readonly failForText: string | undefined = undefined) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    const failForText = this.failForText;
    if (failForText && texts.some((text) => text.includes(failForText))) {
      throw new Error('targeted embed failure');
    }

    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.active--;
    return texts.map(() => new Float32Array(384).fill(0.05));
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }
}

function makeConfig(wikiDir: string): MemoryConfig {
  return {
    enabled: true,
    wikiDir,
    topK: 5,
    chunkSize: 1500,
    overlapLines: 2,
    embeddingModel: EmbeddingModelName.BASE,
    vectorDimension: 384,
  };
}

function makeChunkFull(overrides: Partial<MemoryChunk> = {}): MemoryChunk {
  return {
    id: 'test-id',
    source: 'compiled/entities/test.md',
    sourceType: 'entity',
    heading: 'Test',
    headingLevel: 1,
    content: 'test content',
    lineStart: 1,
    lineEnd: 2,
    fileMtimeAt: 1000,
    ...overrides,
  };
}

function makeHybridRow(chunk: MemoryChunk, retriever: 'dense' | 'bm25' | 'both' = 'both'): HybridSearchRow {
  return { chunk, score: 0.8, retriever };
}

describe('MemoryIndexer', () => {
  let tmpDir: string;
  let store: MemoryStore;
  let indexer: MemoryIndexer;
  let config: MemoryConfig;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-indexer-test-'));
    config = makeConfig(tmpDir);
    store = new MemoryStore(path.join(config.wikiDir, 'index.db'), config);
    indexer = new MemoryIndexer(store, new StubEmbedder(), config);
  });

  after(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('indexFile on new file — indexed > 0, skipped === 0', async () => {
    const filePath = path.join(tmpDir, 'new-file.md');
    fs.writeFileSync(filePath, '# New File\nThis file has some content for indexing.', 'utf8');

    const stats = await indexer.indexFile(filePath);
    assert.ok(stats.indexed > 0, `Expected indexed > 0, got ${stats.indexed}`);
    assert.equal(stats.skipped, 0);
  });

  test('indexFile on unchanged file — indexed === 0, skipped > 0', async () => {
    const filePath = path.join(tmpDir, 'stable-file.md');
    fs.writeFileSync(filePath, '# Stable\nThis content does not change between runs.', 'utf8');

    await indexer.indexFile(filePath);

    const stats = await indexer.indexFile(filePath);
    assert.equal(stats.indexed, 0, `Expected indexed === 0, got ${stats.indexed}`);
    assert.ok(stats.skipped > 0, `Expected skipped > 0, got ${stats.skipped}`);
  });

  test('indexFile after modification — only changed chunks re-indexed', async () => {
    const filePath = path.join(tmpDir, 'modified-file.md');
    fs.writeFileSync(filePath, '# Modified\nOriginal content.', 'utf8');
    await indexer.indexFile(filePath);

    fs.writeFileSync(filePath, '# Modified\nUpdated content that changed completely.', 'utf8');
    const stats = await indexer.indexFile(filePath);
    assert.ok(stats.indexed > 0, `Expected re-indexed chunks after modification`);
  });

  test('indexDirectory removes stale source when file is deleted', async () => {
    const staleFile = path.join(tmpDir, 'stale-file.md');
    fs.writeFileSync(staleFile, '# Stale\nThis file will be deleted.', 'utf8');
    await indexer.indexFile(staleFile);

    const staleSource = path.relative(tmpDir, staleFile);
    const before = store.hashesBySource(staleSource);
    assert.ok(before.size > 0, 'Stale file must be indexed first');

    fs.unlinkSync(staleFile);
    await indexer.indexDirectory(tmpDir);

    const afterDeletion = store.hashesBySource(staleSource);
    assert.equal(afterDeletion.size, 0, 'Stale source must be removed from store after directory scan');
  });

  // BC13: delegation — vecAvailable=true embeds query and calls searchHybrid with correct options
  test('BC13: search delegates to searchHybrid with embedding and constants when vecAvailable', async () => {
    const chunk = makeChunkFull();
    let capturedOptions: HybridSearchOptions | undefined;

    const fakeStore = {
      vecAvailable: true,
      searchHybrid: (opts: HybridSearchOptions) => {
        capturedOptions = opts;
        return [makeHybridRow(chunk, 'both')];
      },
    } as unknown as MemoryStore;

    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc13-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    try {
      const compiledEntities = path.join(testCfg.wikiDir, 'compiled', 'entities');
      fs.mkdirSync(compiledEntities, { recursive: true });
      fs.writeFileSync(path.join(compiledEntities, 'test.md'), 'test content', 'utf8');

      const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);
      const results = await testIndexer.search('hello', 3);

      assert.ok(capturedOptions, 'searchHybrid must be called');
      assert.equal(capturedOptions!.query, 'hello');
      assert.equal(capturedOptions!.topK, 3);
      assert.equal(capturedOptions!.fetchLimit, 3 * FETCH_MULTIPLIER);
      assert.equal(capturedOptions!.denseScoreFloor, DENSE_SCORE_FLOOR);
      assert.equal(capturedOptions!.recencyWeight, RECENCY_WEIGHT);
      assert.equal(capturedOptions!.rrfK, RRF_K);
      assert.ok(capturedOptions!.embedding instanceof Float32Array, 'embedding must be provided when vecAvailable');
      assert.equal(results.length, 1);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC14: embedding failure → searchHybrid called without embedding
  test('BC14: embedding failure causes search to call searchHybrid without embedding', async () => {
    const chunk = makeChunkFull();
    let capturedOptions: HybridSearchOptions | undefined;

    const fakeStore = {
      vecAvailable: true,
      searchHybrid: (opts: HybridSearchOptions) => {
        capturedOptions = opts;
        return [makeHybridRow(chunk, 'bm25')];
      },
    } as unknown as MemoryStore;

    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc14-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    try {
      const compiledEntities = path.join(testCfg.wikiDir, 'compiled', 'entities');
      fs.mkdirSync(compiledEntities, { recursive: true });
      fs.writeFileSync(path.join(compiledEntities, 'test.md'), 'test content', 'utf8');

      const testIndexer = new MemoryIndexer(fakeStore, new FailEmbedder(), testCfg);
      const results = await testIndexer.search('hello', 5);

      assert.ok(capturedOptions, 'searchHybrid must be called even after embedding failure');
      assert.equal(capturedOptions!.embedding, undefined, 'embedding must be absent after failure');
      assert.equal(results.length, 1);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC15: readable source file → full live content and contentSource: 'file'
  test('BC15: readable source file is read asynchronously and contentSource is file', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc15-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const sourceRelative = 'compiled/entities/test.md';
    const sourceAbsolute = path.join(testCfg.wikiDir, sourceRelative);
    const fileContent = '# Full\nLive file content from disk.';

    try {
      fs.mkdirSync(path.dirname(sourceAbsolute), { recursive: true });
      fs.writeFileSync(sourceAbsolute, fileContent, 'utf8');

      const chunk = makeChunkFull({ source: sourceRelative, content: 'stored chunk only' });
      const fakeStore = {
        vecAvailable: false,
        searchHybrid: () => [makeHybridRow(chunk, 'bm25')],
      } as unknown as MemoryStore;

      const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);
      const results = await testIndexer.search('test', 5);

      assert.equal(results.length, 1);
      assert.equal(results[0].contentSource, 'file');
      assert.equal(results[0].chunk.content, fileContent);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC16: missing source file → stored chunk content and contentSource: 'fallback'
  test('BC16: missing source file leaves stored chunk content and sets contentSource fallback', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc16-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));

    try {
      const chunk = makeChunkFull({
        source: 'compiled/entities/missing.md',
        content: 'stored chunk content',
      });
      const fakeStore = {
        vecAvailable: false,
        searchHybrid: () => [makeHybridRow(chunk, 'bm25')],
      } as unknown as MemoryStore;

      const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);
      const results = await testIndexer.search('test', 5);

      assert.equal(results.length, 1);
      assert.equal(results[0].contentSource, 'fallback');
      assert.equal(results[0].chunk.content, 'stored chunk content');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC17: indexDirectory deterministic traversal and stale deletion
  test('BC17: indexDirectory walks nested markdown files and excludes configured basenames', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-index-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const compiledDir = path.join(testCfg.wikiDir, 'compiled');

    try {
      fs.mkdirSync(path.join(compiledDir, 'entities'), { recursive: true });
      fs.writeFileSync(path.join(compiledDir, 'entities', 'foo.md'), '# Foo\nrecursiveUniqueTerm', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'entities', 'index.md'), '# Index\nskip me', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'log.md'), '# Log\nskip me', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'entities', 'notes.txt'), 'skip me', 'utf8');

      const stats = await testIndexer.indexDirectory(compiledDir, {
        relativeBase: testCfg.wikiDir,
        excludeFiles: ['index.md', 'log.md'],
      });

      assert.ok(stats.indexed > 0, `Expected indexed > 0, got ${stats.indexed}`);
      assert.ok(testStore.hashesBySource('compiled/entities/foo.md').size > 0);
      assert.equal(testStore.hashesBySource('compiled/entities/index.md').size, 0);
      assert.equal(testStore.hashesBySource('compiled/log.md').size, 0);
      assert.equal(testStore.hashesBySource('compiled/entities/notes.txt').size, 0);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC18: unreadable subtrees — log and continue
  test('BC18: indexDirectory logs and continues when file or subdirectory is unreadable', async () => {
    const stats = await indexer.indexDirectory(path.join(config.wikiDir, 'missing'), {
      relativeBase: config.wikiDir,
    });
    assert.deepEqual(stats, { indexed: 0, deleted: 0, skipped: 0 });
  });

  // BC19: save appends content asynchronously
  test('BC19: save appends manual content to daily wiki raw file asynchronously', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-daily-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const datePart = new Date().toISOString().slice(0, 10);
    const savePath = path.join(testCfg.wikiDir, 'raw', `conv_save_${datePart}.md`);

    try {
      const firstStats = await testIndexer.save('first manual save');
      const secondStats = await testIndexer.save('second manual save');

      assert.deepEqual(firstStats, { indexed: 0, deleted: 0, skipped: 0 });
      assert.deepEqual(secondStats, { indexed: 0, deleted: 0, skipped: 0 });
      assert.equal(fs.existsSync(savePath), true);

      const content = fs.readFileSync(savePath, 'utf8');
      assert.match(content, /first manual save/);
      assert.match(content, /second manual save/);
      assert.equal(fs.readdirSync(path.dirname(savePath)).filter((name) => /^conv_save_.*\.md$/.test(name)).length, 1);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('search returns result with correct source for indexed content', async () => {
    const filePath = path.join(config.wikiDir, 'compiled', 'searchable.md');
    const fileContent = '# Searchable\nspecialUniqueTermForSearch is in this document.';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fileContent, 'utf8');
    await indexer.indexDirectory(path.join(config.wikiDir, 'compiled'), {
      relativeBase: config.wikiDir,
    });

    const results = await indexer.search('specialUniqueTermForSearch', 5);
    assert.ok(results.length > 0, 'Expected at least one search result');
    const expectedSource = path.relative(config.wikiDir, filePath);
    const match = results.find((r) => r.chunk.source === expectedSource);
    assert.ok(
      match,
      `Expected result with source=${expectedSource}, got: ${results.map((r) => r.chunk.source).join(', ')}`,
    );
    assert.equal(match.chunk.content, fileContent);
    assert.equal(match.contentSource, 'file');
  });

  test('search on empty store returns []', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-store-'));
    const emptyCfg = makeConfig(emptyDir);
    const emptyStore = new MemoryStore(path.join(emptyCfg.wikiDir, 'index.db'), emptyCfg);
    const emptyIndexer = new MemoryIndexer(emptyStore, new StubEmbedder(), emptyCfg);

    try {
      const results = await emptyIndexer.search('anything', 5);
      assert.deepEqual(results, []);
    } finally {
      emptyStore.close();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test('search falls back to stored chunk content when source file is missing', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-fallback-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const filePath = path.join(testCfg.wikiDir, 'compiled', 'entities', 'missing.md');
    const fileContent = '# Missing\nfallbackUniqueTerm stored chunk text';

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent, 'utf8');
      await testIndexer.indexDirectory(path.join(testCfg.wikiDir, 'compiled'), {
        relativeBase: testCfg.wikiDir,
      });
      fs.unlinkSync(filePath);

      const results = await testIndexer.search('fallbackUniqueTerm', 5);
      assert.equal(results.length, 1);
      assert.equal(results[0].contentSource, 'fallback');
      assert.equal(results[0].chunk.content, fileContent);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('search returns distinct sources — one result per source', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-dedup-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const filePath = path.join(testCfg.wikiDir, 'compiled', 'entities', 'dedup.md');
    // Multiple paragraphs create multiple chunks
    const fileContent =
      '# Dedup\n\ndedupUniqueTermXYZ first chunk content\n\n---\n\ndedupUniqueTermXYZ second chunk content';

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent, 'utf8');
      await testIndexer.indexDirectory(path.join(testCfg.wikiDir, 'compiled'), {
        relativeBase: testCfg.wikiDir,
      });

      const results = await testIndexer.search('dedupUniqueTermXYZ', 5);
      const dedupSources = results.filter((r) => r.chunk.source === 'compiled/entities/dedup.md');
      assert.equal(dedupSources.length, 1, 'At most one result per source after dedup');
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('indexDirectory removes stale pre-migration daily-file sources', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-stale-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const compiledDir = path.join(testCfg.wikiDir, 'compiled');

    try {
      fs.mkdirSync(compiledDir, { recursive: true });
      testStore.upsert(
        [
          {
            id: 'stale-daily-file-0001',
            source: '2026-05-18.md',
            sourceType: 'wiki',
            heading: 'Stale',
            headingLevel: 1,
            content: 'pre migration content',
            lineStart: 1,
            lineEnd: 2,
            fileMtimeAt: 1,
          },
        ],
        [new Float32Array(384)],
      );
      assert.ok(testStore.hashesBySource('2026-05-18.md').size > 0);

      const stats = await testIndexer.indexDirectory(compiledDir, {
        relativeBase: testCfg.wikiDir,
      });

      assert.equal(stats.deleted, 1);
      assert.equal(testStore.hashesBySource('2026-05-18.md').size, 0);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('indexDirectory prepares changed files with bounded parallelism', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-index-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const trackingEmbedder = new TrackingEmbedder();
    const testIndexer = new MemoryIndexer(testStore, trackingEmbedder, testCfg);
    const compiledDir = path.join(testCfg.wikiDir, 'compiled');

    try {
      fs.mkdirSync(compiledDir, { recursive: true });
      fs.writeFileSync(path.join(compiledDir, 'a.md'), '# A\nparallel alpha content', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'b.md'), '# B\nparallel beta content', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'c.md'), '# C\nparallel gamma content', 'utf8');

      const stats = await testIndexer.indexDirectory(compiledDir, {
        relativeBase: testCfg.wikiDir,
        fileConcurrency: 2,
      });

      assert.ok(stats.indexed >= 3, `Expected at least 3 indexed chunks, got ${stats.indexed}`);
      assert.equal(trackingEmbedder.maxActive, 2);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('indexDirectory serializes store mutations after parallel preparation', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serialized-writes-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const compiledDir = path.join(testCfg.wikiDir, 'compiled');
    const calls: string[] = [];
    let activeMutations = 0;
    let maxActiveMutations = 0;
    const fakeStore = {
      vecAvailable: true,
      hashesBySource: () => new Set<string>(),
      indexedSources: () => ['compiled/stale.md'],
      deleteBySource: (source: string) => {
        activeMutations++;
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
        calls.push(`deleteBySource:${source}`);
        activeMutations--;
      },
      upsert: (chunks: MemoryChunk[]) => {
        activeMutations++;
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
        calls.push(`upsert:${chunks[0]?.source}`);
        activeMutations--;
      },
      deleteByIds: (ids: string[]) => {
        activeMutations++;
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
        calls.push(`deleteByIds:${ids.length}`);
        activeMutations--;
      },
    } as unknown as MemoryStore;

    try {
      fs.mkdirSync(compiledDir, { recursive: true });
      fs.writeFileSync(path.join(compiledDir, 'a.md'), '# A\nserialized alpha content', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'b.md'), '# B\nserialized beta content', 'utf8');

      const trackingEmbedder = new TrackingEmbedder();
      const testIndexer = new MemoryIndexer(fakeStore, trackingEmbedder, testCfg);
      await testIndexer.indexDirectory(compiledDir, {
        relativeBase: testCfg.wikiDir,
        fileConcurrency: 2,
      });

      assert.equal(maxActiveMutations, 1);
      assert.equal(trackingEmbedder.maxActive, 2);
      assert.deepEqual(calls.slice(0, 1), ['deleteBySource:compiled/stale.md']);
      assert.ok(calls.filter((call) => call.startsWith('upsert:')).length >= 2);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('indexDirectory isolates per-file embedding failure without deleting failed-file chunks', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-isolation-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const compiledDir = path.join(testCfg.wikiDir, 'compiled');
    const upsertedSources: string[] = [];
    const deletedIds: string[] = [];
    const fakeStore = {
      vecAvailable: true,
      hashesBySource: (source: string) => (source === 'compiled/bad.md' ? new Set(['bad-old-id']) : new Set<string>()),
      indexedSources: () => ['compiled/good.md', 'compiled/bad.md'],
      deleteBySource: () => undefined,
      upsert: (chunks: MemoryChunk[]) => {
        upsertedSources.push(...chunks.map((chunk) => chunk.source));
      },
      deleteByIds: (ids: string[]) => {
        deletedIds.push(...ids);
      },
    } as unknown as MemoryStore;

    try {
      fs.mkdirSync(compiledDir, { recursive: true });
      fs.writeFileSync(path.join(compiledDir, 'good.md'), '# Good\nindexable good content', 'utf8');
      fs.writeFileSync(path.join(compiledDir, 'bad.md'), '# Bad\nexplode this content', 'utf8');

      const testIndexer = new MemoryIndexer(fakeStore, new TrackingEmbedder('explode'), testCfg);
      const stats = await testIndexer.indexDirectory(compiledDir, {
        relativeBase: testCfg.wikiDir,
        fileConcurrency: 2,
      });

      assert.ok(stats.indexed > 0, `Expected good file to be indexed, got ${stats.indexed}`);
      assert.equal(stats.skipped, 1);
      assert.ok(upsertedSources.includes('compiled/good.md'));
      assert.ok(!upsertedSources.includes('compiled/bad.md'));
      assert.deepEqual(deletedIds, []);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('deriveSourceType follows documented path conventions', () => {
    assert.equal(deriveSourceType('compiled/provisional/conversation-digests/abc.md'), 'digest');
    assert.equal(deriveSourceType('compiled/concepts/x.md'), 'concept');
    assert.equal(deriveSourceType('compiled/entities/foo.md'), 'entity');
    assert.equal(deriveSourceType('compiled/preferences.md'), 'preference');
    assert.equal(deriveSourceType('compiled/preferences/something.md'), 'wiki');
    assert.equal(deriveSourceType('raw/conv_x.md'), 'wiki');
    assert.equal(deriveSourceType(''), 'wiki');
  });

  test('indexFile stamps source type and file mtime onto stored chunks', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-meta-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const filePath = path.join(testCfg.wikiDir, 'compiled', 'provisional', 'conversation-digests', 'digest.md');

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '# Digest\nmtime metadata unique content', 'utf8');
      const expectedMtime = fs.statSync(filePath).mtimeMs;

      const stats = await testIndexer.indexFile(filePath);
      assert.ok(stats.indexed > 0, `Expected indexed > 0, got ${stats.indexed}`);

      const ids = [...testStore.hashesBySource('compiled/provisional/conversation-digests/digest.md')];
      assert.ok(ids.length > 0);

      const results = testStore.searchHybrid({
        query: 'mtime metadata unique',
        topK: 5,
        fetchLimit: 20,
        denseScoreFloor: 0,
        recencyWeight: RECENCY_WEIGHT,
        rrfK: RRF_K,
      });
      const match = results.find((r) => r.chunk.source === 'compiled/provisional/conversation-digests/digest.md');
      assert.ok(match, 'Expected searchHybrid to find the indexed chunk');
      assert.equal(match.chunk.sourceType, 'digest');
      assert.equal(match.chunk.fileMtimeAt, expectedMtime);
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
