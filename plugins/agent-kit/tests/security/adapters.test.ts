import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import { describe, test } from 'node:test';
import { normalizeHookPayload } from '../../scripts/security/adapters.js';
import type { SecurityPolicy } from '@types';

const policy: SecurityPolicy = {
  enforcementMode: 'block',
  projectDir: process.cwd(),
  homeDir: os.homedir(),
  caseInsensitive: ['darwin', 'win32'].includes(process.platform),
  forbiddenFiles: ['.env'],
  forbiddenRegexes: [/^id_rsa/i],
  forbiddenDirs: ['.ssh', '.git'],
  allowedOutsidePaths: [],
  allowOutside: false,
  systemBinPaths: [],
  knownEnvVars: { HOME: os.homedir() },
};

describe('normalizeHookPayload', () => {
  test('normalizes tool_name and tool_input.file_path', () => {
    const operations = normalizeHookPayload(
      { tool_name: 'Read', tool_input: { file_path: 'src/app.ts' } },
      policy
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].targetType, 'filesystem');
    assert.equal(operations[0].path, 'src/app.ts');
    assert.equal(operations[0].provider, 'claude');
    assert.equal(operations[0].action, 'read');
  });

  test('normalizes tool and args.path', () => {
    const operations = normalizeHookPayload(
      { tool: 'read_file', args: { path: 'README.md' } },
      policy
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].path, 'README.md');
    assert.equal(operations[0].provider, 'gemini');
    assert.equal(operations[0].action, 'read');
  });

  test('normalizes action and args.notebook_path', () => {
    const operations = normalizeHookPayload(
      { action: 'NotebookEdit', args: { notebook_path: 'notebook.ipynb' } },
      policy
    );
    assert.equal(operations.length, 1);
    assert.equal(operations[0].path, 'notebook.ipynb');
    assert.equal(operations[0].action, 'edit');
  });

  test('infers filesystem operations from exec command text', () => {
    const operations = normalizeHookPayload(
      { call: { method: 'shell', params: { command: 'cat ~/.ssh/id_rsa' } } },
      policy
    );
    assert.ok(operations.length >= 1);
    const target = operations.find((op) => op.targetType === 'filesystem');
    assert.ok(target, 'expected a filesystem operation derived from the command');
    assert.equal(target.action, 'read');
    assert.match(target.path as string, /id_rsa$/);
    assert.equal(target.provider, 'codex');
  });

  test('infers actions from documented Claude tool names', () => {
    const cases = [
      { tool_name: 'Read', expected: 'read' },
      { tool_name: 'Write', expected: 'write' },
      { tool_name: 'Edit', expected: 'edit' },
      { tool_name: 'MultiEdit', expected: 'edit' },
      { tool_name: 'NotebookEdit', expected: 'edit' },
    ] as const;

    for (const testCase of cases) {
      const operations = normalizeHookPayload(
        { tool_name: testCase.tool_name, tool_input: { file_path: 'src/app.ts' } },
        policy
      );
      assert.equal(operations[0].provider, 'claude');
      assert.equal(operations[0].action, testCase.expected);
    }
  });

  test('infers actions from documented Gemini tool names', () => {
    const cases = [
      { tool: 'read_file', expected: 'read' },
      { tool: 'read_many_files', expected: 'read' },
      { tool: 'list_directory', expected: 'read' },
      { tool: 'write_file', expected: 'write' },
      { tool: 'replace', expected: 'edit' },
    ] as const;

    for (const testCase of cases) {
      const operations = normalizeHookPayload(
        { tool: testCase.tool, args: { path: 'src/app.ts' } },
        policy
      );
      assert.equal(operations[0].provider, 'gemini');
      assert.equal(operations[0].action, testCase.expected);
    }
  });

  test('infers actions from current Codex hook tool names', () => {
    const cases = [
      { call: { method: 'apply_patch', params: { path: 'src/app.ts' } }, expected: 'edit' },
      { call: { method: 'view_image', params: { path: 'screenshot.png' } }, expected: 'read' },
      { call: { method: 'list_dir', params: { path: 'src' } }, expected: 'read' },
    ] as const;

    for (const testCase of cases) {
      const operations = normalizeHookPayload(testCase, policy);
      assert.equal(operations[0].provider, 'codex');
      assert.equal(operations[0].action, testCase.expected);
    }
  });

  test('ignores unsupported text fields', () => {
    const operations = normalizeHookPayload(
      {
        tool_name: 'Write',
        tool_input: {
          content: 'mentions .env',
          body: 'mentions /etc/passwd',
          old_string: '.env',
          new_string: '/etc/passwd',
          prompt: '@.env',
        },
      },
      policy
    );
    assert.deepEqual(operations, []);
  });
});
