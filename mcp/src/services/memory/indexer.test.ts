import * as assert from 'node:assert/strict';
import fsDefault from 'node:fs';
import * as fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { deriveSourceType, MemoryIndexer } from './indexer.js';
import { MemoryStore } from './store.js';
import { type MemoryConfig, EmbeddingModelName } from './types.js';

class StubEmbedder {
  async embed(texts: string[]): Promise<Float32Array[]> {
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

    // First run indexes it
    await indexer.indexFile(filePath);

    // Second run — same content
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

    // Delete the file and re-index the directory
    fs.unlinkSync(staleFile);
    await indexer.indexDirectory(tmpDir);

    const afterDeletion = store.hashesBySource(staleSource);
    assert.equal(afterDeletion.size, 0, 'Stale source must be removed from store after directory scan');
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

  test('indexDirectory walks nested markdown files and excludes configured basenames', async () => {
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

  test('indexDirectory returns zero stats when root directory is missing', async () => {
    const stats = await indexer.indexDirectory(path.join(config.wikiDir, 'missing'), {
      relativeBase: config.wikiDir,
    });

    assert.deepEqual(stats, { indexed: 0, deleted: 0, skipped: 0 });
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

  test('search deduplicates sources and reads each matched source once', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-dedup-'));
    const testCfg = {
      ...makeConfig(path.join(testDir, 'wiki')),
      chunkSize: 40,
      overlapLines: 0,
    };
    const testStore = new MemoryStore(path.join(testCfg.wikiDir, 'index.db'), testCfg);
    const testIndexer = new MemoryIndexer(testStore, new StubEmbedder(), testCfg);
    const filePath = path.join(testCfg.wikiDir, 'compiled', 'entities', 'dedup.md');
    const fileContent = [
      '# Dedup',
      'dedupUniqueTerm first chunk text',
      'dedupUniqueTerm second chunk text',
      'dedupUniqueTerm third chunk text',
    ].join('\n');
    const originalReadFileSync = fsDefault.readFileSync;
    let readCount = 0;

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent, 'utf8');
      await testIndexer.indexDirectory(path.join(testCfg.wikiDir, 'compiled'), {
        relativeBase: testCfg.wikiDir,
      });

      const expectedPath = path.join(testCfg.wikiDir, 'compiled/entities/dedup.md');
      fsDefault.readFileSync = ((
        targetPath: fs.PathOrFileDescriptor,
        options?: BufferEncoding | { encoding?: BufferEncoding | null; flag?: string } | null,
      ) => {
        if (targetPath === expectedPath) readCount += 1;
        return originalReadFileSync(targetPath, options as never);
      }) as typeof fsDefault.readFileSync;
      syncBuiltinESMExports();

      const results = await testIndexer.search('dedupUniqueTerm', 5);

      assert.equal(results.filter((r) => r.chunk.source === 'compiled/entities/dedup.md').length, 1);
      assert.equal(readCount, 1);
      assert.equal(results[0].chunk.content, fileContent);
      assert.equal(results[0].contentSource, 'file');
    } finally {
      fsDefault.readFileSync = originalReadFileSync;
      syncBuiltinESMExports();
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('search continues past duplicate sources until topK unique sources are returned', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-unique-topk-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const firstPath = path.join(testCfg.wikiDir, 'compiled', 'entities', 'first.md');
    const secondPath = path.join(testCfg.wikiDir, 'compiled', 'entities', 'second.md');
    const firstContent = '# First\nfirst source full content';
    const secondContent = '# Second\nsecond source full content';

    const chunks = [
      {
        id: 'first-1',
        source: 'compiled/entities/first.md',
        heading: 'First',
        headingLevel: 1,
        content: 'first matching chunk one',
        lineStart: 1,
        lineEnd: 2,
      },
      {
        id: 'first-2',
        source: 'compiled/entities/first.md',
        heading: 'First',
        headingLevel: 1,
        content: 'first matching chunk two',
        lineStart: 3,
        lineEnd: 4,
      },
      {
        id: 'second-1',
        source: 'compiled/entities/second.md',
        heading: 'Second',
        headingLevel: 1,
        content: 'second matching chunk',
        lineStart: 1,
        lineEnd: 2,
      },
    ];
    const fakeStore = {
      vecAvailable: false,
      searchBm25: () => [
        { id: 'first-1', score: 1 },
        { id: 'first-2', score: 0.9 },
        { id: 'second-1', score: 0.8 },
      ],
      getChunksByIds: (ids: string[]) => chunks.filter((chunk) => ids.includes(chunk.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    try {
      fs.mkdirSync(path.dirname(firstPath), { recursive: true });
      fs.writeFileSync(firstPath, firstContent, 'utf8');
      fs.writeFileSync(secondPath, secondContent, 'utf8');

      const results = await testIndexer.search('duplicate source query', 2);

      assert.equal(results.length, 2);
      assert.deepEqual(
        results.map((result) => result.chunk.source),
        ['compiled/entities/first.md', 'compiled/entities/second.md'],
      );
      assert.equal(results[0].chunk.content, firstContent);
      assert.equal(results[1].chunk.content, secondContent);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Task 3.1: Rewrite — asserts union behavior (previously asserted the removed intersection filter).
  // BC1 + BC2: dense-only high-score candidate surfaces; dual-channel hit ranks first.
  test('search includes high-score dense-only results alongside BM25 matches', async () => {
    const testCfg = makeConfig('/tmp/search-union-behavior');
    const chunks = [
      {
        id: 'preference-1',
        source: 'compiled/preferences.md',
        heading: '',
        headingLevel: 0,
        content: 'I like fish',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'dense-only-1',
        source: 'compiled/entities/worktree.md',
        heading: 'Worktree',
        headingLevel: 1,
        content: 'Unrelated worktree lifecycle content',
        lineStart: 1,
        lineEnd: 2,
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      searchDense: () => [
        { id: 'dense-only-1', score: 0.99 }, // score >= DENSE_SCORE_FLOOR (0.2) → survives floor
        { id: 'preference-1', score: 0.98 },
      ],
      searchBm25: () => [{ id: 'preference-1', score: 1 }],
      getChunksByIds: (ids: string[]) => chunks.filter((chunk) => ids.includes(chunk.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('personal likes and preferences of the user', 5);

    const resultIds = results.map((r) => r.chunk.id);
    assert.ok(resultIds.includes('preference-1'), `Expected preference-1 in results, got: ${resultIds.join(', ')}`);
    assert.ok(resultIds.includes('dense-only-1'), `Expected dense-only-1 in results, got: ${resultIds.join(', ')}`);
    assert.equal(results[0].chunk.id, 'preference-1', 'dual-channel hit must rank first');
    assert.equal(results[0].retriever, 'both');
    const denseOnlyResult = results.find((r) => r.chunk.id === 'dense-only-1');
    assert.ok(denseOnlyResult, 'dense-only-1 must be present in results');
    assert.equal(denseOnlyResult.retriever, 'dense');
  });

  // Task 3.2 — Regression tests BC1–BC9

  // BC3: durable dual-channel memory ranks above a newer single-channel chunk despite lower recency score
  test('BC3: durable dual-channel chunk ranks above newer single-channel chunk', async () => {
    const testCfg = makeConfig('/tmp/bc3-durable-vs-recent');
    const chunks = [
      {
        id: 'durable-1',
        source: 'compiled/preferences.md',
        heading: '',
        headingLevel: 0,
        content: 'I prefer dark mode',
        lineStart: 1,
        lineEnd: 1,
        fileMtimeAt: 100, // old mtime
      },
      {
        id: 'recent-1',
        source: 'compiled/entities/meeting.md',
        heading: 'Meeting',
        headingLevel: 1,
        content: 'Meeting notes from today',
        lineStart: 1,
        lineEnd: 2,
        fileMtimeAt: 9_999_999_999_999, // very new mtime
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      searchDense: () => [{ id: 'durable-1', score: 0.9 }],
      searchBm25: () => [
        { id: 'durable-1', score: 1 }, // rank 0 in bm25
        { id: 'recent-1', score: 0.8 }, // rank 1 in bm25 — newer mtime but single bm25 channel
      ],
      getChunksByIds: (ids: string[]) => chunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('preferences', 5);

    assert.ok(results.length >= 2, `Expected at least 2 results, got ${results.length}`);
    assert.equal(
      results[0].chunk.id,
      'durable-1',
      'dual-channel durable memory must rank above newer single-channel chunk',
    );
    assert.equal(results[0].retriever, 'both');
    const recentResult = results.find((r) => r.chunk.id === 'recent-1');
    assert.ok(recentResult, 'recent-1 must still surface');
  });

  // BC4: search returns dense results when BM25 is empty, with recency channel applied
  test('BC4: search returns dense results and applies recency when BM25 has no matches', async () => {
    const testCfg = makeConfig('/tmp/bc4-dense-only-recency');
    const chunks = [
      {
        id: 'semantic-old',
        source: 'compiled/concepts/topic.md',
        heading: 'Topic',
        headingLevel: 1,
        content: 'Concept about topic',
        lineStart: 1,
        lineEnd: 2,
        fileMtimeAt: 1, // very old
      },
      {
        id: 'semantic-new',
        source: 'compiled/entities/recent-entity.md',
        heading: 'Recent',
        headingLevel: 1,
        content: 'Recent entity content',
        lineStart: 1,
        lineEnd: 2,
        fileMtimeAt: 9_999_999_999_999, // very new
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      searchDense: () => [
        { id: 'semantic-old', score: 0.9 }, // dense rank 0
        { id: 'semantic-new', score: 0.85 }, // dense rank 1
      ],
      searchBm25: () => [],
      getChunksByIds: (ids: string[]) => chunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('topic', 5);

    assert.ok(results.length >= 2, `Expected at least 2 dense results, got ${results.length}`);
    const ids = results.map((r) => r.chunk.id);
    assert.ok(ids.includes('semantic-old'), 'semantic-old must be present');
    assert.ok(ids.includes('semantic-new'), 'semantic-new must be present');
    for (const result of results) {
      assert.equal(result.retriever, 'dense', `Expected retriever 'dense', got '${result.retriever}'`);
      assert.ok(result.score > 0, 'Normalized score must be positive');
    }
  });

  // BC5: dense channel unavailable — bm25 results returned with finite normalized score, no throw
  test('BC5: bm25 results are returned with normalized score when dense channel is unavailable', async () => {
    const testCfg = makeConfig('/tmp/bc5-dense-unavailable');
    const chunks = [
      {
        id: 'keyword-1',
        source: 'compiled/concepts/keyword.md',
        heading: 'Keyword',
        headingLevel: 1,
        content: 'Keyword concept content',
        lineStart: 1,
        lineEnd: 2,
      },
    ];
    const fakeStore = {
      vecAvailable: false,
      searchBm25: () => [{ id: 'keyword-1', score: 1 }],
      getChunksByIds: (ids: string[]) => chunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('keyword', 5);

    assert.equal(results.length, 1, 'Must return bm25 result when dense is unavailable');
    assert.equal(results[0].chunk.id, 'keyword-1');
    assert.equal(results[0].retriever, 'bm25');
    assert.ok(Number.isFinite(results[0].score), 'Score must be finite');
    assert.ok(results[0].score >= 0 && results[0].score <= 1, `Score must be in [0,1], got ${results[0].score}`);
  });

  // BC6: both channels empty → search returns []
  test('BC6: search returns empty array when both dense and bm25 channels are empty', async () => {
    const testCfg = makeConfig('/tmp/bc6-both-empty');
    const fakeStore = {
      vecAvailable: false,
      searchBm25: () => [],
      getChunksByIds: () => [],
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('anything', 5);

    assert.deepEqual(results, []);
  });

  // BC7: per-source dedup yields up to topK distinct sources even when one source dominates the pool
  test('BC7: per-source dedup yields topK distinct sources when one source dominates the pool', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc7-overfetch-'));
    const testCfg = makeConfig(path.join(testDir, 'wiki'));
    const allChunks = [
      {
        id: 'dom-1',
        source: 'compiled/entities/dominant.md',
        heading: '',
        headingLevel: 0,
        content: 'dom 1',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'dom-2',
        source: 'compiled/entities/dominant.md',
        heading: '',
        headingLevel: 0,
        content: 'dom 2',
        lineStart: 2,
        lineEnd: 2,
      },
      {
        id: 'dom-3',
        source: 'compiled/entities/dominant.md',
        heading: '',
        headingLevel: 0,
        content: 'dom 3',
        lineStart: 3,
        lineEnd: 3,
      },
      {
        id: 'dom-4',
        source: 'compiled/entities/dominant.md',
        heading: '',
        headingLevel: 0,
        content: 'dom 4',
        lineStart: 4,
        lineEnd: 4,
      },
      {
        id: 'dom-5',
        source: 'compiled/entities/dominant.md',
        heading: '',
        headingLevel: 0,
        content: 'dom 5',
        lineStart: 5,
        lineEnd: 5,
      },
      {
        id: 'src-b-1',
        source: 'compiled/entities/source-b.md',
        heading: '',
        headingLevel: 0,
        content: 'source b',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'src-c-1',
        source: 'compiled/entities/source-c.md',
        heading: '',
        headingLevel: 0,
        content: 'source c',
        lineStart: 1,
        lineEnd: 1,
      },
    ];
    const fakeStore = {
      vecAvailable: false,
      searchBm25: () => [
        { id: 'dom-1', score: 5 },
        { id: 'dom-2', score: 4.9 },
        { id: 'dom-3', score: 4.8 },
        { id: 'dom-4', score: 4.7 },
        { id: 'dom-5', score: 4.6 },
        { id: 'src-b-1', score: 3 },
        { id: 'src-c-1', score: 2 },
      ],
      getChunksByIds: (ids: string[]) => allChunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    try {
      const entitiesDir = path.join(testCfg.wikiDir, 'compiled', 'entities');
      fs.mkdirSync(entitiesDir, { recursive: true });
      fs.writeFileSync(path.join(entitiesDir, 'dominant.md'), 'dominant content', 'utf8');
      fs.writeFileSync(path.join(entitiesDir, 'source-b.md'), 'source b content', 'utf8');
      fs.writeFileSync(path.join(entitiesDir, 'source-c.md'), 'source c content', 'utf8');

      const results = await testIndexer.search('query', 3);

      assert.equal(results.length, 3, `Expected 3 results, got ${results.length}`);
      const sources = results.map((r) => r.chunk.source);
      const uniqueSources = new Set(sources);
      assert.equal(uniqueSources.size, 3, 'Each result must be from a distinct source');
      assert.ok(sources.includes('compiled/entities/dominant.md'), 'dominant source must be present');
      assert.ok(sources.includes('compiled/entities/source-b.md'), 'source-b must be present');
      assert.ok(sources.includes('compiled/entities/source-c.md'), 'source-c must be present');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // BC8: dense-only candidate below DENSE_SCORE_FLOOR (0.2) is dropped; at/above floor is kept; bm25-only never dropped
  test('BC8: dense-only candidate below DENSE_SCORE_FLOOR is dropped; bm25-only and above-floor are kept', async () => {
    const testCfg = makeConfig('/tmp/bc8-floor');
    const chunks = [
      {
        id: 'below-floor',
        source: 'compiled/entities/below.md',
        heading: '',
        headingLevel: 0,
        content: 'below floor dense',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'above-floor',
        source: 'compiled/entities/above.md',
        heading: '',
        headingLevel: 0,
        content: 'above floor dense',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'bm25-overlap',
        source: 'compiled/concepts/overlap.md',
        heading: '',
        headingLevel: 0,
        content: 'overlap content',
        lineStart: 1,
        lineEnd: 1,
      },
      {
        id: 'bm25-only',
        source: 'compiled/concepts/keyword-only.md',
        heading: '',
        headingLevel: 0,
        content: 'keyword only',
        lineStart: 1,
        lineEnd: 1,
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      // below-floor: dense-only, score 0.1 < DENSE_SCORE_FLOOR (0.2) → must be dropped
      // above-floor: dense-only, score 0.9 >= DENSE_SCORE_FLOOR (0.2) → must be kept
      // bm25-overlap: in both channels → never dropped regardless of dense score
      searchDense: () => [
        { id: 'below-floor', score: 0.1 },
        { id: 'above-floor', score: 0.9 },
        { id: 'bm25-overlap', score: 0.3 },
      ],
      searchBm25: () => [
        { id: 'bm25-overlap', score: 1 },
        { id: 'bm25-only', score: 0.8 },
      ],
      getChunksByIds: (ids: string[]) => chunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('query', 10);

    const resultIds = results.map((r) => r.chunk.id);
    assert.ok(
      !resultIds.includes('below-floor'),
      `below-floor (score 0.1 < 0.2) must be dropped; got: ${resultIds.join(', ')}`,
    );
    assert.ok(
      resultIds.includes('above-floor'),
      `above-floor (score 0.9 >= 0.2) must be kept; got: ${resultIds.join(', ')}`,
    );
    assert.ok(resultIds.includes('bm25-overlap'), `bm25-overlap (dual-channel) must always be kept`);
    assert.ok(resultIds.includes('bm25-only'), `bm25-only must never be dropped by the floor`);
  });

  // BC9: recency tiebreak is stable — repeated calls with tied/absent fileMtimeAt return identical order
  test('BC9: repeated search calls with equal-mtime candidates return deterministic order', async () => {
    const testCfg = makeConfig('/tmp/bc9-determinism');
    const chunks = [
      {
        id: 'c1',
        source: 'compiled/entities/c1.md',
        heading: '',
        headingLevel: 0,
        content: 'c1 content',
        lineStart: 1,
        lineEnd: 1,
        fileMtimeAt: 0,
      },
      {
        id: 'c2',
        source: 'compiled/entities/c2.md',
        heading: '',
        headingLevel: 0,
        content: 'c2 content',
        lineStart: 1,
        lineEnd: 1,
        fileMtimeAt: 0,
      },
      {
        id: 'c3',
        source: 'compiled/entities/c3.md',
        heading: '',
        headingLevel: 0,
        content: 'c3 content',
        lineStart: 1,
        lineEnd: 1,
        fileMtimeAt: 0,
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      searchDense: () => [
        { id: 'c1', score: 0.9 },
        { id: 'c2', score: 0.85 },
        { id: 'c3', score: 0.8 },
      ],
      searchBm25: () => [],
      getChunksByIds: (ids: string[]) => chunks.filter((c) => ids.includes(c.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const firstCall = await testIndexer.search('query', 5);
    const secondCall = await testIndexer.search('query', 5);

    assert.equal(firstCall.length, secondCall.length, 'Result count must be identical across calls');
    for (let idx = 0; idx < firstCall.length; idx++) {
      assert.equal(
        firstCall[idx].chunk.id,
        secondCall[idx].chunk.id,
        `Position ${idx} must be deterministic: got '${firstCall[idx].chunk.id}' vs '${secondCall[idx].chunk.id}'`,
      );
    }
  });

  test('search still returns dense-only results when BM25 has no matches', async () => {
    const testCfg = makeConfig('/tmp/search-dense-fallback');
    const chunks = [
      {
        id: 'semantic-1',
        source: 'compiled/preferences.md',
        heading: '',
        headingLevel: 0,
        content: 'I like fish',
        lineStart: 1,
        lineEnd: 1,
      },
    ];
    const fakeStore = {
      vecAvailable: true,
      searchDense: () => [{ id: 'semantic-1', score: 0.99 }],
      searchBm25: () => [],
      getChunksByIds: (ids: string[]) => chunks.filter((chunk) => ids.includes(chunk.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('favorite dish', 5);

    assert.deepEqual(
      results.map((result) => result.chunk.id),
      ['semantic-1'],
    );
    assert.equal(results[0].retriever, 'dense');
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

  test('save appends manual content to daily wiki raw save file without indexing it', async () => {
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
      const chunks = testStore.getChunksByIds(ids);
      for (const chunk of chunks) {
        assert.equal(chunk.sourceType, 'digest');
        assert.equal(chunk.fileMtimeAt, expectedMtime);
      }
    } finally {
      testStore.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
