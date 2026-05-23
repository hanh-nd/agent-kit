import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.test.js';
import { writeConversationDigestSettings } from './files.js';
import { launchDigestPendingWorker, runDigestPendingWorker } from './background.js';
import { DIGEST_WORKER_LOG_REL_PATH, DIGEST_WORKER_STATUS_REL_PATH } from './constants.js';
import { DigestModelId, type DigestWorkerStatus } from './types.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

function digestWorkerLogPath(workspace: string): string {
  return path.join(workspace, DIGEST_WORKER_LOG_REL_PATH);
}

function digestWorkerStatusPath(workspace: string): string {
  return path.join(workspace, DIGEST_WORKER_STATUS_REL_PATH);
}

function readDigestWorkerStatus(workspace: string): DigestWorkerStatus | undefined {
  try {
    const p = digestWorkerStatusPath(workspace);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeDigestWorkerStatus(workspace: string, status: DigestWorkerStatus): void {
  const p = digestWorkerStatusPath(workspace);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(status), 'utf8');
}

function writeInitState(workspace: string): void {
  writeConversationDigestSettings(workspace, {
    enabled: true,
    initialized: true,
    modelId: DigestModelId.BASE,
    initializedAt: new Date().toISOString(),
  });
}

function writeConvFile(workspace: string): void {
  const rawDir = path.join(workspace, '.agent-kit', 'wiki', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'conv_2026-01-01T00-00-00-001Z.md'), '**User:** hello\n', 'utf8');
}

function status(overrides: Partial<DigestWorkerStatus> = {}): DigestWorkerStatus {
  const now = new Date().toISOString();
  return {
    state: 'running',
    pid: process.pid,
    startedAt: now,
    updatedAt: now,
    pendingAtStart: 1,
    processed: 0,
    skipped: 0,
    errors: 0,
    ...overrides,
  };
}

describe('digest background helpers', () => {
  test('uses .agent-kit/wiki/digest paths for worker files', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-paths-');

    assert.equal(
      digestWorkerStatusPath(workspace),
      path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.status.json'),
    );
    assert.equal(
      digestWorkerLogPath(workspace),
      path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.log'),
    );
  });

  test('writes valid status atomically and tolerates invalid status reads', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-status-');
    const written = status({ state: 'complete', pid: null, processed: 1 });

    writeDigestWorkerStatus(workspace, written);
    assert.deepEqual(readDigestWorkerStatus(workspace), written);

    fs.writeFileSync(digestWorkerStatusPath(workspace), '{bad json', 'utf8');
    assert.equal(readDigestWorkerStatus(workspace), undefined);
  });
});

describe('launchDigestPendingWorker', () => {
  test('writes not-initialized and does not spawn before digest init', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-not-init-');
    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: 'cli.js',
    });

    assert.equal(result.ok, true);
    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'not-initialized');
    assert.equal(readDigestWorkerStatus(workspace)?.state, 'not-initialized');
  });

  test('writes no-pending and does not spawn when initialized with no candidates', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-no-pending-');
    writeInitState(workspace);
    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: 'cli.js',
    });

    assert.equal(result.ok, true);
    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'no-pending');
  });

  test('writes locked when an existing running worker pid is live', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-locked-status-');
    writeDigestWorkerStatus(workspace, status());

    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: 'cli.js',
    });

    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'locked');
  });

  test('marks stale running status before continuing to no-pending preflight', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-stale-status-');
    writeInitState(workspace);
    writeDigestWorkerStatus(workspace, status({ pid: 999999999 }));

    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: 'cli.js',
    });

    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'no-pending');
  });

  test('tolerates corrupt stale lock files and continues preflight', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-stale-lock-');
    writeInitState(workspace);
    const lockDir = path.join(workspace, '.agent-kit', 'wiki', 'digest');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'digest-worker.lock'), 'not-json', 'utf8');

    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: 'cli.js',
    });

    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'no-pending');
  });

  test('writes failed status when pending work exists but entrypoint is unavailable', () => {
    const workspace = tempDirs.makeTempDir('digest-bg-spawn-failed-');
    writeInitState(workspace);
    writeConvFile(workspace);

    const result = launchDigestPendingWorker({
      workspaceRoot: workspace,
      args: ['--background'],
      entrypoint: undefined,
    });

    assert.equal(result.ok, false);
    assert.equal(result.spawned, false);
    assert.equal(result.status.state, 'failed');
    assert.equal(result.status.pendingAtStart, 1);
  });
});

describe('runDigestPendingWorker', () => {
  test('writes final no-pending status for initialized workspace without candidates', async () => {
    const workspace = tempDirs.makeTempDir('digest-bg-worker-no-pending-');
    writeInitState(workspace);

    const result = await runDigestPendingWorker({ workspaceRoot: workspace, pendingAtStart: 0 });

    assert.equal(result.state, 'no-pending');
    assert.equal(readDigestWorkerStatus(workspace)?.state, 'no-pending');
    assert.match(fs.readFileSync(digestWorkerLogPath(workspace), 'utf8'), /worker finished/);
  });

  test('writes failed final status for run-level processor failure', async () => {
    const workspace = tempDirs.makeTempDir('digest-bg-worker-failed-');
    writeInitState(workspace);
    const wikiDir = path.join(workspace, '.agent-kit', 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'raw'), 'not-a-directory', 'utf8');

    const result = await runDigestPendingWorker({ workspaceRoot: workspace, pendingAtStart: 1 });

    assert.equal(result.state, 'failed');
    assert.equal(result.errors, 1);
    assert.ok(result.lastError);
  });

  test('updates status file in real-time as conversations are digested', async () => {
    const workspace = tempDirs.makeTempDir('digest-bg-worker-realtime-');
    writeInitState(workspace);

    const rawDir = path.join(workspace, '.agent-kit', 'wiki', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'conv_1.md'), '**User:** one\n', 'utf8');
    fs.writeFileSync(path.join(rawDir, 'conv_2.md'), '**User:** two\n', 'utf8');

    const statusesSeen: (DigestWorkerStatus | undefined)[] = [];

    const mockDigestFn = async () => {
      statusesSeen.push(readDigestWorkerStatus(workspace));
      return {
        markdown: 'out.md',
        status: 'provisional' as const,
        contentHash: 'hash',
        skipped: false,
        indexed: false,
      };
    };

    const result = await runDigestPendingWorker({
      workspaceRoot: workspace,
      pendingAtStart: 2,
      digestFn: mockDigestFn,
    });

    assert.equal(statusesSeen.length, 2);
    assert.ok(statusesSeen[0]);
    assert.equal(statusesSeen[0]!.state, 'running');
    assert.equal(statusesSeen[0]!.processed, 0);

    assert.ok(statusesSeen[1]);
    assert.equal(statusesSeen[1]!.state, 'running');
    assert.equal(statusesSeen[1]!.processed, 1);

    assert.equal(result.state, 'complete');
    assert.equal(result.processed, 2);
  });
});
