import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { MemoryIndexer } from './indexer.js';
import type { MemoryStore } from './store.js';
import { EmbeddingModelName, type MemoryChunk, type MemoryConfig, type SearchResult } from './types.js';
import { resolveMemoryConfig } from '../../core/config/index.js';
import { registerMemoryTools } from '../../mcp/memory.js';

// Minimal McpServer stub that captures tool registrations
function makeMockServer() {
  const tools = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    tool(name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
      tools.set(name, handler);
    },
  };
  return { server, tools };
}

function makeChunk(overrides: Partial<MemoryChunk> = {}): MemoryChunk {
  return {
    id: 'test-id-abc123',
    source: '2024-01-01.md',
    heading: 'My Section',
    headingLevel: 2,
    content: 'This is the chunk content.',
    lineStart: 1,
    lineEnd: 5,
    ...overrides,
  };
}

const BASE_CONFIG: MemoryConfig = {
  enabled: true,
  wikiDir: '/tmp/wiki',
  topK: 5,
  chunkSize: 1500,
  overlapLines: 2,
  embeddingModel: EmbeddingModelName.SMALL,
  vectorDimension: 384,
};

function makeIndexerStub(
  overrides: Partial<{ search: MemoryIndexer['search']; save: MemoryIndexer['save'] }> = {},
): MemoryIndexer {
  return {
    search: overrides.search ?? (async () => []),
    save: overrides.save ?? (async () => ({ indexed: 1, deleted: 0, skipped: 0 })),
  } as unknown as MemoryIndexer;
}

function makeStoreStub(vecAvailable: boolean): MemoryStore {
  return { vecAvailable } as unknown as MemoryStore;
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
      indexer,
      store,
      config: BASE_CONFIG,
    });

    await tools.get('kit_memory_search')!({ query: 'test', top_k: 3 });
    assert.equal(capturedTopK, 3);
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
      indexer,
      store,
      config: BASE_CONFIG,
    });

    const result = await tools.get('kit_memory_search')!({ query: 'test' });
    const text = extractText(result);
    assert.ok(text.includes('kit_memory_search failed'), `Expected error prefix, got: ${text}`);
    assert.ok(text.includes('search exploded'), `Expected error message, got: ${text}`);
  });
});

describe('kit_memory_save', () => {
  test('returns saved:true and queued-for-compile status on success', async () => {
    const indexer = makeIndexerStub({
      save: async () => ({ indexed: 0, deleted: 0, skipped: 0 }),
    });
    const store = makeStoreStub(true);
    const { server, tools } = makeMockServer();
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
    registerMemoryTools(server as never, { memory: { enabled: true } }, '/tmp', {
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
});
