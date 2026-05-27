import Database from 'libsql';
import * as fs from 'fs';
import * as path from 'path';
import { eng, removeStopwords } from 'stopword';
import type { MemoryChunk, MemoryConfig, RecentSource, SourceType } from './types.js';

export const SCHEMA_VERSION = 3;

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
      if (current < SCHEMA_VERSION) {
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
          this.db.prepare(`DELETE FROM memory_chunks WHERE id = ?`).run(chunk.id);

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

  private toVectorBinding(embedding: Float32Array | undefined): string {
    if (!embedding) throw new Error('missing embedding');
    if (!(embedding instanceof Float32Array)) throw new Error('missing embedding');
    if (embedding.length !== this.config.vectorDimension) throw new Error('embedding dimension mismatch');

    const values = Array.from(embedding, (value) => {
      if (!Number.isFinite(value)) throw new Error('embedding contains non-finite value');
      return value;
    });

    return JSON.stringify(values);
  }

  private normalizeVectorDistance(distance: number): number {
    if (distance <= 0) return 1;
    return Math.max(0, Math.min(1, 1 - distance));
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

  searchDense(embedding: Float32Array, limit: number): Array<{ id: string; score: number }> {
    try {
      const queryVector = this.toVectorBinding(embedding);
      const rows = this.db
        .prepare(
          `SELECT mc.id, vector_distance_cos(mc.embedding, vector32(?)) AS distance
           FROM vector_top_k('idx_memory_chunks_embedding', vector32(?), ?) AS vector_matches
           JOIN memory_chunks mc ON mc.rowid = vector_matches.id
           ORDER BY distance
           LIMIT ?`,
        )
        .all(queryVector, queryVector, limit, limit) as Array<{ id: string; distance: number }>;

      return rows.map((r) => ({
        id: r.id,
        score: this.normalizeVectorDistance(r.distance),
      }));
    } catch (err) {
      console.warn('[memory-store] Dense search failed:', err);
      return [];
    }
  }

  searchBm25(query: string, limit: number): Array<{ id: string; score: number }> {
    if (!query.trim()) return [];

    const tokens = query
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())
      .filter((t) => t.length > 1);

    const ftsQuery = removeStopwords(tokens, eng)
      .map((t) => `${t.replace(/s$/, '')}*`)
      .join(' OR ');
    if (!ftsQuery) return [];

    try {
      const rows = this.db
        .prepare(
          `SELECT mc.id, bm25(memory_fts, 0.2, 2.0, 5.0) AS rank
           FROM memory_fts
           JOIN memory_chunks mc ON mc.rowid = memory_fts.rowid
           WHERE memory_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as Array<{ id: string; rank: number }>;

      if (rows.length === 0) return [];

      // BM25 rank is negative in SQLite FTS5 (lower = more relevant)
      const ranks = rows.map((r) => r.rank);
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      const range = maxRank - minRank;

      return rows.map((r) => ({
        id: r.id,
        score: range > 0 ? (maxRank - r.rank) / range : 1,
      }));
    } catch (err) {
      console.warn('[memory-store] BM25 search failed:', err);
      return [];
    }
  }

  getChunksByIds(ids: string[]): MemoryChunk[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, source, source_type, heading, heading_level, content, line_start, line_end, file_mtime_at
         FROM memory_chunks WHERE id IN (${placeholders})`,
      )
      .all(...ids) as Array<{
      id: string;
      source: string;
      source_type: SourceType;
      heading: string;
      heading_level: number;
      content: string;
      line_start: number;
      line_end: number;
      file_mtime_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      sourceType: r.source_type,
      heading: r.heading,
      headingLevel: r.heading_level,
      content: r.content,
      lineStart: r.line_start,
      lineEnd: r.line_end,
      fileMtimeAt: r.file_mtime_at,
    }));
  }

  get vecAvailable(): boolean {
    return true;
  }

  close(): void {
    this.db.close();
  }
}
