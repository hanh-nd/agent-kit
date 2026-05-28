import Database from 'libsql';
import * as fs from 'fs';
import * as path from 'path';
import { eng, removeStopwords } from 'stopword';
import type {
  HybridRankDebug,
  HybridSearchOptions,
  HybridSearchRow,
  MemoryChunk,
  MemoryConfig,
  RecentSource,
  SourceType,
} from './types.js';

export const SCHEMA_VERSION = 4;

interface LibsqlRunResult {
  changes?: number;
  lastInsertRowid?: number | bigint;
}

interface LibsqlStatementLike {
  run(...params: unknown[]): LibsqlRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface LibsqlDatabaseLike {
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): LibsqlStatementLike;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
}

interface LibsqlDatabaseConstructor {
  new (filename: string, options?: { readonly?: boolean }): LibsqlDatabaseLike;
}

const LibsqlDatabase = Database as LibsqlDatabaseConstructor;

export class StoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StoreError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class MemoryStore {
  private db: LibsqlDatabaseLike;

  constructor(
    dbPath: string,
    private readonly config: MemoryConfig,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = this.openDatabase(dbPath);
  }

  private openDatabase(dbPath: string): LibsqlDatabaseLike {
    try {
      const db = new LibsqlDatabase(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      this.createSchema(db);
      return db;
    } catch (err) {
      console.error('[memory-store] DB open failed, recreating:', err);
      try {
        fs.unlinkSync(dbPath);
      } catch {
        // ignore
      }
      try {
        const db = new LibsqlDatabase(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        this.createSchema(db);
        return db;
      } catch (retryErr) {
        throw new StoreError('database open failed', retryErr);
      }
    }
  }

  private createSchema(db: LibsqlDatabaseLike): void {
    try {
      const current = this.readUserVersion(db);
      const currentVectorDimension = current >= SCHEMA_VERSION ? this.readEmbeddingColumnDimension(db) : undefined;
      if (
        current < SCHEMA_VERSION ||
        (currentVectorDimension !== undefined && currentVectorDimension !== this.config.vectorDimension)
      ) {
        db.exec(`
          DROP TRIGGER IF EXISTS memory_chunks_ai;
          DROP TRIGGER IF EXISTS memory_chunks_ad;
          DROP TABLE IF EXISTS memory_fts;
          DROP TABLE IF EXISTS memory_vec;
          DROP INDEX IF EXISTS idx_memory_chunks_embedding;
          DROP TABLE IF EXISTS memory_chunks;
        `);
        db.pragma(`user_version = ${SCHEMA_VERSION}`);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_chunks (
          rowid         INTEGER PRIMARY KEY AUTOINCREMENT,
          id            TEXT NOT NULL UNIQUE,
          source        TEXT NOT NULL,
          source_type   TEXT NOT NULL DEFAULT 'wiki',
          heading       TEXT NOT NULL DEFAULT '',
          heading_level INTEGER NOT NULL DEFAULT 0,
          content       TEXT NOT NULL,
          line_start    INTEGER NOT NULL,
          line_end      INTEGER NOT NULL,
          indexed_at    INTEGER NOT NULL,
          file_mtime_at INTEGER NOT NULL DEFAULT 0,
          embedding     F32_BLOB(${this.config.vectorDimension}) NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_chunks_type_mtime
          ON memory_chunks (source_type, file_mtime_at DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          source,
          heading,
          content,
          content='memory_chunks',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS memory_chunks_ai
          AFTER INSERT ON memory_chunks BEGIN
            INSERT INTO memory_fts(rowid, source, heading, content)
              VALUES (new.rowid, new.source, new.heading, new.content);
          END;

        CREATE TRIGGER IF NOT EXISTS memory_chunks_ad
          AFTER DELETE ON memory_chunks BEGIN
            INSERT INTO memory_fts(memory_fts, rowid, source, heading, content)
              VALUES ('delete', old.rowid, old.source, old.heading, old.content);
          END;

        CREATE INDEX IF NOT EXISTS idx_memory_chunks_embedding
          ON memory_chunks (libsql_vector_idx(embedding));
      `);
    } catch (err) {
      throw new StoreError('schema migration failed', err);
    }
  }

  private readEmbeddingColumnDimension(db: LibsqlDatabaseLike): number | undefined {
    try {
      const rows = db.pragma('table_info(memory_chunks)');
      if (!Array.isArray(rows)) return undefined;

      const embeddingColumn = rows.find((row): row is { name: string; type: string } => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as { name?: unknown; type?: unknown };
        return candidate.name === 'embedding' && typeof candidate.type === 'string';
      });
      const match = /^F32_BLOB\((\d+)\)$/i.exec(embeddingColumn?.type.trim() ?? '');
      if (!match) return undefined;

      return Number.parseInt(match[1], 10);
    } catch {
      return undefined;
    }
  }

  private readUserVersion(db: LibsqlDatabaseLike): number {
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

  upsert(chunks: MemoryChunk[], embeddings: Float32Array[]): void {
    const deleteChunk = this.db.prepare(`DELETE FROM memory_chunks WHERE id = ?`);
    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO memory_chunks
        (id, source, source_type, heading, heading_level, content, line_start, line_end, indexed_at, file_mtime_at, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?))
    `);

    const upsertAll = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const vectorBinding = this.toVectorBinding(embeddings[i]);

          // Delete existing row first to get correct rowid
          deleteChunk.run(chunk.id);

          insertChunk.run(
            chunk.id,
            chunk.source,
            chunk.sourceType,
            chunk.heading,
            chunk.headingLevel,
            chunk.content,
            chunk.lineStart,
            chunk.lineEnd,
            Date.now(),
            chunk.fileMtimeAt,
            vectorBinding,
          );
        } catch (err) {
          console.warn(`[memory-store] Failed to upsert chunk ${chunk.id}:`, err);
        }
      }
    });

    try {
      upsertAll();
    } catch (err) {
      throw new StoreError('Full batch upsert failed', err);
    }
  }

  private toVectorBinding(embedding: Float32Array | undefined): Buffer {
    if (!embedding) throw new Error('missing embedding');
    if (!(embedding instanceof Float32Array)) throw new Error('missing embedding');
    if (embedding.length !== this.config.vectorDimension) throw new Error('embedding dimension mismatch');
    for (let i = 0; i < embedding.length; i++) {
      if (!Number.isFinite(embedding[i])) throw new Error('embedding contains non-finite value');
    }
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  }

  hashesBySource(source: string): Set<string> {
    const rows = this.db.prepare(`SELECT id FROM memory_chunks WHERE source = ?`).all(source) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }

  indexedSources(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT source FROM memory_chunks`).all() as Array<{
      source: string;
    }>;
    return rows.map((r) => r.source);
  }

  getRecentSources(options: { limit: number; sourceType?: SourceType }): RecentSource[] {
    const limit = Math.min(Math.max(1, options.limit || 5), 50);
    const whereClause = options.sourceType ? ' WHERE source_type = ?' : '';
    const params = options.sourceType ? [options.sourceType, limit] : [limit];

    try {
      const rows = this.db
        .prepare(
          `SELECT source, MAX(file_mtime_at) AS t FROM memory_chunks${whereClause} GROUP BY source ORDER BY t DESC LIMIT ?`,
        )
        .all(...params) as Array<{ source: string; t: number }>;

      return rows.map((row) => ({ source: row.source, fileMtimeAt: row.t }));
    } catch (err) {
      console.warn('[memory-store] Recent source lookup failed:', err);
      return [];
    }
  }

  deleteBySource(source: string): void {
    const deleteAll = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM memory_chunks WHERE source = ?`).run(source);
    });

    deleteAll();
  }

  deleteByIds(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(', ');

    const deleteAll = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM memory_chunks WHERE id IN (${placeholders})`).run(...ids);
    });

    deleteAll();
  }

  private buildFtsQuery(query: string): string {
    const tokens = query
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())
      .filter((t) => t.length > 1);

    return removeStopwords(tokens, eng)
      .map((t) => `${t.replace(/s$/, '')}*`)
      .join(' OR ');
  }

  private mapMemoryChunkRow(r: {
    id: string;
    source: string;
    source_type: SourceType;
    heading: string;
    heading_level: number;
    content: string;
    line_start: number;
    line_end: number;
    file_mtime_at: number;
  }): MemoryChunk {
    return {
      id: r.id,
      source: r.source,
      sourceType: r.source_type,
      heading: r.heading,
      headingLevel: r.heading_level,
      content: r.content,
      lineStart: r.line_start,
      lineEnd: r.line_end,
      fileMtimeAt: r.file_mtime_at,
    };
  }

  searchHybrid(options: HybridSearchOptions): HybridSearchRow[] {
    const {
      query,
      embedding,
      topK,
      fetchLimit,
      denseScoreFloor,
      recencyWeight,
      rrfK,
      sourceType,
      sinceMtimeAt,
      includeDebug,
    } = options;

    const ftsQuery = this.buildFtsQuery(query);
    const hasDense = embedding !== undefined;
    const hasBm25 = ftsQuery.length > 0;

    if (!hasDense && !hasBm25) return [];

    const hasFilters = sourceType !== undefined || sinceMtimeAt !== undefined;

    interface RawRow {
      id: string;
      source: string;
      source_type: SourceType;
      file_mtime_at: number;
      heading: string;
      heading_level: number;
      content: string;
      line_start: number;
      line_end: number;
      dense_rank: number | null;
      dense_dist: number | null;
      bm25_rank: number | null;
      recency_rank: number;
      total_score: number;
      retriever: 'dense' | 'bm25' | 'both';
    }

    try {
      const params: unknown[] = [];

      let denseCte = '';
      let denseRankedCte = '';

      if (hasDense) {
        const queryBuf = this.toVectorBinding(embedding);

        if (hasFilters) {
          // Exact filtered scan — avoids losing candidates due to ANN post-filtering
          const filterClauses: string[] = [];
          if (sourceType) {
            filterClauses.push('mc.source_type = ?');
            params.push(sourceType);
          }
          if (sinceMtimeAt !== undefined) {
            filterClauses.push('mc.file_mtime_at >= ?');
            params.push(sinceMtimeAt);
          }
          const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';
          params.push(queryBuf); // vector_distance_cos arg
          params.push(fetchLimit);

          denseCte = `dense_data AS (
            SELECT mc.id, mc.source, mc.source_type, mc.file_mtime_at,
                   mc.heading, mc.heading_level, mc.content, mc.line_start, mc.line_end,
                   vector_distance_cos(mc.embedding, vector32(?)) AS dense_dist
            FROM memory_chunks mc
            ${whereClause}
            ORDER BY dense_dist
            LIMIT ?
          )`;
        } else {
          params.push(queryBuf); // vector_distance_cos arg
          params.push(queryBuf); // vector_top_k arg
          params.push(fetchLimit);

          denseCte = `dense_data AS (
            SELECT mc.id, mc.source, mc.source_type, mc.file_mtime_at,
                   mc.heading, mc.heading_level, mc.content, mc.line_start, mc.line_end,
                   vector_distance_cos(mc.embedding, vector32(?)) AS dense_dist
            FROM vector_top_k('idx_memory_chunks_embedding', vector32(?), ?) AS vtk
            JOIN memory_chunks mc ON mc.rowid = vtk.id
          )`;
        }

        denseRankedCte = `dense_ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY dense_dist, id) AS dense_rank
          FROM dense_data
        )`;
      }

      let bm25Cte = '';
      let bm25RankedCte = '';

      if (hasBm25) {
        const bm25FilterClauses: string[] = [];
        if (sourceType) bm25FilterClauses.push('mc.source_type = ?');
        if (sinceMtimeAt !== undefined) bm25FilterClauses.push('mc.file_mtime_at >= ?');
        const bm25WhereExtra = bm25FilterClauses.length > 0 ? ` AND ${bm25FilterClauses.join(' AND ')}` : '';

        params.push(ftsQuery);
        if (sourceType) params.push(sourceType);
        if (sinceMtimeAt !== undefined) params.push(sinceMtimeAt);
        params.push(fetchLimit);

        bm25Cte = `bm25_data AS (
          SELECT mc.id, mc.source, mc.source_type, mc.file_mtime_at,
                 mc.heading, mc.heading_level, mc.content, mc.line_start, mc.line_end,
                 bm25(memory_fts, 0.2, 2.0, 5.0) AS bm25_neg
          FROM memory_fts
          JOIN memory_chunks mc ON mc.rowid = memory_fts.rowid
          WHERE memory_fts MATCH ?${bm25WhereExtra}
          LIMIT ?
        )`;

        bm25RankedCte = `bm25_ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY bm25_neg, id) AS bm25_rank
          FROM bm25_data
        )`;
      }

      let candidatesCte = '';

      if (hasDense && hasBm25) {
        candidatesCte = `all_candidates AS (
          SELECT d.id, d.source, d.source_type, d.file_mtime_at,
                 d.heading, d.heading_level, d.content, d.line_start, d.line_end,
                 CAST(d.dense_rank AS INTEGER) AS dense_rank, d.dense_dist,
                 b.bm25_rank,
                 CASE WHEN b.id IS NOT NULL THEN 'both' ELSE 'dense' END AS retriever
          FROM dense_ranked d
          LEFT JOIN bm25_ranked b ON b.id = d.id
          UNION ALL
          SELECT b.id, b.source, b.source_type, b.file_mtime_at,
                 b.heading, b.heading_level, b.content, b.line_start, b.line_end,
                 NULL AS dense_rank, NULL AS dense_dist,
                 CAST(b.bm25_rank AS INTEGER) AS bm25_rank,
                 'bm25' AS retriever
          FROM bm25_ranked b
          LEFT JOIN dense_ranked d ON d.id = b.id
          WHERE d.id IS NULL
        )`;
      } else if (hasDense) {
        candidatesCte = `all_candidates AS (
          SELECT id, source, source_type, file_mtime_at,
                 heading, heading_level, content, line_start, line_end,
                 CAST(dense_rank AS INTEGER) AS dense_rank, dense_dist,
                 NULL AS bm25_rank, 'dense' AS retriever
          FROM dense_ranked
        )`;
      } else {
        candidatesCte = `all_candidates AS (
          SELECT id, source, source_type, file_mtime_at,
                 heading, heading_level, content, line_start, line_end,
                 NULL AS dense_rank, NULL AS dense_dist,
                 CAST(bm25_rank AS INTEGER) AS bm25_rank, 'bm25' AS retriever
          FROM bm25_ranked
        )`;
      }

      // Scoring: RRF over active channels + recency, dense floor, source dedup
      params.push(rrfK, rrfK, recencyWeight, rrfK, denseScoreFloor, topK);

      const sql = `
        WITH
          ${[denseCte, denseRankedCte, bm25Cte, bm25RankedCte, candidatesCte].filter(Boolean).join(',\n')}
        ,
        recency_ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY file_mtime_at DESC, source, id) AS recency_rank
          FROM all_candidates
        ),
        scored AS (
          SELECT c.id, c.source, c.source_type, c.file_mtime_at,
                 c.heading, c.heading_level, c.content, c.line_start, c.line_end,
                 c.dense_rank, c.dense_dist, c.bm25_rank, r.recency_rank,
                 c.retriever,
                 COALESCE(1.0 / (? + c.dense_rank), 0.0) +
                 COALESCE(1.0 / (? + c.bm25_rank), 0.0) +
                 ? * (1.0 / (? + r.recency_rank)) AS total_score
          FROM all_candidates c
          JOIN recency_ranked r ON r.id = c.id
          WHERE c.retriever != 'dense' OR (1.0 - c.dense_dist) >= ?
        ),
        best_per_source AS (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY source ORDER BY total_score DESC, source, id) AS source_rank
          FROM scored
        )
        SELECT id, source, source_type, file_mtime_at, heading, heading_level, content, line_start, line_end,
               dense_rank, dense_dist, bm25_rank, recency_rank, total_score, retriever
        FROM best_per_source
        WHERE source_rank = 1
        ORDER BY total_score DESC, source, id
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(...params) as RawRow[];
      if (rows.length === 0) return [];

      const denseActive = hasDense;
      const bm25Active = hasBm25;
      const recencyActive = rows.length > 0;
      const maxScore =
        ((denseActive ? 1 : 0) + (bm25Active ? 1 : 0) + (recencyActive ? recencyWeight : 0)) / (rrfK + 1);

      return rows.map((r) => {
        const chunk = this.mapMemoryChunkRow(r);
        const normalizedScore = maxScore > 0 ? r.total_score / maxScore : 0;

        const row: HybridSearchRow = {
          chunk,
          score: normalizedScore,
          retriever: r.retriever,
        };

        if (includeDebug) {
          const denseScore = r.dense_dist !== null ? Math.max(0, Math.min(1, 1 - r.dense_dist)) : undefined;
          const bm25Score = r.bm25_rank !== null ? 1 / (rrfK + r.bm25_rank) : undefined;
          const recencyScore = recencyWeight * (1 / (rrfK + r.recency_rank));
          const debug: HybridRankDebug = {
            denseRank: r.dense_rank ?? undefined,
            denseScore,
            bm25Rank: r.bm25_rank ?? undefined,
            bm25Score,
            recencyRank: r.recency_rank,
            recencyScore,
            totalScore: r.total_score,
          };
          row.debug = debug;
        }

        return row;
      });
    } catch (err) {
      console.warn('[memory-store] Hybrid search failed:', err);
      return [];
    }
  }

  get vecAvailable(): boolean {
    return true;
  }

  close(): void {
    this.db.close();
  }
}
