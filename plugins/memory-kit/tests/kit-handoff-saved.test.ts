import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-kit-handoff-saved-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function runHook(projectDir: string, stdin: unknown) {
  return spawnSync(process.execPath, [path.resolve('dist/scripts/kit-handoff-saved.js')], {
    cwd: path.resolve('.'),
    env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
    input: JSON.stringify(stdin),
    encoding: 'utf8',
  });
}

function inboxPath(projectDir: string): string {
  return path.join(projectDir, '.agent-kit', 'wiki', 'raw', 'inbox.md');
}

describe('kit-handoff-saved', () => {
  test('appends a well-formed entry on successful save (C1)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'auth-flow', 'plan');
    fs.mkdirSync(handoffFolder, { recursive: true });

    const result = runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'plan', slug: 'auth-flow', files: { 'index.md': '# Plan\n\nFix auth.\n' } },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '{}');

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /## \[.+\] handoff \| plan-auth-flow/);
    assert.match(inbox, /^- type: plan$/m);
    assert.match(inbox, /^- slug: auth-flow$/m);
    assert.match(inbox, /^- path: \.agent-kit\/handoffs\/auth-flow\/plan$/m);
    assert.match(inbox, /^- summary: Fix auth\.$/m);
  });

  test('does not write inbox when save failed (C2)', () => {
    const projectDir = makeTempDir();

    const result = runHook(projectDir, {
      tool_response: [{ type: 'text', text: 'Error saving handoff: disk full' }],
      tool_input: { type: 'plan', slug: 'auth-flow', files: { 'index.md': 'Fix auth.' } },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(inboxPath(projectDir)), 'inbox.md must not be created on failed save');
  });

  test('skips heading lines for summary (C3)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'plan', slug: 'feat', files: { 'index.md': '# Title\n## sub\n\nReal first line.\n' } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: Real first line\.$/m);
  });

  test('truncates summary at 120 chars with ellipsis (C4)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan');
    fs.mkdirSync(handoffFolder, { recursive: true });

    const longLine = 'A'.repeat(200);
    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'plan', slug: 'feat', files: { 'index.md': longLine } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    const summaryMatch = inbox.match(/^- summary: (.+)$/m);
    assert.ok(summaryMatch, 'summary line must exist');
    assert.ok(summaryMatch[1].length <= 121, `summary must be ≤ 121 chars, got ${summaryMatch[1].length}`);
    assert.ok(summaryMatch[1].endsWith('…'), 'truncated summary must end with …');
  });

  test('both entries land intact under concurrent saves (C5)', async () => {
    const projectDir = makeTempDir();

    function makeHandoffFolder(slug: string): string {
      const p = path.join(projectDir, '.agent-kit', 'handoffs', slug, 'plan');
      fs.mkdirSync(p, { recursive: true });
      return p;
    }

    const folderA = makeHandoffFolder('feat-a');
    const folderB = makeHandoffFolder('feat-b');

    await Promise.all([
      new Promise<void>((resolve) => {
        runHook(projectDir, {
          tool_response: [{ type: 'text', text: `✅ Saved to: ${folderA}` }],
          tool_input: { type: 'plan', slug: 'feat-a', files: { 'index.md': 'Summary A.' } },
        });
        resolve();
      }),
      new Promise<void>((resolve) => {
        runHook(projectDir, {
          tool_response: [{ type: 'text', text: `✅ Saved to: ${folderB}` }],
          tool_input: { type: 'plan', slug: 'feat-b', files: { 'index.md': 'Summary B.' } },
        });
        resolve();
      }),
    ]);

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    const headers = inbox.match(/^## \[/gm);
    assert.equal(headers?.length, 2, 'both entries must be present');
    assert.match(inbox, /plan-feat-a/);
    assert.match(inbox, /plan-feat-b/);
  });

  test('exits 0 without creating inbox on malformed stdin (F7)', () => {
    const projectDir = makeTempDir();

    const result = spawnSync(process.execPath, [path.resolve('dist/scripts/kit-handoff-saved.js')], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: 'not json',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(inboxPath(projectDir)));
  });

  test('slug and type come from saved folder path, not tool_input (C11)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'proj-123', 'plan');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'plan', slug: 'PROJ-123 Auth', files: { 'index.md': 'Fix ticket.' } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- slug: proj-123$/m);
    assert.match(inbox, /^- type: plan$/m);
  });

  test('uses "(no summary)" when files have only headings (C12)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'plan', slug: 'feat', files: { 'index.md': '# heading\n\n\n' } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: \(no summary\)$/m);
  });

  test('uses README.md as summary source when present (C13)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'brainstorm');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: {
        type: 'brainstorm',
        slug: 'feat',
        files: { 'DETAIL.md': 'Technical detail.', 'README.md': 'Decision log.' },
      },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: Decision log\.$/m);
  });

  test('falls back to first file when README.md absent (C14)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'research');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'research', slug: 'feat', files: { 'index.md': 'Research summary.' } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: Research summary\.$/m);
  });

  test('uses "(no summary)" when README.md has only headings (C15)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'brainstorm');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: {
        type: 'brainstorm',
        slug: 'feat',
        files: { 'README.md': '# Heading only\n## Sub\n' },
      },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: \(no summary\)$/m);
  });

  test('derives type and slug from folder path without .md stripping (C16)', () => {
    const projectDir = makeTempDir();
    const handoffFolder = path.join(projectDir, '.agent-kit', 'handoffs', 'my-feature', 'brainstorm');
    fs.mkdirSync(handoffFolder, { recursive: true });

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffFolder}` }],
      tool_input: { type: 'brainstorm', slug: 'my-feature', files: { 'README.md': 'Summary text.' } },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- type: brainstorm$/m);
    assert.match(inbox, /^- slug: my-feature$/m);
    assert.match(inbox, /^- path: \.agent-kit\/handoffs\/my-feature\/brainstorm$/m);
  });
});
