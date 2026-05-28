import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import type { MemoryIndexer } from './indexer.js';
import type { MemoryStore } from './store.js';
import { EmbeddingModelName, type MemoryChunk, type MemoryConfig, type SearchResult } from './types.js';
import { resolveMemoryConfig } from '../../core/config/index.js';
import { registerMemoryTools } from '../../mcp/memory.js';

// Minimal McpServer stub that captures tool registrations
function makeMockServer() {
  const tools = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const descriptions = new Map<string, string>();
  const server = {
    tool(name: string, desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
      descriptions.set(name, desc);
      tools.set(name, handler);
    },
  };
  return { server, tools, descriptions };
}

function makeChunk(overrides: Partial<MemoryChunk> = {}): MemoryChunk {
  return {
    id: 'test-id-abc123',
    source: '2024-01-01.md',
    sourceType: 'wiki',
    heading: 'My Section',
    headingLevel: 2,
    content: 'This is the chunk content.',
    lineStart: 1,
    lineEnd: 5,
    fileMtimeAt: 1000,
    ...overrides,
  };
}

const BASE_CONFIG: MemoryConfig = {
  enabled: true,
  wikiDir: '/tmp/wiki',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.BASE,
  vectorDimension: 384,
};

function makeIndexerStub(
  overrides: Partial<{
    search: MemoryIndexer['search'];
    save: MemoryIndexer['save'];
    startupIndex: MemoryIndexer['startupIndex'];
  }> = {},
): MemoryIndexer {
  return {
    search: overrides.search ?? (async () => []),
    save: overrides.save ?? (async () => ({ indexed: 1, deleted: 0, skipped: 0 })),
    startupIndex: overrides.startupIndex ?? (async () => undefined),
  } as unknown as MemoryIndexer;
}

function makeStoreStub(
  vecAvailable: boolean,
  overrides: Partial<Pick<MemoryStore, 'getRecentSources'>> = {},
): MemoryStore {
  return {
    vecAvailable,
    getRecentSources: overrides.getRecentSources ?? (() => []),
  } as unknown as MemoryStore;
}

function extractText(result: unknown): string {
  const r = result as { content: Array<{ type: string; text: string }> };
  return r.content[0]?.text ?? '';
}

describe('kit_memory_search', () => {
  test('returns formatted full content and display source when results exist', async () => {
    const chunk = makeChunk({
      content: 'Important memory content',
      source: 'compiled/entities/foo.md',
    });
    const searchResult: SearchResult = {
      chunk,
      score: 0.85,
      retriever: 'bm25',
      contentSource: 'file',
    };

    const indexer = makeIndexerStub({ search: async () => [searchResult] });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test query' });
    const text = extractText(result);

    assert.ok(text.includes('Important memory content'), 'Result must include chunk content');
    assert.ok(text.includes('### entities/foo.md (score: 0.850)'), 'Result must include display source and score');
    assert.ok(!text.includes('compiled/entities/foo.md'), 'Result must strip compiled/ prefix');
    assert.ok(!text.includes('My Section'), 'Result must not include chunk heading as the block title');
  });

  test('returns "no memories" message when results are empty', async () => {
    const indexer = makeIndexerStub({ search: async () => [] });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'nothing here' });
    const text = extractText(result);

    assert.ok(
      text.toLowerCase().includes('no memories') || text.includes('No memories'),
      `Expected "no memories" message, got: ${text.slice(0, 100)}`,
    );
  });

  test('prepends degraded warning when vecAvailable is false and no results', async () => {
    const indexer = makeIndexerStub({ search: async () => [] });
    const store = makeStoreStub(false);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);

    assert.ok(
      text.includes('Vector search unavailable') || text.includes('keyword-only'),
      `Expected degraded warning in: ${text.slice(0, 200)}`,
    );
  });

  test('prepends degraded warning when vecAvailable is false with results', async () => {
    const chunk = makeChunk({ content: 'Found content', source: 'test.md' });
    const searchResult: SearchResult = {
      chunk,
      score: 0.5,
      retriever: 'bm25',
      contentSource: 'file',
    };

    const indexer = makeIndexerStub({ search: async () => [searchResult] });
    const store = makeStoreStub(false);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);

    assert.ok(
      text.includes('Vector search unavailable') || text.includes('keyword-only'),
      `Expected degraded warning with results in: ${text.slice(0, 200)}`,
    );
    assert.ok(text.includes('Found content'), 'Result must still contain chunk content');
  });

  test('prepends source-unavailable warning for fallback results', async () => {
    const chunk = makeChunk({ content: 'Stored chunk only', source: 'compiled/entities/foo.md' });
    const searchResult: SearchResult = {
      chunk,
      score: 0.5,
      retriever: 'bm25',
      contentSource: 'fallback',
    };

    const indexer = makeIndexerStub({ search: async () => [searchResult] });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);

    assert.ok(text.includes('Source file unavailable'), `Expected fallback warning in: ${text}`);
    assert.ok(text.includes('Stored chunk only'), 'Result must include fallback chunk content');
  });

  test('uses top_k parameter when provided', async () => {
    let capturedTopK: number | undefined;
    const indexer = makeIndexerStub({
      search: async (_q, topK) => {
        capturedTopK = topK;
        return [];
      },
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    await tools.get('kit_memory_search')!({ query: 'test', top_k: 3 });
    assert.equal(capturedTopK, 3);
  });

  test('returns a warming note while subsystem warmup has not completed', async () => {
    const indexer = makeIndexerStub({ search: async () => [] });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);

    assert.ok(text.includes('Memory index is warming'), `Expected warming note, got: ${text}`);
  });

  test('returns degraded note after warmup failure while preserving search results', async () => {
    const chunk = makeChunk({ content: 'Degraded result', source: 'compiled/entities/degraded.md' });
    const indexer = makeIndexerStub({
      search: async () => [{ chunk, score: 0.7, retriever: 'bm25', contentSource: 'file' }],
      startupIndex: async () => {
        throw new Error('warmup failed');
      },
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    const subsystem = registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });
    assert.ok(subsystem);

    await subsystem.startWarmup();
    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);

    assert.ok(text.includes('Memory index is degraded'), `Expected degraded note, got: ${text}`);
    assert.ok(text.includes('warmup failed'), `Expected warmup error, got: ${text}`);
    assert.ok(text.includes('Degraded result'), 'Result must still be included during degraded state');
  });

  test('falls back to config.topK when top_k is not provided', async () => {
    let capturedTopK: number | undefined;
    const indexer = makeIndexerStub({
      search: async (_q, topK) => {
        capturedTopK = topK;
        return [];
      },
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    await tools.get('kit_memory_search')!({ query: 'test' });
    assert.equal(capturedTopK, BASE_CONFIG.topK);
  });

  test('returns error message when indexer.search throws', async () => {
    const indexer = makeIndexerStub({
      search: async () => {
        throw new Error('search exploded');
      },
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);
    assert.ok(text.includes('kit_memory_search failed'), `Expected error prefix, got: ${text}`);
    assert.ok(text.includes('search exploded'), `Expected error message, got: ${text}`);
  });

  test('returns initialization failure when store construction fails', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-init-failure-'));
    const occupiedWikiPath = path.join(tmpDir, 'wiki-file');
    fs.writeFileSync(occupiedWikiPath, 'not a directory', 'utf8');

    try {
      const { server, tools } = makeMockServer();
      const subsystem = registerMemoryTools(server as never, tmpDir, {
        settings: { memory: { enabled: true } },
        config: { ...BASE_CONFIG, wikiDir: occupiedWikiPath },
      });
      assert.ok(subsystem);

      const result = await tools.get('kit_memory_search')!({ query: 'test' });
      const text = extractText(result);
      assert.ok(text.includes('Memory initialization failed'), `Expected initialization failure, got: ${text}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('description routes factual and temporal queries distinctly', () => {
    const indexer = makeIndexerStub();
    const store = makeStoreStub(true);
    const { server, descriptions } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const description = descriptions.get('kit_memory_search') ?? '';
    assert.match(description, /factual|semantic/);
    assert.match(description, /kit_memory_recent/);
    assert.match(description, /keywords/);
    assert.match(description, /stopwords/);
  });
});

describe('kit_memory_recent', () => {
  test('returns recent sources ordered by store recency result', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-recent-digest-'));
    const wikiDir = path.join(tmpDir, 'wiki');
    const olderSource = 'compiled/provisional/conversation-digests/older.md';
    const newerSource = 'compiled/provisional/conversation-digests/newer.md';
    const entitySource = 'compiled/entities/entity.md';

    try {
      fs.mkdirSync(path.join(wikiDir, 'compiled', 'provisional', 'conversation-digests'), { recursive: true });
      fs.mkdirSync(path.join(wikiDir, 'compiled', 'entities'), { recursive: true });
      fs.writeFileSync(path.join(wikiDir, olderSource), '# Older\nolder content', 'utf8');
      fs.writeFileSync(path.join(wikiDir, newerSource), '# Newer\nnewer content', 'utf8');
      fs.writeFileSync(path.join(wikiDir, entitySource), '# Entity\nentity content', 'utf8');

      const calls: Array<Record<string, unknown>> = [];
      const store = makeStoreStub(true, {
        getRecentSources: (options) => {
          calls.push(options);
          return [
            { source: entitySource, fileMtimeAt: 300 },
            { source: newerSource, fileMtimeAt: 200 },
            { source: olderSource, fileMtimeAt: 100 },
          ];
        },
      });
      const { server, tools } = makeMockServer();
      registerMemoryTools(server as never, tmpDir, {
        settings: { memory: { enabled: true } },
        indexer: makeIndexerStub(),
        store,
        config: { ...BASE_CONFIG, wikiDir },
      });

      const result = await tools.get('kit_memory_recent')!({ n: 2 });
      const text = extractText(result);

      assert.deepEqual(calls, [{ limit: 2, sourceType: undefined }]);
      assert.ok(text.indexOf('entity.md') < text.indexOf('newer.md'));
      assert.ok(text.includes('# Entity\nentity content'));
      assert.ok(text.includes('# Newer\nnewer content'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('passes optional source type filter to recent lookup', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-recent-filter-'));
    const wikiDir = path.join(tmpDir, 'wiki');
    const digestSource = 'compiled/provisional/conversation-digests/digest.md';

    try {
      fs.mkdirSync(path.join(wikiDir, 'compiled', 'provisional', 'conversation-digests'), { recursive: true });
      fs.writeFileSync(path.join(wikiDir, digestSource), '# Digest\nfiltered content', 'utf8');

      const calls: Array<Record<string, unknown>> = [];
      const store = makeStoreStub(true, {
        getRecentSources: (options) => {
          calls.push(options);
          return [{ source: digestSource, fileMtimeAt: 100 }];
        },
      });
      const { server, tools } = makeMockServer();
      registerMemoryTools(server as never, tmpDir, {
        settings: { memory: { enabled: true } },
        indexer: makeIndexerStub(),
        store,
        config: { ...BASE_CONFIG, wikiDir },
      });

      const result = await tools.get('kit_memory_recent')!({ source_type: 'digest' });
      const text = extractText(result);

      assert.deepEqual(calls, [{ limit: 5, sourceType: 'digest' }]);
      assert.ok(text.includes('provisional/conversation-digests/digest.md'));
      assert.ok(text.includes('filtered content'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips missing files without source-unavailable warning', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-recent-missing-'));
    const wikiDir = path.join(tmpDir, 'wiki');
    const presentSource = 'compiled/entities/present.md';

    try {
      fs.mkdirSync(path.join(wikiDir, 'compiled', 'entities'), { recursive: true });
      fs.writeFileSync(path.join(wikiDir, presentSource), '# Present\navailable content', 'utf8');

      const store = makeStoreStub(true, {
        getRecentSources: () => [
          { source: 'compiled/entities/missing.md', fileMtimeAt: 200 },
          { source: presentSource, fileMtimeAt: 100 },
        ],
      });
      const { server, tools } = makeMockServer();
      registerMemoryTools(server as never, tmpDir, {
        settings: { memory: { enabled: true } },
        indexer: makeIndexerStub(),
        store,
        config: { ...BASE_CONFIG, wikiDir },
      });

      const result = await tools.get('kit_memory_recent')!({});
      const text = extractText(result);

      assert.ok(!text.includes('missing.md'));
      assert.ok(!text.includes('Source file unavailable'));
      assert.ok(text.includes('available content'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('is registered only when memory is enabled and description mentions temporal routing', () => {
    const enabledServer = makeMockServer();
    registerMemoryTools(enabledServer.server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer: makeIndexerStub(),
      store: makeStoreStub(true),
      config: BASE_CONFIG,
    });

    assert.ok(enabledServer.tools.has('kit_memory_recent'));
    assert.match(enabledServer.descriptions.get('kit_memory_recent') ?? '', /last session|recent/);

    const disabledServer = makeMockServer();
    const result = registerMemoryTools(disabledServer.server as never, '/tmp', {
      settings: { memory: { enabled: false } },
    });
    assert.equal(result, null);
    assert.equal(disabledServer.tools.has('kit_memory_recent'), false);
  });
});

describe('kit_memory_save', () => {
  test('returns saved:true and queued-for-compile status on success', async () => {
    const indexer = makeIndexerStub({
      save: async () => ({ indexed: 0, deleted: 0, skipped: 0 }),
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_save')!({ content: 'Some important note' });
    const text = extractText(result);
    const parsed = JSON.parse(text) as {
      saved: boolean;
      queued_for_compile: boolean;
      message: string;
    };

    assert.equal(parsed.saved, true);
    assert.equal(parsed.queued_for_compile, true);
    assert.equal(parsed.message, 'Saved to wiki/raw — will be indexed after next /wiki compile');
  });

  test('returns saved:false and error message when indexer.save throws', async () => {
    const indexer = makeIndexerStub({
      save: async () => {
        throw new Error('disk full');
      },
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, '/tmp', {
      settings: { memory: { enabled: true } },
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_save')!({ content: 'note' });
    const text = extractText(result);
    const parsed = JSON.parse(text) as { saved: boolean; error: string };

    assert.equal(parsed.saved, false);
    assert.ok(parsed.error.includes('disk full'), `Expected "disk full" in error, got: ${parsed.error}`);
  });
});

describe('resolveMemoryConfig', () => {
  test('defaults wikiDir under .agent-kit', () => {
    const config = resolveMemoryConfig({ memory: {} }, '/repo');

    assert.equal(config.wikiDir, '/repo/.agent-kit/wiki');
  });

  test('uses explicit wikiDir override', () => {
    const config = resolveMemoryConfig({ memory: { wikiDir: '/custom/wiki' } }, '/repo');

    assert.equal(config.wikiDir, '/custom/wiki');
  });

  test('derives vector dimension from embedding model', () => {
    const config = resolveMemoryConfig({ memory: { embeddingModel: EmbeddingModelName.LARGE } }, '/repo');

    assert.equal(config.embeddingModel, EmbeddingModelName.LARGE);
    assert.equal(config.vectorDimension, 768);
  });

  test('preserves explicit vector dimension override', () => {
    const config = resolveMemoryConfig(
      { memory: { embeddingModel: EmbeddingModelName.LARGE, vectorDimension: 1024 } },
      '/repo',
    );

    assert.equal(config.embeddingModel, EmbeddingModelName.LARGE);
    assert.equal(config.vectorDimension, 1024);
  });
});
