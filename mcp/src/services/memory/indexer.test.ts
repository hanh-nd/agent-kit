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

  test('search does not include dense-only results when BM25 has matches', async () => {
    const testCfg = makeConfig('/tmp/search-dense-filter');
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
        { id: 'dense-only-1', score: 0.99 },
        { id: 'preference-1', score: 0.98 },
      ],
      searchBm25: () => [{ id: 'preference-1', score: 1 }],
      getChunksByIds: (ids: string[]) => chunks.filter((chunk) => ids.includes(chunk.id)),
    } as unknown as MemoryStore;
    const testIndexer = new MemoryIndexer(fakeStore, new StubEmbedder(), testCfg);

    const results = await testIndexer.search('personal likes and preferences of the user', 5);

    assert.deepEqual(
      results.map((result) => result.chunk.id),
      ['preference-1'],
    );
    assert.equal(results[0].retriever, 'both');
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
