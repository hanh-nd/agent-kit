import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { resolveHandoffFolder, validateHandoffFilename } from './index.js';

const WORKSPACE = '/tmp/test-workspace';

describe('resolveHandoffFolder', () => {
  test('relativePath has no .md suffix', () => {
    const result = resolveHandoffFolder({
      workspaceRoot: WORKSPACE,
      type: 'plan',
      slug: 'my-feature',
      primaryContent: '',
    });
    assert.ok(!result.relativePath.endsWith('.md'), `relativePath must not end with .md, got: ${result.relativePath}`);
    assert.equal(result.relativePath, path.join('.agent-kit', 'handoffs', 'my-feature', 'plan'));
  });

  test('folderPath is absolute under workspaceRoot', () => {
    const result = resolveHandoffFolder({
      workspaceRoot: WORKSPACE,
      type: 'brainstorm',
      slug: 'auth',
      primaryContent: '',
    });
    assert.equal(result.folderPath, path.join(WORKSPACE, '.agent-kit', 'handoffs', 'auth', 'brainstorm'));
  });

  test('ticket-ID extracted from primaryContent when slug is empty', () => {
    const result = resolveHandoffFolder({
      workspaceRoot: WORKSPACE,
      type: 'plan',
      slug: '',
      primaryContent: '# Fix PROJ-456\n\nSome content.',
    });
    assert.equal(result.featureSlug, 'proj-456');
  });

  test('first-heading fallback when no ticket ID in slug or content', () => {
    const result = resolveHandoffFolder({
      workspaceRoot: WORKSPACE,
      type: 'research',
      slug: '',
      primaryContent: '# My Feature\n\nDetail.',
    });
    assert.equal(result.featureSlug, 'my-feature');
  });

  test('"untitled-handoff" fallback when both slug and content are empty', () => {
    const result = resolveHandoffFolder({ workspaceRoot: WORKSPACE, type: 'ticket', slug: '', primaryContent: '' });
    assert.equal(result.featureSlug, 'untitled-handoff');
  });

  test('code handoff resolves under code folder', () => {
    const result = resolveHandoffFolder({
      workspaceRoot: WORKSPACE,
      type: 'code',
      slug: 'execution-decision-ledger',
      primaryContent: '# Execution Report',
    });
    assert.equal(result.canonicalType, 'code');
    assert.equal(result.relativePath, path.join('.agent-kit', 'handoffs', 'execution-decision-ledger', 'code'));
    assert.equal(
      result.folderPath,
      path.join(WORKSPACE, '.agent-kit', 'handoffs', 'execution-decision-ledger', 'code'),
    );
  });
});

describe('validateHandoffFilename', () => {
  test('"README.md" returns unchanged', () => {
    assert.equal(validateHandoffFilename('README.md'), 'README.md');
  });

  test('"DETAIL.md" returns unchanged', () => {
    assert.equal(validateHandoffFilename('DETAIL.md'), 'DETAIL.md');
  });

  test('"index.md" returns unchanged', () => {
    assert.equal(validateHandoffFilename('index.md'), 'index.md');
  });

  test('"../etc/passwd" throws', () => {
    assert.throws(() => validateHandoffFilename('../etc/passwd'), /Unsafe handoff filename/);
  });

  test('"sub/dir.md" throws', () => {
    assert.throws(() => validateHandoffFilename('sub/dir.md'), /Unsafe handoff filename/);
  });

  test('"README" throws — missing .md extension', () => {
    assert.throws(() => validateHandoffFilename('README'), /Unsafe handoff filename/);
  });

  test('empty string throws', () => {
    assert.throws(() => validateHandoffFilename(''), /Unsafe handoff filename/);
  });

  test('"README.txt" throws — wrong extension', () => {
    assert.throws(() => validateHandoffFilename('README.txt'), /Unsafe handoff filename/);
  });

  test('".hidden.md" throws — leading dot', () => {
    assert.throws(() => validateHandoffFilename('.hidden.md'), /Unsafe handoff filename/);
  });
});
