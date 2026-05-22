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
    const handoffPath = path.join(projectDir, '.agent-kit', 'handoffs', 'auth-flow', 'plan.md');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, '# Plan\n\nFix auth.\n', 'utf8');

    const result = runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffPath}` }],
      tool_input: { type: 'plan', slug: 'auth-flow', content: '# Plan\n\nFix auth.\n' },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '{}');

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /## \[.+\] handoff \| plan-auth-flow/);
    assert.match(inbox, /^- type: plan$/m);
    assert.match(inbox, /^- slug: auth-flow$/m);
    assert.match(inbox, /^- path: \.agent-kit\/handoffs\/auth-flow\/plan\.md$/m);
    assert.match(inbox, /^- summary: Fix auth\.$/m);
  });

  test('does not write inbox when save failed (C2)', () => {
    const projectDir = makeTempDir();

    const result = runHook(projectDir, {
      tool_response: [{ type: 'text', text: 'Error saving handoff: disk full' }],
      tool_input: { type: 'plan', slug: 'auth-flow', content: 'Fix auth.' },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(inboxPath(projectDir)), 'inbox.md must not be created on failed save');
  });

  test('skips heading lines for summary (C3)', () => {
    const projectDir = makeTempDir();
    const handoffPath = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan.md');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, '', 'utf8');

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffPath}` }],
      tool_input: { type: 'plan', slug: 'feat', content: '# Title\n## sub\n\nReal first line.\n' },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: Real first line\.$/m);
  });

  test('truncates summary at 120 chars with ellipsis (C4)', () => {
    const projectDir = makeTempDir();
    const handoffPath = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan.md');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, '', 'utf8');

    const longLine = 'A'.repeat(200);
    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffPath}` }],
      tool_input: { type: 'plan', slug: 'feat', content: longLine },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    const summaryMatch = inbox.match(/^- summary: (.+)$/m);
    assert.ok(summaryMatch, 'summary line must exist');
    assert.ok(summaryMatch[1].length <= 121, `summary must be ≤ 121 chars, got ${summaryMatch[1].length}`);
    assert.ok(summaryMatch[1].endsWith('…'), 'truncated summary must end with …');
  });

  test('both entries land intact under concurrent saves (C5)', async () => {
    const projectDir = makeTempDir();

    function makeHandoff(slug: string): string {
      const p = path.join(projectDir, '.agent-kit', 'handoffs', slug, 'plan.md');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '', 'utf8');
      return p;
    }

    const pathA = makeHandoff('feat-a');
    const pathB = makeHandoff('feat-b');

    await Promise.all([
      new Promise<void>((resolve) => {
        runHook(projectDir, {
          tool_response: [{ type: 'text', text: `✅ Saved to: ${pathA}` }],
          tool_input: { type: 'plan', slug: 'feat-a', content: 'Summary A.' },
        });
        resolve();
      }),
      new Promise<void>((resolve) => {
        runHook(projectDir, {
          tool_response: [{ type: 'text', text: `✅ Saved to: ${pathB}` }],
          tool_input: { type: 'plan', slug: 'feat-b', content: 'Summary B.' },
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

  test('slug and type come from saved path, not tool_input (C11)', () => {
    const projectDir = makeTempDir();
    // Simulates slug sanitization: tool_input.slug="PROJ-123 Auth" but path uses "proj-123"
    const handoffPath = path.join(projectDir, '.agent-kit', 'handoffs', 'proj-123', 'plan.md');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, '', 'utf8');

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffPath}` }],
      tool_input: { type: 'plan', slug: 'PROJ-123 Auth', content: 'Fix ticket.' },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- slug: proj-123$/m);
    assert.match(inbox, /^- type: plan$/m);
  });

  test('uses "(no summary)" when content has only headings (C12)', () => {
    const projectDir = makeTempDir();
    const handoffPath = path.join(projectDir, '.agent-kit', 'handoffs', 'feat', 'plan.md');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, '', 'utf8');

    runHook(projectDir, {
      tool_response: [{ type: 'text', text: `✅ Saved to: ${handoffPath}` }],
      tool_input: { type: 'plan', slug: 'feat', content: '# heading\n\n\n' },
    });

    const inbox = fs.readFileSync(inboxPath(projectDir), 'utf8');
    assert.match(inbox, /^- summary: \(no summary\)$/m);
  });
});
