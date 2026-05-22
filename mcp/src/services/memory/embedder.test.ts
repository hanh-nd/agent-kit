import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { CREDENTIALS_FILE, MODEL_CACHE_DIR, FASTEMBED_CACHE_DIR } from '../../utils/paths.js';

describe('Embedder cache paths', () => {
  test('uses global Agent Kit home for user-level files', () => {
    const home = path.join(os.homedir(), '.agent-kit');
    assert.equal(CREDENTIALS_FILE, path.join(home, 'credentials'));
    assert.equal(MODEL_CACHE_DIR, path.join(home, 'cache', 'models'));
    assert.equal(FASTEMBED_CACHE_DIR, path.join(MODEL_CACHE_DIR, 'fastembed'));
  });
});
