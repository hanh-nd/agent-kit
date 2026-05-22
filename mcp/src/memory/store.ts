import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { eng, removeStopwords } from 'stopword';
import type { MemoryChunk, MemoryConfig } from './types.js';

export class StoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StoreError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class MemoryStore {
  private db: Database.Database;
  private _vecAvailable = false;

  constructor(
    dbPath: string,
    private readonly config: MemoryConfig,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = this.openDatabase(dbPath);
  }

  private openDatabase(dbPath: string): Database.Database {
    try {
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      this.loadVecExtension(db);
      this.createSchema(db);
      return db;
    } catch (err) {
      console.error('[memory-store] DB open failed, recreating:', err);
      try {
        fs.unlinkSync(dbPath);
      } catch {
        // ignore
      }
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      this.loadVecExtension(db);
      this.createSchema(db);
      return db;
    }
  }

  private loadVecExtension(db: Database.Database): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void };
      sqliteVec.load(db);
      this._vecAvailable = true;
    } catch (err) {
      console.warn('[memory-store] sqlite-vec unavailable, degrading to FTS5-only:', err);
      this._vecAvailable = false;
    }
  }

  private createSchema(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_chunks (
        rowid         INTEGER PRIMARY KEY AUTOINCREMENT,
        id            TEXT NOT NULL UNIQUE,
        source        TEXT NOT NULL,
        heading       TEXT NOT NULL DEFAULT '',
        heading_level INTEGER NOT NULL DEFAULT 0,
        content       TEXT NOT NULL,
        line_start    INTEGER NOT NULL,
        line_end      INTEGER NOT NULL,
        indexed_at    INTEGER NOT NULL
      );

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
    `);

    if (this._vecAvailable) {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
            embedding FLOAT[${this.config.vectorDimension}]
          );
        `);
      } catch (err) {
        console.warn('[memory-store] Failed to create memory_vec, disabling vector search:', err);
        this._vecAvailable = false;
      }
    }
  }

  upsert(chunks: MemoryChunk[], embeddings: Float32Array[]): void {
    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO memory_chunks
        (id, source, heading, heading_level, content, line_start, line_end, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertVec: Database.Statement | null = null;
    if (this._vecAvailable) {
      insertVec = this.db.prepare(`INSERT OR REPLACE INTO memory_vec (rowid, embedding) VALUES (?, ?)`);
    }

    const upsertAll = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          // Delete existing row first to get correct rowid
          this.db.prepare(`DELETE FROM memory_chunks WHERE id = ?`).run(chunk.id);

          const info = insertChunk.run(
            chunk.id,
            chunk.source,
            chunk.heading,
            chunk.headingLevel,
            chunk.content,
            chunk.lineStart,
            chunk.lineEnd,
            Date.now(),
          );

          if (insertVec && embeddings[i] && info.lastInsertRowid) {
            const rowid = Number(info.lastInsertRowid);
            const emb = embeddings[i];
            const buf = Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
            insertVec.run(rowid, buf);
          }
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

  deleteBySource(source: string): void {
    const rows = this.db.prepare(`SELECT rowid FROM memory_chunks WHERE source = ?`).all(source) as Array<{
      rowid: number;
    }>;

    const deleteAll = this.db.transaction(() => {
      if (this._vecAvailable && rows.length > 0) {
        const placeholders = rows.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM memory_vec WHERE rowid IN (${placeholders})`).run(...rows.map((r) => r.rowid));
      }
      this.db.prepare(`DELETE FROM memory_chunks WHERE source = ?`).run(source);
    });

    deleteAll();
  }

  deleteByIds(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(`SELECT rowid FROM memory_chunks WHERE id IN (${placeholders})`).all(...ids) as Array<{
      rowid: number;
    }>;

    const deleteAll = this.db.transaction(() => {
      if (this._vecAvailable && rows.length > 0) {
        const rPlaceholders = rows.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM memory_vec WHERE rowid IN (${rPlaceholders})`).run(...rows.map((r) => r.rowid));
      }
      this.db.prepare(`DELETE FROM memory_chunks WHERE id IN (${placeholders})`).run(...ids);
    });

    deleteAll();
  }

  searchDense(embedding: Float32Array, limit: number): Array<{ id: string; score: number }> {
    if (!this._vecAvailable) return [];

    try {
      const buf = Buffer.from(embedding.buffer);
      const rows = this.db
        .prepare(
          `SELECT mc.id, mv.distance
           FROM memory_vec mv
           JOIN memory_chunks mc ON mc.rowid = mv.rowid
           WHERE mv.embedding MATCH ? AND k = ?
           ORDER BY mv.distance`,
        )
        .all(buf, limit) as Array<{ id: string; distance: number }>;

      return rows.map((r) => ({
        id: r.id,
        score: Math.max(0, 1 - r.distance),
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
        `SELECT id, source, heading, heading_level, content, line_start, line_end
         FROM memory_chunks WHERE id IN (${placeholders})`,
      )
      .all(...ids) as Array<{
      id: string;
      source: string;
      heading: string;
      heading_level: number;
      content: string;
      line_start: number;
      line_end: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      heading: r.heading,
      headingLevel: r.heading_level,
      content: r.content,
      lineStart: r.line_start,
      lineEnd: r.line_end,
    }));
  }

  get vecAvailable(): boolean {
    return this._vecAvailable;
  }

  close(): void {
    this.db.close();
  }
}
