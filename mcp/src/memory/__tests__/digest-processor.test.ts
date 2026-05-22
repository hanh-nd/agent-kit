import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../__tests__/temp-dir.js';
import { DEFAULT_DIGEST_MODEL_ID } from '../digest/constants.js';
import { defaultProvisionalDigestDir, provisionalDigestPath, readConversationDigestInput } from '../digest/files.js';
import { digestConversationFile } from '../digest/processor.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

describe('digestConversationFile', () => {
  test('returns existing content-hash named provisional digest without loading model', async () => {
    const workspace = tempDirs.makeTempDir('digest-processor-');
    const inputPath = path.join(workspace, '.agent-kit', 'wiki', 'archive', 'conversations', 'conv.md');
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, '**User:** remember this decision', 'utf8');

    const input = readConversationDigestInput(workspace, inputPath);
    const outDir = defaultProvisionalDigestDir(workspace);
    const markdownPath = provisionalDigestPath(outDir, input);
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, '# Conversation Digest: conv\n', 'utf8');

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
});
