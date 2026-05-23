import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { handleSaveHandoff } from './core.js';

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function resultText(result: ReturnType<typeof handleSaveHandoff>): string {
  return result.content[0].text;
}

describe('handleSaveHandoff', () => {
  test('C1: README.md + DETAIL.md written under folder; returns folder path without .md', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff(
      { type: 'brainstorm', slug: 'auth', files: { 'README.md': '# Readme', 'DETAIL.md': '# Detail' } },
      workspace,
    );
    const text = resultText(result);
    assert.ok(text.startsWith('✅ Saved to:'), `expected success, got: ${text}`);
    assert.ok(!text.endsWith('.md'), 'folder path must not end with .md');
    const folderPath = text.replace('✅ Saved to: ', '');
    assert.ok(fs.existsSync(path.join(folderPath, 'README.md')), 'README.md must exist');
    assert.ok(fs.existsSync(path.join(folderPath, 'DETAIL.md')), 'DETAIL.md must exist');
    assert.equal(fs.readFileSync(path.join(folderPath, 'README.md'), 'utf8'), '# Readme');
    assert.equal(fs.readFileSync(path.join(folderPath, 'DETAIL.md'), 'utf8'), '# Detail');
  });

  test('C2: single README.md written under folder; returns folder path', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff(
      { type: 'ticket', slug: 'my-ticket', files: { 'README.md': '# Ticket content' } },
      workspace,
    );
    const text = resultText(result);
    assert.ok(text.startsWith('✅ Saved to:'), `expected success, got: ${text}`);
    const folderPath = text.replace('✅ Saved to: ', '');
    assert.ok(!text.endsWith('.md'), 'folder path must not end with .md');
    assert.ok(fs.existsSync(path.join(folderPath, 'README.md')), 'README.md must exist');
    assert.equal(fs.readFileSync(path.join(folderPath, 'README.md'), 'utf8'), '# Ticket content');
  });

  test('C3: empty files returns error containing "files cannot be empty"', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff({ type: 'plan', slug: 'x', files: {} }, workspace);
    assert.match(resultText(result), /files cannot be empty/);
  });

  test('C4: path-traversal filename returns error containing "Unsafe handoff filename"', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff({ type: 'plan', slug: 'x', files: { '../escape.md': 'bad' } }, workspace);
    assert.match(resultText(result), /Unsafe handoff filename/);
  });

  test('C5: filename without .md extension returns error containing "Unsafe handoff filename"', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff({ type: 'plan', slug: 'x', files: { README: 'bad' } }, workspace);
    assert.match(resultText(result), /Unsafe handoff filename/);
  });

  test('C6: slug derived from README.md content ticket-ID when slug is empty', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff(
      { type: 'brainstorm', slug: '', files: { 'README.md': '# Fix PROJ-789\n\nDetails.' } },
      workspace,
    );
    const text = resultText(result);
    assert.ok(text.includes('proj-789'), `expected proj-789 in path, got: ${text}`);
  });

  test('C7: second call with same slug overwrites files without error (idempotent)', () => {
    const workspace = makeTempWorkspace();
    const args = { type: 'plan' as const, slug: 'idem', files: { 'README.md': 'v1' } };
    const r1 = handleSaveHandoff(args, workspace);
    assert.ok(resultText(r1).startsWith('✅'), `first call failed: ${resultText(r1)}`);

    const argsV2 = { type: 'plan' as const, slug: 'idem', files: { 'README.md': 'v2' } };
    const r2 = handleSaveHandoff(argsV2, workspace);
    assert.ok(resultText(r2).startsWith('✅'), `second call failed: ${resultText(r2)}`);

    const folderPath = resultText(r2).replace('✅ Saved to: ', '');
    assert.equal(fs.readFileSync(path.join(folderPath, 'README.md'), 'utf8'), 'v2');
  });

  test('C8: code handoff writes REPORT.md and DECISIONS.md without README.md', () => {
    const workspace = makeTempWorkspace();
    const result = handleSaveHandoff(
      {
        type: 'code',
        slug: 'execution-decision-ledger',
        files: {
          'REPORT.md': '# Code Execution Report',
          'DECISIONS.md': '# Execution Decision Records',
        },
      },
      workspace,
    );
    const text = resultText(result);
    assert.ok(text.startsWith('✅ Saved to:'), `expected success, got: ${text}`);
    const folderPath = text.replace('✅ Saved to: ', '');
    assert.equal(folderPath, path.join(workspace, '.agent-kit', 'handoffs', 'execution-decision-ledger', 'code'));
    assert.ok(fs.existsSync(path.join(folderPath, 'REPORT.md')), 'REPORT.md must exist');
    assert.ok(fs.existsSync(path.join(folderPath, 'DECISIONS.md')), 'DECISIONS.md must exist');
    assert.equal(fs.existsSync(path.join(folderPath, 'README.md')), false);
    assert.equal(fs.readFileSync(path.join(folderPath, 'REPORT.md'), 'utf8'), '# Code Execution Report');
    assert.equal(fs.readFileSync(path.join(folderPath, 'DECISIONS.md'), 'utf8'), '# Execution Decision Records');
  });
});
