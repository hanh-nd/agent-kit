import * as assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../__tests__/temp-dir.js';
import { runMemoryCli } from '../../cli/memory.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

describe('cmdDigestPending CLI', () => {
  test('C22: no --hook flag → writes usage to stderr and returns 1', async () => {
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    let code: number;
    try {
      code = await runMemoryCli(['digest-pending'], process.env as NodeJS.ProcessEnv);
    } finally {
      process.stderr.write = origWrite;
    }

    assert.equal(code, 1);
    assert.ok(stderrChunks.some((s) => s.includes('Usage')));
  });

  test('C23: --hook returns 0 and emits one JSON line matching DigestPendingResult', async () => {
    const workspace = tempDirs.makeTempDir('cli-pending-c23-');
    const stdoutChunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    };

    let code: number;
    try {
      code = await runMemoryCli(['digest-pending', '--hook'], {
        ...process.env,
        WORKSPACE_DIR: workspace,
      } as NodeJS.ProcessEnv);
    } finally {
      process.stdout.write = origWrite;
    }

    assert.equal(code, 0);
    const output = stdoutChunks.join('');
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    assert.ok('ok' in parsed, 'result must have ok field');
    assert.ok('action' in parsed, 'result must have action field');
  });
});
