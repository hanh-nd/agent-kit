import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.test.js';
import { DEFAULT_DIGEST_MODEL_ID } from './constants.js';
import { defaultProvisionalDigestDir, writeProvisionalDigestFile, readConversationDigestInput } from './files.js';
import { digestConversationFile } from './processor.js';
import { MemoryIndexer } from '../memory/indexer.js';
import { MemoryStore } from '../memory/store.js';
import { EmbeddingModelName, type MemoryConfig } from '../memory/types.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

class StubEmbedder {
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(384).fill(0.05));
  }
  initialize(): Promise<void> {
    return Promise.resolve();
  }
}

function makeConfig(workspace: string): MemoryConfig {
  return {
    enabled: true,
    wikiDir: path.join(workspace, '.agent-kit', 'wiki'),
    topK: 5,
    chunkSize: 1500,
    overlapLines: 2,
    embeddingModel: EmbeddingModelName.BASE,
    vectorDimension: 384,
  };
}

describe('digestConversationFile', () => {
  test('returns existing content-hash named provisional digest without loading model', async () => {
    const workspace = tempDirs.makeTempDir('digest-processor-');
    const inputPath = path.join(workspace, '.agent-kit', 'wiki', 'archive', 'conversations', 'conv.md');
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, '**User:** remember this decision', 'utf8');

    const input = readConversationDigestInput(workspace, inputPath);
    const outDir = defaultProvisionalDigestDir(workspace);
    const markdownPath = writeProvisionalDigestFile(outDir, input, '# Conversation Digest: conv\n');

    const result = await digestConversationFile({
      workspaceRoot: workspace,
      inputPath,
      modelId: DEFAULT_DIGEST_MODEL_ID,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.markdown, markdownPath);
    assert.equal(result.contentHash, input.contentHash);
    assert.match(path.basename(result.markdown), /^[a-f0-9]{16}-conv\.md$/);
  });

  test('indexes existing provisional digest with searchable store vector data', async () => {
    const workspace = tempDirs.makeTempDir('digest-processor-index-');
    const inputPath = path.join(workspace, '.agent-kit', 'wiki', 'archive', 'conversations', 'conv.md');
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, '**User:** remember vector indexing\n\n**Assistant:** done', 'utf8');

    const input = readConversationDigestInput(workspace, inputPath);
    const outDir = defaultProvisionalDigestDir(workspace);
    const markdownPath = writeProvisionalDigestFile(
      outDir,
      input,
      '# Conversation Digest: conv\nindexed digest content\n',
    );
    const config = makeConfig(workspace);
    const dbPath = path.join(config.wikiDir, 'index.db');
    const store = new MemoryStore(dbPath, config);
    const indexer = new MemoryIndexer(store, new StubEmbedder(), config);

    try {
      const result = await digestConversationFile({
        workspaceRoot: workspace,
        inputPath,
        modelId: DEFAULT_DIGEST_MODEL_ID,
        indexer,
      });

      assert.equal(result.indexed, true);
      assert.equal(result.markdown, markdownPath);

      const denseResults = store.searchDense(new Float32Array(384).fill(0.05), 5);
      const indexedSource = path.relative(config.wikiDir, markdownPath);
      const indexedChunks = store.getChunksByIds(denseResults.map((denseResult) => denseResult.id));
      assert.ok(
        indexedChunks.some((chunk) => chunk.source === indexedSource),
        `Expected dense search to return a chunk for ${indexedSource}`,
      );
    } finally {
      store.close();
    }
  });
});
