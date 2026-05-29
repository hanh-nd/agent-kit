import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { FORBIDDEN_FILES } from '../../scripts/security/constants.js';
import { isBlockedFilename, isInForbiddenDir } from '../../scripts/security/utils.js';

const mockPolicy = {
  forbiddenFiles: ['.env', 'credentials', 'id_rsa'],
  forbiddenRegexes: [
    /^\.env$/i,
    /^\.env[^a-z]/i,
    /^id_rsa/i,
    /^id_ed25519/i,
    /\.pem$/i,
    /credentials\.json$/i,
  ],
  forbiddenDirs: ['.git', '.ssh', '.aws', '.kube', '.gnupg', '.docker'],
};

describe('isBlockedFilename', () => {
  test('blocks exact forbidden filename', () => {
    assert.ok(isBlockedFilename('.env', mockPolicy));
    assert.ok(isBlockedFilename('credentials', mockPolicy));
  });

  test('blocks case-insensitive exact match', () => {
    assert.ok(isBlockedFilename('.ENV', mockPolicy));
    assert.ok(isBlockedFilename('CREDENTIALS', mockPolicy));
  });

  test('blocks by regex pattern', () => {
    assert.ok(isBlockedFilename('id_rsa', mockPolicy));
    assert.ok(isBlockedFilename('id_ed25519', mockPolicy));
    assert.ok(isBlockedFilename('server.pem', mockPolicy));
    assert.ok(isBlockedFilename('credentials.json', mockPolicy));
  });

  test('allows safe filenames', () => {
    assert.ok(!isBlockedFilename('index.ts', mockPolicy));
    assert.ok(!isBlockedFilename('README.md', mockPolicy));
    assert.ok(!isBlockedFilename('package.json', mockPolicy));
    assert.ok(!isBlockedFilename('config.mjs', mockPolicy));
  });

  test('config.mjs is not forbidden by default but can be added by policy', () => {
    assert.ok(!FORBIDDEN_FILES.includes('config.mjs'));
    assert.ok(isBlockedFilename('config.mjs', { ...mockPolicy, forbiddenFiles: ['config.mjs'] }));
  });

  test('blocks .env.local via regex', () => {
    assert.ok(isBlockedFilename('.env.local', mockPolicy));
  });
});

describe('isInForbiddenDir', () => {
  test('returns matching segment for simple path', () => {
    assert.equal(isInForbiddenDir('/home/user/.ssh/id_rsa', mockPolicy), '.ssh');
    assert.equal(isInForbiddenDir('/home/user/.aws/credentials', mockPolicy), '.aws');
  });

  test('returns null for safe path', () => {
    assert.equal(isInForbiddenDir('/home/user/projects/foo.ts', mockPolicy), null);
  });

  test('handles multi-segment path with forbidden dir in middle', () => {
    assert.equal(isInForbiddenDir('/foo/.ssh/bar', mockPolicy), '.ssh');
  });

  test('handles Windows-style paths', () => {
    assert.equal(isInForbiddenDir('C:\\foo\\.git\\bar', mockPolicy), '.git');
  });

  test('case-insensitive check against lowercased policy dirs', () => {
    assert.equal(isInForbiddenDir('/foo/.SSH/key', mockPolicy), '.SSH');
  });

  test('returns first matching forbidden segment', () => {
    const result = isInForbiddenDir('/foo/.ssh/.aws/file', mockPolicy);
    assert.ok(result === '.ssh' || result === '.aws');
  });
});
