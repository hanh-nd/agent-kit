import * as assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../__tests__/temp-dir.js';
import { runMemoryCli } from '../../cli/memory.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

describe('memory CLI', () => {
  test('digest-pending --hook returns 0 when settings are missing', async () => {
    const workspace = tempDirs.makeTempDir('digest-pending-');
    const code = await runMemoryCli(['digest-pending', '--hook'], {
      ...process.env,
      WORKSPACE_DIR: workspace,
    });
    assert.equal(code, 0);
  });

  test('unknown command returns 1', async () => {
    const code = await runMemoryCli(['unknown'], process.env);
    assert.equal(code, 1);
  });
});
