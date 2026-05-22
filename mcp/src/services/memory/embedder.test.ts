import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { DEFAULT_MODEL_CACHE_DIR, FASTEMBED_CACHE_DIR } from './embedder.js';
import { AGENT_KIT_HOME, CREDENTIALS_FILE } from '../../utils/paths.js';

describe('Embedder cache paths', () => {
  test('uses global Agent Kit home for user-level files', () => {
    assert.equal(AGENT_KIT_HOME, path.join(os.homedir(), '.agent-kit'));
    assert.equal(CREDENTIALS_FILE, path.join(AGENT_KIT_HOME, 'credentials'));
    assert.equal(DEFAULT_MODEL_CACHE_DIR, path.join(AGENT_KIT_HOME, 'cache', 'models'));
    assert.equal(FASTEMBED_CACHE_DIR, path.join(DEFAULT_MODEL_CACHE_DIR, 'fastembed'));
  });
});
