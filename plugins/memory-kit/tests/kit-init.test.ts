import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, test, beforeEach } from 'node:test';

const tempDirs: string[] = [];

let originalHome: string | undefined;
let originalUserProfile: string | undefined;

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-kit-init-'));
  tempDirs.push(tempDir);
  return tempDir;
}

beforeEach(() => {
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  const mockHome = makeTempDir();
  process.env.HOME = mockHome;
  process.env.USERPROFILE = mockHome;
});

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

describe('kit-init', () => {
  test('enables memory and creates wiki dirs without legacy daily memory files', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: projectDir,
      },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).systemMessage, '[memory-kit] Memory ready');

    const settingsPath = path.join(process.env.HOME!, '.agent-kit', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      memory?: { enabled?: boolean };
    };

    assert.equal(settings.memory?.enabled, true);
    assert.ok(fs.existsSync(path.join(projectDir, '.agent-kit', 'wiki', 'raw')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agent-kit', 'wiki', 'compiled')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agent-kit', 'wiki', 'archive', 'conversations')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.agent-kit', 'memory')));
  });

  test('emits baseline systemMessage with no nudge when inbox is absent (C6)', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).systemMessage, '[memory-kit] Memory ready');
  });

  test('no nudge when inbox has exactly 3 unique slugs (C7 — boundary)', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');
    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'inbox.md'), '- slug: alpha\n- slug: beta\n- slug: gamma\n', 'utf8');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).systemMessage, '[memory-kit] Memory ready');
  });

  test('nudge fires when inbox has 4 unique slugs (C8)', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');
    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawDir, 'inbox.md'),
      '- slug: alpha\n- slug: beta\n- slug: gamma\n- slug: delta\n',
      'utf8',
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const msg = JSON.parse(result.stdout).systemMessage as string;
    assert.ok(msg.startsWith('[memory-kit] Memory ready\n[memory-kit] 4 uncompiled handoffs ('));
    assert.ok(msg.includes('alpha'));
    assert.ok(msg.includes('beta'));
    assert.ok(msg.includes('gamma'));
    assert.ok(msg.includes('delta'));
    assert.ok(msg.endsWith('Run /wiki compile to index them.'));
  });

  test('duplicate slugs counted once — no nudge for 5 lines with 2 unique slugs', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');
    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawDir, 'inbox.md'),
      '- slug: alpha\n- slug: alpha\n- slug: beta\n- slug: beta\n- slug: beta\n',
      'utf8',
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).systemMessage, '[memory-kit] Memory ready');
  });

  test('falls back to baseline systemMessage when inbox is unreadable (C9)', () => {
    const projectDir = makeTempDir();
    const scriptPath = path.resolve('dist/scripts/kit-init.js');
    // Place a file at the wiki/raw path so readFileSync on inbox.md fails (parent is a file)
    const agentKitDir = path.join(projectDir, '.agent-kit', 'wiki');
    fs.mkdirSync(agentKitDir, { recursive: true });
    fs.writeFileSync(path.join(agentKitDir, 'raw'), 'not-a-dir', 'utf8');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
      input: '{}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).systemMessage, '[memory-kit] Memory ready');
  });
});
