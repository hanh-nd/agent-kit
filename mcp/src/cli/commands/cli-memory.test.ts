import * as assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.test.js';
import { runMemoryCli } from './memory.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

describe('memory CLI', () => {
  test('digest-pending returns 0 when settings are missing', async () => {
    const workspace = tempDirs.makeTempDir('digest-pending-');
    const previous = process.env.WORKSPACE_DIR;
    process.env.WORKSPACE_DIR = workspace;
    try {
      const code = await runMemoryCli(['digest-pending'], {
        ...process.env,
        WORKSPACE_DIR: workspace,
      });
      assert.equal(code, 0);
    } finally {
      if (previous === undefined) {
        delete process.env.WORKSPACE_DIR;
      } else {
        process.env.WORKSPACE_DIR = previous;
      }
    }
  });

  test('unknown command returns 1', async () => {
    const code = await runMemoryCli(['unknown'], process.env);
    assert.equal(code, 1);
  });
});
