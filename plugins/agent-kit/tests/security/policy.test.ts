import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('policy', () => {
  let tmpDir: string;
  let origEnv: NodeJS.ProcessEnv;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-pol-'));
    origEnv = { ...process.env };
  });

  after(() => {
    Object.assign(process.env, origEnv);
    // remove extra keys
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test('loadPolicy returns frozen object', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    assert.ok(Object.isFrozen(policy), 'policy must be frozen');
  });

  test('caseInsensitive matches platform', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    const expected = ['darwin', 'win32'].includes(process.platform);
    assert.equal(policy.caseInsensitive, expected);
  });

  test('forbiddenFiles are lowercased', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    for (const f of policy.forbiddenFiles) {
      assert.equal(f, f.toLowerCase(), `forbiddenFile '${f}' must be lowercase`);
    }
  });

  test('forbiddenDirs are lowercased', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    for (const d of policy.forbiddenDirs) {
      assert.equal(d, d.toLowerCase(), `forbiddenDir '${d}' must be lowercase`);
    }
  });

  test('knownEnvVars only contains known names', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    const allowed = new Set([
      'HOME',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
      'USER',
      'LOGNAME',
      'TMPDIR',
      'TMP',
      'TEMP',
    ]);
    for (const k of Object.keys(policy.knownEnvVars)) {
      assert.ok(allowed.has(k), `Unexpected key in knownEnvVars: ${k}`);
    }
  });

  test('knownEnvVars includes HOME if set', async () => {
    process.env.HOME = os.homedir();
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    if (process.env.HOME) {
      assert.equal(policy.knownEnvVars['HOME'], process.env.HOME);
    }
  });

  test('mutation throws in strict mode', async () => {
    const { loadPolicy } = await import(`../../scripts/security/policy.js?t=${Date.now()}`);
    const policy = loadPolicy();
    assert.throws(() => {
      'use strict';
      policy.enforcementMode = 'audit';
    });
  });

  test('PATH_ARG_KEYS lists structured filesystem path fields', async () => {
    const { PATH_ARG_KEYS } = await import(`../../scripts/security/adapters.js?t=${Date.now()}`);
    assert.ok(PATH_ARG_KEYS instanceof Set);
    assert.ok(PATH_ARG_KEYS.has('file_path'));
    assert.ok(PATH_ARG_KEYS.has('path'));
    assert.ok(PATH_ARG_KEYS.has('notebook_path'));
    assert.equal(PATH_ARG_KEYS.has('command'), false);
  });
});
