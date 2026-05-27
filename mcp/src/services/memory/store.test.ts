import Database from 'libsql';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MemoryStore, SCHEMA_VERSION } from './store.js';
import { type MemoryChunk, EmbeddingModelName } from './types.js';

const TEST_CONFIG = {
  enabled: true,
  wikiDir: '',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.BASE,
  vectorDimension: 384,
};

function makeChunk(overrides: Partial<MemoryChunk> = {}): MemoryChunk {
  return {
    id: 'test-id-0000001',
    source: 'test.md',
    sourceType: 'wiki',
    heading: 'Test Heading',
    headingLevel: 1,
    content: 'This is test content for BM25 search.',
    lineStart: 1,
    lineEnd: 5,
    fileMtimeAt: 1000,
    ...overrides,
  };
}

function makeEmbedding(activeIndex: number, dimension = TEST_CONFIG.vectorDimension): Float32Array {
  const embedding = new Float32Array(dimension);
  embedding[activeIndex] = 1;
  return embedding;
}

function readUserVersion(db: Database.Database): number {
  const value = db.pragma('user_version', { simple: true });
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    const [row] = value as Array<{ user_version?: unknown }>;
    return typeof row?.user_version === 'number' ? row.user_version : 0;
  }
  if (value && typeof value === 'object' && 'user_version' in value) {
    const row = value as { user_version?: unknown };
    return typeof row.user_version === 'number' ? row.user_version : 0;
  }
  return 0;
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

  test('libsql supports required local driver and vector features', () => {
    const libsqlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-libsql-compat-'));
    const libsqlDb = new Database(path.join(libsqlDir, 'index.db'));

    try {
      assert.equal(readUserVersion(libsqlDb), 0);
      libsqlDb.pragma('journal_mode = WAL');
      libsqlDb.pragma('busy_timeout = 5000');
      libsqlDb.pragma(`user_version = ${SCHEMA_VERSION}`);
      assert.equal(readUserVersion(libsqlDb), SCHEMA_VERSION);

      libsqlDb.exec(`
        CREATE TABLE vector_items (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          embedding F32_BLOB(3) NOT NULL
        );
        CREATE INDEX idx_vector_items_embedding
          ON vector_items (libsql_vector_idx(embedding));
      `);

      const insert = libsqlDb.prepare(`INSERT INTO vector_items (name, embedding) VALUES (?, vector32(?))`);
      const info = insert.run('alpha', '[1,0,0]');
      assert.equal(info.lastInsertRowid, 1);
      insert.run('beta', '[0,1,0]');

      const insertGamma = libsqlDb.transaction(() => insert.run('gamma', '[0,0,1]'));
      insertGamma();

      const distance = libsqlDb
        .prepare(`SELECT vector_distance_cos(embedding, vector32(?)) AS distance FROM vector_items WHERE name = ?`)
        .get('[1,0,0]', 'alpha') as { distance: number };
      assert.equal(distance.distance, 0);

      const rows = libsqlDb
        .prepare(
          `SELECT vector_items.name
           FROM vector_top_k('idx_vector_items_embedding', vector32(?), ?) AS vector_matches
           JOIN vector_items ON vector_items.rowid = vector_matches.id
           ORDER BY vector_distance_cos(vector_items.embedding, vector32(?))`,
        )
        .all('[1,0,0]', 2, '[1,0,0]') as Array<{ name: string }>;

      assert.equal(rows[0].name, 'alpha');
      assert.equal(rows.length, 2);
    } finally {
      libsqlDb.close();
      fs.rmSync(libsqlDir, { recursive: true, force: true });
    }
  });

  test('vecAvailable is true after schema creation', () => {
    assert.equal(store.vecAvailable, true);
  });

  test('hashesBySource returns empty set for unknown source', () => {
    const hashes = store.hashesBySource('nonexistent.md');
    assert.ok(hashes instanceof Set);
    assert.equal(hashes.size, 0);
  });

  test('upsert stores chunks and hashesBySource returns their ids', () => {
    const chunk = makeChunk({ id: 'upsert-test-0001', source: 'upsert.md', sourceType: 'entity', fileMtimeAt: 2000 });
    const embedding = makeEmbedding(0);
    store.upsert([chunk], [embedding]);

    const hashes = store.hashesBySource('upsert.md');
    assert.ok(hashes.has('upsert-test-0001'));

    const [stored] = store.getChunksByIds(['upsert-test-0001']);
    assert.equal(stored.sourceType, 'entity');
    assert.equal(stored.fileMtimeAt, 2000);
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
    store.upsert([c1, c2], [makeEmbedding(1), makeEmbedding(2)]);

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
    store.upsert([chunk], [makeEmbedding(3)]);

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
    store.upsert([preference, unrelated], [makeEmbedding(4), makeEmbedding(5)]);

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
      sourceType: 'concept',
      heading: 'Metadata Section',
      headingLevel: 2,
      content: 'Content for metadata test',
      lineStart: 10,
      lineEnd: 20,
      fileMtimeAt: 3000,
    });
    store.upsert([chunk], [makeEmbedding(6)]);

    const results = store.getChunksByIds(['get-by-ids-0001']);
    assert.equal(results.length, 1);
    const [r] = results;
    assert.equal(r.id, 'get-by-ids-0001');
    assert.equal(r.source, 'metadata.md');
    assert.equal(r.sourceType, 'concept');
    assert.equal(r.heading, 'Metadata Section');
    assert.equal(r.headingLevel, 2);
    assert.equal(r.lineStart, 10);
    assert.equal(r.lineEnd, 20);
    assert.equal(r.fileMtimeAt, 3000);
  });

  test('getChunksByIds returns only found rows for mixed ids', () => {
    const chunk = makeChunk({ id: 'partial-found-0001', source: 'partial.md', content: 'partial' });
    store.upsert([chunk], [makeEmbedding(7)]);

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
    store.upsert([chunk], [makeEmbedding(8)]);

    const sources = store.indexedSources();
    assert.ok(sources.includes('indexed-source.md'), `Expected 'indexed-source.md' in ${sources.join(', ')}`);
  });

  test('deleteByIds removes specific chunks', () => {
    const c1 = makeChunk({ id: 'del-ids-0001', source: 'del-ids.md', content: 'delete by id 1' });
    const c2 = makeChunk({ id: 'del-ids-0002', source: 'del-ids.md', content: 'delete by id 2' });
    store.upsert([c1, c2], [makeEmbedding(9), makeEmbedding(10)]);

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
    store.upsert([chunk], [makeEmbedding(11)]);

    const results = store.searchBm25('degradedModeTest', 5);
    assert.ok(results.length > 0, 'FTS5 search must work regardless of vecAvailable');
  });

  test('getRecentSources returns distinct sources ordered by newest chunk mtime', () => {
    const recentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-recent-store-'));
    const recentStore = new MemoryStore(path.join(recentDir, 'index.db'), { ...TEST_CONFIG, wikiDir: recentDir });

    try {
      recentStore.upsert(
        [
          makeChunk({
            id: 'recent-digest-old',
            source: 'compiled/provisional/conversation-digests/old.md',
            sourceType: 'digest',
            fileMtimeAt: 100,
            content: 'old digest',
          }),
          makeChunk({
            id: 'recent-digest-new',
            source: 'compiled/provisional/conversation-digests/new.md',
            sourceType: 'digest',
            fileMtimeAt: 300,
            content: 'new digest',
          }),
          makeChunk({
            id: 'recent-digest-newer-same-source',
            source: 'compiled/provisional/conversation-digests/old.md',
            sourceType: 'digest',
            fileMtimeAt: 400,
            content: 'old digest update',
          }),
          makeChunk({
            id: 'recent-entity',
            source: 'compiled/entities/entity.md',
            sourceType: 'entity',
            fileMtimeAt: 500,
            content: 'entity',
          }),
        ],
        [makeEmbedding(12), makeEmbedding(13), makeEmbedding(14), makeEmbedding(15)],
      );

      const allRows = recentStore.getRecentSources({ limit: 10 });
      assert.deepEqual(
        allRows.map((row) => row.source),
        [
          'compiled/entities/entity.md',
          'compiled/provisional/conversation-digests/old.md',
          'compiled/provisional/conversation-digests/new.md',
        ],
      );

      const digestRows = recentStore.getRecentSources({ limit: 10, sourceType: 'digest' });
      assert.deepEqual(
        digestRows.map((row) => row.source),
        ['compiled/provisional/conversation-digests/old.md', 'compiled/provisional/conversation-digests/new.md'],
      );
      assert.equal(digestRows[0].fileMtimeAt, 400);
    } finally {
      recentStore.close();
      fs.rmSync(recentDir, { recursive: true, force: true });
    }
  });

  test('searchDense returns nearest vector with bounded scores', () => {
    const denseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-dense-store-'));
    const denseStore = new MemoryStore(path.join(denseDir, 'index.db'), { ...TEST_CONFIG, wikiDir: denseDir });

    try {
      denseStore.upsert(
        [
          makeChunk({ id: 'dense-alpha', source: 'dense.md', content: 'alpha vector' }),
          makeChunk({ id: 'dense-beta', source: 'dense.md', content: 'beta vector' }),
          makeChunk({ id: 'dense-gamma', source: 'dense.md', content: 'gamma vector' }),
        ],
        [makeEmbedding(21), makeEmbedding(22), makeEmbedding(23)],
      );

      const results = denseStore.searchDense(makeEmbedding(22), 3);
      assert.ok(results.length > 0, 'Expected dense search results');
      assert.equal(results[0].id, 'dense-beta');
      assert.ok(results.every((result) => result.score >= 0 && result.score <= 1));
    } finally {
      denseStore.close();
      fs.rmSync(denseDir, { recursive: true, force: true });
    }
  });

  test('searchDense returns empty array for invalid query embedding', () => {
    assert.deepEqual(store.searchDense(new Float32Array(3), 5), []);
  });

  test('upsert skips invalid embeddings while persisting valid chunks', () => {
    const validChunk = makeChunk({ id: 'valid-embedding-0001', source: 'embedding-validation.md' });
    const invalidChunk = makeChunk({ id: 'invalid-embedding-0001', source: 'embedding-validation.md' });
    const nonFiniteChunk = makeChunk({ id: 'non-finite-embedding-0001', source: 'embedding-validation.md' });
    const nonFiniteEmbedding = makeEmbedding(24);
    nonFiniteEmbedding[25] = Number.NaN;

    store.upsert(
      [validChunk, invalidChunk, nonFiniteChunk],
      [makeEmbedding(24), new Float32Array(3), nonFiniteEmbedding],
    );

    const hashes = store.hashesBySource('embedding-validation.md');
    assert.ok(hashes.has('valid-embedding-0001'));
    assert.ok(!hashes.has('invalid-embedding-0001'));
    assert.ok(!hashes.has('non-finite-embedding-0001'));
  });

  test('schema migration recreates versioned schema with new columns, vector index, and working BM25', () => {
    const migrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-migration-'));
    const migrationDbPath = path.join(migrationDir, 'index.db');
    const db = new Database(migrationDbPath);
    db.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE memory_chunks (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        heading TEXT NOT NULL DEFAULT '',
        heading_level INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE memory_fts USING fts5(
        source,
        heading,
        content,
        content='memory_chunks',
        content_rowid='rowid'
      );
      CREATE TRIGGER memory_chunks_ai
        AFTER INSERT ON memory_chunks BEGIN
          INSERT INTO memory_fts(rowid, source, heading, content)
            VALUES (new.rowid, new.source, new.heading, new.content);
        END;
      CREATE TRIGGER memory_chunks_ad
        AFTER DELETE ON memory_chunks BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, source, heading, content)
            VALUES ('delete', old.rowid, old.source, old.heading, old.content);
        END;
    `);
    db.prepare(
      `INSERT INTO memory_chunks
        (id, source, heading, heading_level, content, line_start, line_end, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('old-row', 'old.md', '', 0, 'old content', 1, 1, 1);
    db.close();

    const migratedStore = new MemoryStore(migrationDbPath, { ...TEST_CONFIG, wikiDir: migrationDir });
    try {
      const verifyDb = new Database(migrationDbPath, { readonly: true });
      try {
        assert.equal(readUserVersion(verifyDb), SCHEMA_VERSION);
        const columns = verifyDb.prepare(`PRAGMA table_info(memory_chunks)`).all() as Array<{ name: string }>;
        assert.ok(columns.some((column) => column.name === 'source_type'));
        assert.ok(columns.some((column) => column.name === 'file_mtime_at'));
        assert.ok(columns.some((column) => column.name === 'embedding'));
        const indexes = verifyDb.prepare(`PRAGMA index_list(memory_chunks)`).all() as Array<{ name: string }>;
        assert.ok(indexes.some((index) => index.name === 'idx_memory_chunks_type_mtime'));
        assert.ok(indexes.some((index) => index.name === 'idx_memory_chunks_embedding'));
        const rowCount = verifyDb.prepare(`SELECT COUNT(*) AS count FROM memory_chunks`).get() as { count: number };
        assert.equal(rowCount.count, 0);
      } finally {
        verifyDb.close();
      }

      const migratedChunk = makeChunk({
        id: 'migrated-bm25-0001',
        source: 'migrated.md',
        content: 'postMigrationKeyword is searchable after migration',
      });
      migratedStore.upsert([migratedChunk], [makeEmbedding(16)]);
      const results = migratedStore.searchBm25('postMigrationKeyword', 5);
      assert.ok(results.some((result) => result.id === 'migrated-bm25-0001'));
    } finally {
      migratedStore.close();
      fs.rmSync(migrationDir, { recursive: true, force: true });
    }
  });

  test('recreates schema when existing vector dimension differs from config', () => {
    const dimensionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-dimension-migration-'));
    const dimensionDbPath = path.join(dimensionDir, 'index.db');

    const baseStore = new MemoryStore(dimensionDbPath, { ...TEST_CONFIG, wikiDir: dimensionDir });
    try {
      baseStore.upsert([makeChunk({ id: 'old-dimension-row', source: 'dimension.md' })], [makeEmbedding(17)]);
    } finally {
      baseStore.close();
    }

    const largeConfig = {
      ...TEST_CONFIG,
      wikiDir: dimensionDir,
      embeddingModel: EmbeddingModelName.LARGE,
      vectorDimension: 768,
    };
    const largeStore = new MemoryStore(dimensionDbPath, largeConfig);
    try {
      const verifyDb = new Database(dimensionDbPath, { readonly: true });
      try {
        const columns = verifyDb.prepare(`PRAGMA table_info(memory_chunks)`).all() as Array<{
          name: string;
          type: string;
        }>;
        const embeddingColumn = columns.find((column) => column.name === 'embedding');
        assert.equal(embeddingColumn?.type, 'F32_BLOB(768)');
        const rowCount = verifyDb.prepare(`SELECT COUNT(*) AS count FROM memory_chunks`).get() as { count: number };
        assert.equal(rowCount.count, 0);
      } finally {
        verifyDb.close();
      }

      const chunk = makeChunk({
        id: 'new-dimension-row',
        source: 'dimension.md',
        content: 'large dimension vector can be indexed',
      });
      largeStore.upsert([chunk], [makeEmbedding(18, 768)]);

      const results = largeStore.searchBm25('large dimension vector', 5);
      assert.ok(results.some((result) => result.id === 'new-dimension-row'));
    } finally {
      largeStore.close();
      fs.rmSync(dimensionDir, { recursive: true, force: true });
    }
  });
});
