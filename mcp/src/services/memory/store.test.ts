import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MemoryStore } from './store.js';
import { type MemoryChunk, EmbeddingModelName } from './types.js';

const TEST_CONFIG = {
  enabled: true,
  wikiDir: '',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.SMALL,
  vectorDimension: 384,
};

function makeChunk(overrides: Partial<MemoryChunk> = {}): MemoryChunk {
  return {
    id: 'test-id-0000001',
    source: 'test.md',
    heading: 'Test Heading',
    headingLevel: 1,
    content: 'This is test content for BM25 search.',
    lineStart: 1,
    lineEnd: 5,
    ...overrides,
  };
}

describe('MemoryStore', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: MemoryStore;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-test-'));
    dbPath = path.join(tmpDir, 'index.db');
    store = new MemoryStore(dbPath, TEST_CONFIG);
  });

  after(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('vecAvailable is a boolean', () => {
    assert.equal(typeof store.vecAvailable, 'boolean');
  });

  test('hashesBySource returns empty set for unknown source', () => {
    const hashes = store.hashesBySource('nonexistent.md');
    assert.ok(hashes instanceof Set);
    assert.equal(hashes.size, 0);
  });

  test('upsert stores chunks and hashesBySource returns their ids', () => {
    const chunk = makeChunk({ id: 'upsert-test-0001', source: 'upsert.md' });
    const embedding = new Float32Array(384).fill(0.1);
    store.upsert([chunk], [embedding]);

    const hashes = store.hashesBySource('upsert.md');
    assert.ok(hashes.has('upsert-test-0001'));
  });

  test('deleteBySource removes all chunks for that source', () => {
    const c1 = makeChunk({
      id: 'del-src-0001',
      source: 'deleteme.md',
      content: 'delete source chunk 1',
    });
    const c2 = makeChunk({
      id: 'del-src-0002',
      source: 'deleteme.md',
      content: 'delete source chunk 2',
    });
    store.upsert([c1, c2], [new Float32Array(384), new Float32Array(384)]);

    store.deleteBySource('deleteme.md');

    const hashes = store.hashesBySource('deleteme.md');
    assert.equal(hashes.size, 0);
  });

  test('searchBm25 returns matching result after upsert', () => {
    const chunk = makeChunk({
      id: 'bm25-search-0001',
      source: 'bm25.md',
      content: 'uniqueKeywordXYZ for BM25 testing',
    });
    store.upsert([chunk], [new Float32Array(384)]);

    const results = store.searchBm25('uniqueKeywordXYZ', 5);
    assert.ok(results.length > 0, 'Expected at least one BM25 result');
    assert.ok(
      results.some((r) => r.id === 'bm25-search-0001'),
      `Expected chunk id in results, got: ${results.map((r) => r.id).join(', ')}`,
    );
  });

  test('searchBm25 ignores filler words and matches preference source/content terms', () => {
    const preference = makeChunk({
      id: 'preference-search-0001',
      source: 'compiled/preferences.md',
      heading: '',
      headingLevel: 0,
      content: 'I like fish',
    });
    const unrelated = makeChunk({
      id: 'preference-search-0002',
      source: 'compiled/entities/worktree.md',
      heading: 'Open Questions',
      content: 'How should git manage worktree lifecycle decisions?',
    });
    store.upsert([preference, unrelated], [new Float32Array(384), new Float32Array(384)]);

    const results = store.searchBm25('personal likes and preferences of the user', 5);

    assert.ok(results.length > 0, 'Expected preference query to return results');
    assert.equal(results[0].id, 'preference-search-0001');
  });

  test('searchBm25 returns empty array for empty query', () => {
    const results = store.searchBm25('   ', 5);
    assert.deepEqual(results, []);
  });

  test('getChunksByIds returns correct metadata for stored chunk', () => {
    const chunk = makeChunk({
      id: 'get-by-ids-0001',
      source: 'metadata.md',
      heading: 'Metadata Section',
      headingLevel: 2,
      content: 'Content for metadata test',
      lineStart: 10,
      lineEnd: 20,
    });
    store.upsert([chunk], [new Float32Array(384)]);

    const results = store.getChunksByIds(['get-by-ids-0001']);
    assert.equal(results.length, 1);
    const [r] = results;
    assert.equal(r.id, 'get-by-ids-0001');
    assert.equal(r.source, 'metadata.md');
    assert.equal(r.heading, 'Metadata Section');
    assert.equal(r.headingLevel, 2);
    assert.equal(r.lineStart, 10);
    assert.equal(r.lineEnd, 20);
  });

  test('getChunksByIds returns only found rows for mixed ids', () => {
    const chunk = makeChunk({ id: 'partial-found-0001', source: 'partial.md', content: 'partial' });
    store.upsert([chunk], [new Float32Array(384)]);

    const results = store.getChunksByIds(['partial-found-0001', 'does-not-exist-999']);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'partial-found-0001');
  });

  test('indexedSources includes source after upsert', () => {
    const chunk = makeChunk({
      id: 'indexed-src-0001',
      source: 'indexed-source.md',
      content: 'indexed',
    });
    store.upsert([chunk], [new Float32Array(384)]);

    const sources = store.indexedSources();
    assert.ok(sources.includes('indexed-source.md'), `Expected 'indexed-source.md' in ${sources.join(', ')}`);
  });

  test('deleteByIds removes specific chunks', () => {
    const c1 = makeChunk({ id: 'del-ids-0001', source: 'del-ids.md', content: 'delete by id 1' });
    const c2 = makeChunk({ id: 'del-ids-0002', source: 'del-ids.md', content: 'delete by id 2' });
    store.upsert([c1, c2], [new Float32Array(384), new Float32Array(384)]);

    store.deleteByIds(['del-ids-0001']);

    const hashes = store.hashesBySource('del-ids.md');
    assert.ok(!hashes.has('del-ids-0001'), 'Deleted chunk id must be gone');
    assert.ok(hashes.has('del-ids-0002'), 'Non-deleted chunk id must remain');
  });

  test('searchBm25 still works regardless of vecAvailable', () => {
    // This verifies FTS5 degraded mode is always functional
    const chunk = makeChunk({
      id: 'fts5-degraded-0001',
      source: 'fts5.md',
      content: 'degradedModeTest keyword',
    });
    store.upsert([chunk], [new Float32Array(384)]);

    const results = store.searchBm25('degradedModeTest', 5);
    assert.ok(results.length > 0, 'FTS5 search must work regardless of vecAvailable');
  });
});
