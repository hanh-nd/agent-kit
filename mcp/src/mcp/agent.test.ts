import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { compact } from '../utils/utils.js';
import { agentArgs } from './agent.js';

describe('compact utility', () => {
  test('filters out null, undefined, and false values', () => {
    const input = ['a', null, 'b', undefined, false, 'c'];
    const result = compact(input);
    assert.deepEqual(result, ['a', 'b', 'c']);
  });

  test('returns empty array when all items are falsy', () => {
    assert.deepEqual(compact([null, undefined, false]), []);
  });
});

describe('agentArgs builder', () => {
  describe('gemini (Antigravity CLI)', () => {
    test('initial call without session', () => {
      const args = agentArgs('gemini', 'run tests', '/workspace');
      assert.deepEqual(args, ['--dangerously-skip-permissions', '-p', 'run tests', '--output-format', 'json']);
    });

    test('resume call with session', () => {
      const args = agentArgs('gemini', 'fix test failure', '/workspace', 'conv-123');
      assert.deepEqual(args, [
        '--dangerously-skip-permissions',
        '--conversation',
        'conv-123',
        '-p',
        'fix test failure',
        '--output-format',
        'json',
      ]);
    });
  });

  describe('claude', () => {
    test('initial call without session', () => {
      const args = agentArgs('claude', 'implement auth', '/workspace');
      assert.deepEqual(args, ['--dangerously-skip-permissions', '-p', 'implement auth', '--output-format', 'json']);
    });

    test('resume call with sessionId', () => {
      const args = agentArgs('claude', 'fix token bug', '/workspace', 'uuid-111');
      assert.deepEqual(args, [
        '--dangerously-skip-permissions',
        '--resume',
        'uuid-111',
        '-p',
        'fix token bug',
        '--output-format',
        'json',
      ]);
    });
  });

  describe('codex', () => {
    test('initial call without session', () => {
      const args = agentArgs('codex', 'check repo', '/workspace');
      assert.deepEqual(args, [
        '--ask-for-approval',
        'never',
        '--sandbox',
        'workspace-write',
        '--cd',
        '/workspace',
        'exec',
        'check repo',
      ]);
    });

    test('resume call with session', () => {
      const args = agentArgs('codex', 'fix syntax', '/workspace', 'thread-999');
      assert.deepEqual(args, [
        '--ask-for-approval',
        'never',
        '--sandbox',
        'workspace-write',
        '--cd',
        '/workspace',
        'exec',
        'resume',
        'thread-999',
        'fix syntax',
      ]);
    });
  });
});
