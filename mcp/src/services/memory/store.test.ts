import Database from 'libsql';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MemoryStore, SCHEMA_VERSION } from './store.js';
import { type HybridSearchOptions, type MemoryChunk, EmbeddingModelName } from './types.js';
import { DENSE_SCORE_FLOOR, FETCH_MULTIPLIER, RECENCY_WEIGHT, RRF_K } from './constants.js';

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

  // BC22: Task 1.3 — prove hybrid SQL shape (CTEs + ROW_NUMBER OVER + UNION + PARTITION BY + vector_top_k + FTS)
  test('BC22: libsql supports hybrid SQL primitives — CTEs, ROW_NUMBER OVER, UNION, PARTITION BY, vector_top_k, bm25', () => {
    const compatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-hybrid-compat-'));
    const db = new Database(path.join(compatDir, 'compat.db'));

    try {
      db.pragma('journal_mode = WAL');
      db.exec(`
        CREATE TABLE items (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          src TEXT NOT NULL,
          embedding F32_BLOB(3) NOT NULL
        );
        CREATE INDEX idx_items_embedding ON items (libsql_vector_idx(embedding));
        CREATE VIRTUAL TABLE items_fts USING fts5(id, src, content='items', content_rowid='rowid');
        CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
          INSERT INTO items_fts(rowid, id, src) VALUES (new.rowid, new.id, new.src);
        END;
      `);

      const ins = db.prepare(`INSERT INTO items (id, src, embedding) VALUES (?, ?, vector32(?))`);
      ins.run('a', 'source-alpha.md', '[1,0,0]');
      ins.run('b', 'source-alpha.md', '[0,1,0]');
      ins.run('c', 'source-beta.md', '[0,0,1]');

      // Full hybrid SQL shape: CTEs + ROW_NUMBER OVER + UNION + PARTITION BY + vector_top_k + bm25
      const queryVec = Buffer.from(new Float32Array([1, 0, 0]).buffer);
      const rows = db
        .prepare(
          `
        WITH
        dense_data AS (
          SELECT items.id, items.src,
                 vector_distance_cos(items.embedding, vector32(?)) AS dense_dist
          FROM vector_top_k('idx_items_embedding', vector32(?), ?) AS vtk
          JOIN items ON items.rowid = vtk.id
        ),
        dense_ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY dense_dist, id) AS dense_rank
          FROM dense_data
        ),
        bm25_data AS (
          SELECT items.id, items.src,
                 bm25(items_fts, 1.0, 1.0) AS bm25_neg
          FROM items_fts
          JOIN items ON items.rowid = items_fts.rowid
          WHERE items_fts MATCH ?
          LIMIT ?
        ),
        bm25_ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY bm25_neg, id) AS bm25_rank
          FROM bm25_data
        ),
        all_candidates AS (
          SELECT d.id, d.src, d.dense_rank, d.dense_dist, b.bm25_rank,
                 CASE WHEN b.id IS NOT NULL THEN 'both' ELSE 'dense' END AS retriever
          FROM dense_ranked d LEFT JOIN bm25_ranked b ON b.id = d.id
          UNION ALL
          SELECT b.id, b.src, NULL, NULL, b.bm25_rank, 'bm25' AS retriever
          FROM bm25_ranked b LEFT JOIN dense_ranked d ON d.id = b.id
          WHERE d.id IS NULL
        ),
        recency_ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS recency_rank
          FROM all_candidates
        ),
        scored AS (
          SELECT c.id, c.src, c.dense_rank, c.bm25_rank, c.retriever,
                 COALESCE(1.0 / (60 + c.dense_rank), 0.0) +
                 COALESCE(1.0 / (60 + c.bm25_rank), 0.0) AS total_score
          FROM all_candidates c
          JOIN recency_ranked r ON r.id = c.id
          WHERE c.retriever != 'dense' OR (1.0 - c.dense_dist) >= 0.1
        ),
        best_per_source AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY src ORDER BY total_score DESC, id) AS src_rank
          FROM scored
        )
        SELECT id, src, retriever, total_score
        FROM best_per_source
        WHERE src_rank = 1
        ORDER BY total_score DESC, src, id
        LIMIT 5
      `,
        )
        .all(queryVec, queryVec, 3, 'source*', 3) as Array<{
        id: string;
        src: string;
        retriever: string;
        total_score: number;
      }>;

      // Should return at most one row per src, 'a' (dense=0 dist → score=1) should be top
      assert.ok(rows.length > 0, 'Hybrid query must return results');
      assert.equal(rows[0].id, 'a', 'Nearest dense candidate must rank first');

      // Verify distinct sources
      const srcs = rows.map((r) => r.src);
      const uniqueSrcs = new Set(srcs);
      assert.equal(srcs.length, uniqueSrcs.size, 'Each src must appear at most once (PARTITION BY dedup)');

      // 'a' matched both dense (top) and BM25 (src matches 'source*')
      assert.equal(rows[0].retriever, 'both', "'a' must be retriever=both");
    } finally {
      db.close();
      fs.rmSync(compatDir, { recursive: true, force: true });
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
    store.upsert([chunk], [makeEmbedding(0)]);

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
    store.upsert([c1, c2], [makeEmbedding(1), makeEmbedding(2)]);

    store.deleteBySource('deleteme.md');

    const hashes = store.hashesBySource('deleteme.md');
    assert.equal(hashes.size, 0);
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
      const results = migratedStore.searchHybrid({
        query: 'postMigrationKeyword',
        topK: 5,
        fetchLimit: 20,
        denseScoreFloor: 0,
        recencyWeight: RECENCY_WEIGHT,
        rrfK: RRF_K,
      });
      assert.ok(results.some((r) => r.chunk.id === 'migrated-bm25-0001'));
    } finally {
      migratedStore.close();
      fs.rmSync(migrationDir, { recursive: true, force: true });
    }
  });

  // Task 3.4: Store-level hybrid ranking tests (BC1–BC12)
  describe('searchHybrid', () => {
    let hybridDir: string;
    let hybridStore: MemoryStore;

    function makeHybridOpts(overrides: Partial<HybridSearchOptions> = {}): HybridSearchOptions {
      return {
        query: 'test query',
        topK: 10,
        fetchLimit: 10 * FETCH_MULTIPLIER,
        denseScoreFloor: DENSE_SCORE_FLOOR,
        recencyWeight: RECENCY_WEIGHT,
        rrfK: RRF_K,
        ...overrides,
      };
    }

    before(() => {
      hybridDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-hybrid-store-'));
      hybridStore = new MemoryStore(path.join(hybridDir, 'index.db'), { ...TEST_CONFIG, wikiDir: hybridDir });

      // Insert test chunks with controlled embeddings:
      // Embedding dims 40-49 for orthogonal test vectors (dimension 384)
      // Each chunk at a unique dimension → query at dim 40 = nearest to 'alpha'
      hybridStore.upsert(
        [
          // alpha: dense-only candidate, content has no keywords
          makeChunk({
            id: 'h-alpha',
            source: 'source-alpha.md',
            content: 'semantic content with no matching keywords',
            fileMtimeAt: 1000,
            sourceType: 'wiki',
          }),
          // beta: BM25-only candidate (keywords match, embedding far)
          makeChunk({
            id: 'h-beta',
            source: 'source-beta.md',
            content: 'hybridKeyword search text retrieval',
            fileMtimeAt: 2000,
            sourceType: 'concept',
          }),
          // gamma: dual-channel candidate (keywords + near embedding)
          makeChunk({
            id: 'h-gamma',
            source: 'source-gamma.md',
            content: 'hybridKeyword semantic content',
            fileMtimeAt: 3000,
            sourceType: 'wiki',
          }),
          // delta: below-floor dense-only (far from alpha query, no keywords)
          makeChunk({
            id: 'h-delta',
            source: 'source-delta.md',
            content: 'unrelated content with no relevant terms',
            fileMtimeAt: 500,
            sourceType: 'entity',
          }),
          // epsilon: same source as alpha (multi-chunk source for dedup test)
          makeChunk({
            id: 'h-epsilon',
            source: 'source-alpha.md',
            content: 'second chunk of alpha source, different content',
            fileMtimeAt: 1000,
            sourceType: 'wiki',
          }),
          // zeta: concept source for filter tests, has keywords
          makeChunk({
            id: 'h-zeta',
            source: 'source-zeta.md',
            content: 'hybridKeyword concept data for filtering',
            fileMtimeAt: 4000,
            sourceType: 'concept',
          }),
        ],
        [
          makeEmbedding(40), // alpha — at dim 40 (will match query at dim 40)
          makeEmbedding(41), // beta  — orthogonal to dim-40 query
          makeEmbedding(40), // gamma — same embedding as alpha (near query)
          makeEmbedding(45), // delta — orthogonal to dim-40 query
          makeEmbedding(40), // epsilon — same source as alpha
          makeEmbedding(41), // zeta  — orthogonal to dim-40 query
        ],
      );
    });

    after(() => {
      hybridStore.close();
      fs.rmSync(hybridDir, { recursive: true, force: true });
    });

    // BC2: stopword-only query returns [] without malformed FTS SQL
    test('BC2: stopword-only query returns empty array without malformed FTS SQL', () => {
      const results = hybridStore.searchHybrid(makeHybridOpts({ query: 'the and or is' }));
      assert.deepEqual(results, []);
    });

    // BC4: BM25-only (no embedding) — returns finite normalized scores
    test('BC4: BM25-only search returns results with finite scores when no embedding provided', () => {
      const results = hybridStore.searchHybrid(makeHybridOpts({ query: 'hybridKeyword', embedding: undefined }));
      assert.ok(results.length > 0, 'Expected BM25-only results');
      for (const r of results) {
        assert.ok(Number.isFinite(r.score), `Score must be finite, got ${r.score}`);
        assert.ok(r.score >= 0, 'Score must be >= 0');
        assert.equal(r.retriever, 'bm25', 'retriever must be bm25 when no embedding');
      }
    });

    // BC1 + BC3: dense+BM25 — returns topK ranked rows with correct retriever attribution
    test('BC1/BC3: dual-channel search returns ranked rows with retriever attribution', () => {
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          topK: 5,
        }),
      );

      assert.ok(results.length > 0, 'Expected results from dual-channel search');
      assert.ok(results.length <= 5, 'Must not exceed topK');
      for (const r of results) {
        assert.ok(r.chunk, 'Each row must have a chunk');
        assert.ok(Number.isFinite(r.score), 'Score must be finite');
        assert.ok(['dense', 'bm25', 'both'].includes(r.retriever), 'retriever must be valid');
      }

      // gamma matches both channels (embedding at 40 + hybridKeyword content)
      const gammaResult = results.find((r) => r.chunk.id === 'h-gamma');
      assert.ok(gammaResult, 'h-gamma must be in results');
      assert.equal(gammaResult?.retriever, 'both', 'gamma must have retriever=both');
    });

    // BC5: dual-channel candidate ranks above single-channel candidate
    test('BC5: dual-channel candidate ranks above single-channel with same RRF weights', () => {
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          topK: 10,
        }),
      );

      const gammaIdx = results.findIndex((r) => r.chunk.id === 'h-gamma');
      const alphaIdx = results.findIndex((r) => r.chunk.id === 'h-alpha');

      assert.ok(gammaIdx !== -1, 'gamma must be in results');
      assert.ok(alphaIdx !== -1, 'alpha must be in results (above-floor dense)');
      // gamma has both channels (higher RRF sum) so it should rank >= alpha (dense-only)
      assert.ok(
        gammaIdx <= alphaIdx,
        `dual-channel gamma (idx ${gammaIdx}) must rank at or above dense-only alpha (idx ${alphaIdx})`,
      );
    });

    // BC6: dense-only candidate below floor is dropped
    test('BC6: dense-only candidate with score below denseScoreFloor is dropped', () => {
      // delta is at dim 45, query at dim 40 → orthogonal → distance=1 → score=0 < 0.2
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          topK: 10,
          denseScoreFloor: 0.5, // Higher floor to guarantee delta drops
        }),
      );

      const deltaResult = results.find((r) => r.chunk.id === 'h-delta');
      assert.ok(!deltaResult, 'h-delta (orthogonal, dense-only) must be dropped below floor');
    });

    // BC7: source dedup — at most one result per source (best chunk wins)
    test('BC7: source dedup returns at most one result per source', () => {
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          topK: 10,
        }),
      );

      const sources = results.map((r) => r.chunk.source);
      const uniqueSources = new Set(sources);
      assert.equal(sources.length, uniqueSources.size, 'Each source must appear at most once');

      // source-alpha.md has two chunks (alpha + epsilon) — only one should surface
      const alphaCount = sources.filter((s) => s === 'source-alpha.md').length;
      assert.ok(alphaCount <= 1, `source-alpha.md must appear at most once, got ${alphaCount}`);
    });

    // BC8: deterministic order for tied candidates
    test('BC8: repeated searchHybrid calls produce identical ordering', () => {
      const queryEmbed = makeEmbedding(40);
      const opts = makeHybridOpts({ query: 'hybridKeyword', embedding: queryEmbed, topK: 10 });

      const first = hybridStore.searchHybrid(opts);
      const second = hybridStore.searchHybrid(opts);

      assert.equal(first.length, second.length, 'Result count must be stable');
      for (let i = 0; i < first.length; i++) {
        assert.equal(first[i].chunk.id, second[i].chunk.id, `Position ${i} must be deterministic`);
      }
    });

    // BC9: sourceType filter applies to both channels
    test('BC9: sourceType filter restricts results to matching source type', () => {
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          sourceType: 'concept',
          topK: 10,
        }),
      );

      assert.ok(results.length > 0, 'Filtered results must include concept sources');
      for (const r of results) {
        assert.equal(r.chunk.sourceType, 'concept', `All results must be concept type, got ${r.chunk.sourceType}`);
      }
    });

    // BC9b: sinceMtimeAt filter restricts to recent sources
    test('BC9b: sinceMtimeAt filter restricts results to sources newer than threshold', () => {
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          sinceMtimeAt: 3000,
          topK: 10,
        }),
      );

      for (const r of results) {
        assert.ok(r.chunk.fileMtimeAt >= 3000, `All results must have mtime >= 3000, got ${r.chunk.fileMtimeAt}`);
      }
    });

    // BC11: debug fields present when includeDebug=true
    test('BC11: debug fields are present on rows when includeDebug is true', () => {
      const queryEmbed = makeEmbedding(40);
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: queryEmbed,
          includeDebug: true,
          topK: 10,
        }),
      );

      assert.ok(results.length > 0, 'Expected results with debug');
      for (const r of results) {
        assert.ok(r.debug, 'debug must be present when includeDebug=true');
        assert.ok(Number.isFinite(r.debug!.recencyRank), 'recencyRank must be finite');
        assert.ok(Number.isFinite(r.debug!.recencyScore), 'recencyScore must be finite');
        assert.ok(Number.isFinite(r.debug!.totalScore), 'totalScore must be finite');
      }
    });

    // BC11b: debug fields absent when includeDebug is false/undefined
    test('BC11b: debug fields are absent when includeDebug is not set', () => {
      const results = hybridStore.searchHybrid(makeHybridOpts({ query: 'hybridKeyword' }));
      for (const r of results) {
        assert.equal(r.debug, undefined, 'debug must be absent when includeDebug is not set');
      }
    });

    // Empty channel: both dense and BM25 empty → []
    test('empty channels: both channels return empty — searchHybrid returns []', () => {
      // Query with no matching BM25 terms and embedding pointing to unmapped dimension
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'the and or', // stopwords → empty FTS
          embedding: undefined,
        }),
      );
      assert.deepEqual(results, []);
    });

    // Score range: normalized scores must be in [0, 1]
    test('normalized scores are bounded in [0, 1]', () => {
      const results = hybridStore.searchHybrid(
        makeHybridOpts({
          query: 'hybridKeyword',
          embedding: makeEmbedding(40),
          topK: 10,
        }),
      );

      for (const r of results) {
        assert.ok(r.score >= 0 && r.score <= 1, `Score out of range [0,1]: ${r.score}`);
      }
    });
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

      const results = largeStore.searchHybrid({
        query: 'large dimension vector',
        topK: 5,
        fetchLimit: 20,
        denseScoreFloor: 0,
        recencyWeight: RECENCY_WEIGHT,
        rrfK: RRF_K,
      });
      assert.ok(results.some((r) => r.chunk.id === 'new-dimension-row'));
    } finally {
      largeStore.close();
      fs.rmSync(dimensionDir, { recursive: true, force: true });
    }
  });
});
