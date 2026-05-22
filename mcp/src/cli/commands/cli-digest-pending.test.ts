import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.js';
import { runMemoryCli } from './memory.js';
import { writeConversationDigestSettings } from '../../services/digest/files.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

function writeInitState(workspace: string): void {
  writeConversationDigestSettings(workspace, {
    enabled: true,
    initialized: true,
    modelId: 'qwen2.5-1.5b-instruct-q4',
    initializedAt: new Date().toISOString(),
  });
}

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const stdoutChunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  };

  try {
    const code = await fn();
    return { code, output: stdoutChunks.join('') };
  } finally {
    process.stdout.write = origWrite;
  }
}

async function withWorkspace<T>(workspace: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.WORKSPACE_DIR;
  process.env.WORKSPACE_DIR = workspace;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.WORKSPACE_DIR;
    } else {
      process.env.WORKSPACE_DIR = previous;
    }
  }
}

describe('cmdDigestPending CLI', () => {
  test('digest-pending returns 0 and emits one JSON line matching DigestPendingResult', async () => {
    const workspace = tempDirs.makeTempDir('cli-pending-c23-');
    const { code, output } = await withWorkspace(workspace, () =>
      captureStdout(() =>
        runMemoryCli(['digest-pending'], {
          ...process.env,
          WORKSPACE_DIR: workspace,
        } as NodeJS.ProcessEnv),
      ),
    );

    assert.equal(code, 0);
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    assert.ok('ok' in parsed, 'result must have ok field');
    assert.ok('action' in parsed, 'result must have action field');
  });

  test('--background returns launcher JSON without waiting for worker when no pending', async () => {
    const workspace = tempDirs.makeTempDir('cli-pending-bg-');
    writeInitState(workspace);
    const { code, output } = await withWorkspace(workspace, () =>
      captureStdout(() =>
        runMemoryCli(['digest-pending', '--background'], {
          ...process.env,
          WORKSPACE_DIR: workspace,
        } as NodeJS.ProcessEnv),
      ),
    );

    assert.equal(code, 0);
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    assert.equal(parsed.mode, 'background-launcher');
    assert.equal(parsed.spawned, false);
    assert.equal((parsed.status as Record<string, unknown>).state, 'no-pending');
  });

  test('--background worker flag returns final worker status JSON', async () => {
    const workspace = tempDirs.makeTempDir('cli-pending-worker-');
    writeInitState(workspace);
    const { code, output } = await withWorkspace(workspace, () =>
      captureStdout(() =>
        runMemoryCli(['digest-pending', '--background', '--__agent-kit-digest-worker'], {
          ...process.env,
          WORKSPACE_DIR: workspace,
        } as NodeJS.ProcessEnv),
      ),
    );

    assert.equal(code, 0);
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    assert.equal(parsed.state, 'no-pending');
    assert.equal(
      fs.existsSync(path.join(workspace, '.agent-kit', 'wiki', 'digest', 'digest-worker.status.json')),
      true,
    );
  });

  test('--background emits failed launcher JSON quickly when spawn preflight cannot find entrypoint', async () => {
    const workspace = tempDirs.makeTempDir('cli-pending-bg-fast-');
    writeInitState(workspace);
    const rawDir = path.join(workspace, '.agent-kit', 'wiki', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'conv_2026-01-01T00-00-00-001Z.md'), '**User:** hello\n', 'utf8');
    const previousArgv = process.argv[1];
    process.argv[1] = '';

    try {
      const { code, output } = await withWorkspace(workspace, () =>
        captureStdout(() =>
          runMemoryCli(['digest-pending', '--background'], {
            ...process.env,
            WORKSPACE_DIR: workspace,
          } as NodeJS.ProcessEnv),
        ),
      );

      assert.equal(code, 0);
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      assert.equal(parsed.mode, 'background-launcher');
      assert.equal(parsed.spawned, false);
      assert.equal((parsed.status as Record<string, unknown>).state, 'failed');
    } finally {
      process.argv[1] = previousArgv;
    }
  });
});
