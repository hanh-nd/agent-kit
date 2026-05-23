import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.test.js';
import {
  defaultProvisionalDigestDir,
  readConversationDigestInput,
  writeConversationDigestSettings,
  writeProvisionalDigestFile,
} from './files.js';
import { DigestModelId, type ProvisionalDigestResult } from './types.js';
import { digestPendingConversations, summarizePendingConversations } from './processor.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

function writeInitState(workspace: string, modelId: string = DigestModelId.BASE): void {
  writeConversationDigestSettings(workspace, {
    enabled: true,
    initialized: true,
    modelId,
    initializedAt: new Date().toISOString(),
  });
}

function writeConvFile(workspace: string, name: string, content: string): string {
  const rawDir = path.join(workspace, '.agent-kit', 'wiki', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const filePath = path.join(rawDir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function stubDigest(
  result: Partial<ProvisionalDigestResult> = {},
): (opts: unknown) => Promise<ProvisionalDigestResult> {
  return async () => ({
    markdown: 'out.md',
    status: 'provisional' as const,
    contentHash: 'abc123',
    skipped: false,
    indexed: false,
    ...result,
  });
}

describe('digestPendingConversations', () => {
  test('C13: no init state → noop not-initialized', async () => {
    const workspace = tempDirs.makeTempDir('pending-c13-');
    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.equal(result.ok, true);
    assert.equal(result.initialized, false);
    assert.equal(result.action, 'noop');
    if (result.action === 'noop') assert.equal(result.reason, 'not-initialized');
  });

  test('C14: init state, live lockfile → noop locked', async () => {
    const workspace = tempDirs.makeTempDir('pending-c14-');
    writeInitState(workspace);
    const lockDir = path.join(workspace, '.agent-kit', 'wiki', 'digest');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'digest-worker.lock'), JSON.stringify({ pid: process.pid }));

    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.equal(result.ok, true);
    assert.equal(result.initialized, true);
    assert.equal(result.action, 'noop');
    if (result.action === 'noop') assert.equal(result.reason, 'locked');
  });

  test('C15: init state, no lockfile, no conv files → noop no-pending, lock released', async () => {
    const workspace = tempDirs.makeTempDir('pending-c15-');
    writeInitState(workspace);
    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'noop');
    if (result.action === 'noop') assert.equal(result.reason, 'no-pending');
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.lock')), false);
  });

  test('C19: wiki/raw dir does not exist → noop no-pending', async () => {
    const workspace = tempDirs.makeTempDir('pending-c19-');
    writeInitState(workspace);
    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.equal(result.action, 'noop');
    if (result.action === 'noop') assert.equal(result.reason, 'no-pending');
  });

  test('C16: one undigested conv file → digested count:1, lock released', async () => {
    const workspace = tempDirs.makeTempDir('pending-c16-');
    writeInitState(workspace);
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-001Z.md', '**User:** hello\n\n**Assistant:** hi\n');

    const result = await digestPendingConversations({
      workspaceRoot: workspace,
      digestFn: stubDigest(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'digested');
    if (result.action === 'digested') {
      assert.equal(result.count, 1);
      assert.equal(result.errors, 0);
    }
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.lock')), false);
  });

  test('C17: digestFn throws for one file → errors:1, lock released', async () => {
    const workspace = tempDirs.makeTempDir('pending-c17-');
    writeInitState(workspace);
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-001Z.md', '**User:** hello\n\n**Assistant:** hi\n');

    const throwingFn = async () => {
      throw new Error('model error');
    };
    const result = await digestPendingConversations({
      workspaceRoot: workspace,
      digestFn: throwingFn,
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'digested');
    if (result.action === 'digested') {
      assert.equal(result.errors, 1);
      assert.equal(result.count, 0);
    }
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.lock')), false);
  });

  test('C18: stale lockfile (dead PID) → reclaims lock and returns (no-pending since no conv files)', async () => {
    const workspace = tempDirs.makeTempDir('pending-c18-');
    writeInitState(workspace);
    const lockDir = path.join(workspace, '.agent-kit', 'wiki', 'digest');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'digest-worker.lock'), JSON.stringify({ pid: 999999999 }));

    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.ok(result.ok);
    if (result.action === 'noop') assert.notEqual(result.reason, 'locked');
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.lock')), false);
  });

  test('C20: 3 undigested conv files → digestFn called 3 times, count+skipped+errors=3', async () => {
    const workspace = tempDirs.makeTempDir('pending-c20-');
    writeInitState(workspace);
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-001Z.md', '**User:** a\n\n**Assistant:** b\n');
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-002Z.md', '**User:** c\n\n**Assistant:** d\n');
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-003Z.md', '**User:** e\n\n**Assistant:** f\n');

    let callCount = 0;
    const countingFn = async () => {
      callCount++;
      return {
        markdown: 'out.md',
        status: 'provisional' as const,
        contentHash: 'abc',
        skipped: false,
        indexed: false,
      };
    };

    const result = await digestPendingConversations({
      workspaceRoot: workspace,
      digestFn: countingFn,
    });
    assert.equal(callCount, 3);
    assert.equal(result.action, 'digested');
    if (result.action === 'digested') {
      assert.equal(result.count + result.skipped + result.errors, 3);
    }
  });

  test('C21: outer error (fs throws unexpected) → returns ok:false, releases lock', async () => {
    const workspace = tempDirs.makeTempDir('pending-c21-');
    writeInitState(workspace);
    // Create wiki/raw as a file (not a dir) so readdirSync throws ENOTDIR
    const wikiDir = path.join(workspace, '.agent-kit', 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'raw'), 'not-a-directory', 'utf8');

    const result = await digestPendingConversations({ workspaceRoot: workspace });
    assert.equal(result.ok, false);
    assert.equal(result.action, 'error');
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.lock')), false);
  });
});

describe('summarizePendingConversations', () => {
  test('returns not-initialized without raw discovery side effects', () => {
    const workspace = tempDirs.makeTempDir('pending-summary-init-');
    const result = summarizePendingConversations(workspace);

    assert.equal(result.initialized, false);
    assert.equal(result.pending, 0);
    assert.equal(result.reason, 'not-initialized');
  });

  test('returns no-pending when initialized workspace has no raw conversations', () => {
    const workspace = tempDirs.makeTempDir('pending-summary-empty-');
    writeInitState(workspace);
    const result = summarizePendingConversations(workspace);

    assert.equal(result.initialized, true);
    assert.equal(result.pending, 0);
    assert.equal(result.reason, 'no-pending');
  });

  test('counts only conversations without existing provisional digests', () => {
    const workspace = tempDirs.makeTempDir('pending-summary-count-');
    writeInitState(workspace);
    const first = writeConvFile(workspace, 'conv_2026-01-01T00-00-00-001Z.md', '**User:** a\n');
    writeConvFile(workspace, 'conv_2026-01-01T00-00-00-002Z.md', '**User:** b\n');
    writeProvisionalDigestFile(
      defaultProvisionalDigestDir(workspace),
      readConversationDigestInput(workspace, first),
      '# Existing\n',
    );

    const result = summarizePendingConversations(workspace);

    assert.equal(result.initialized, true);
    assert.equal(result.pending, 1);
  });
});
