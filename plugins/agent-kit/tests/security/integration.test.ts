import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChildRunResult } from '@types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, '../../scripts/security-privacy.js');
const PROJECT_DIR = path.resolve(__dirname, '../..');

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-int-'));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function run(payload: unknown, env: NodeJS.ProcessEnv = {}): ChildRunResult {
  const result = spawnSync(process.execPath, [ENTRY], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR, ...env },
    encoding: 'utf8',
  });
  return { exitCode: result.status ?? 0, stderr: result.stderr ?? '' };
}

function runRaw(input: string, env: NodeJS.ProcessEnv = {}): ChildRunResult {
  const result = spawnSync(process.execPath, [ENTRY], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR, ...env },
    encoding: 'utf8',
  });
  return { exitCode: result.status ?? 0, stderr: result.stderr ?? '' };
}

describe('AC1: symlink to external target is blocked', () => {
  test('symlink inside workspace pointing to /etc/passwd is blocked', () => {
    if (!fs.existsSync('/etc/passwd')) return;
    const linkPath = path.join(tmpDir, 'symlink-to-etc-passwd');
    try {
      fs.symlinkSync('/etc/passwd', linkPath);
    } catch {
      /* exists or no perms */
    }
    if (!fs.existsSync(linkPath)) return; // can't create symlink, skip
    const result = run({ tool_name: 'Read', tool_input: { file_path: linkPath } });
    assert.equal(
      result.exitCode,
      2,
      `Expected blocked (exit 2), got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('reader-verb shell operands are path-checked', () => {
  test('cat ~/.ssh/id_rsa is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'cat ~/.ssh/id_rsa' } });
    assert.equal(
      result.exitCode,
      2,
      `Expected blocked (exit 2), got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('$HOME form is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'cat $HOME/.ssh/id_rsa' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });

  test('${HOME} form is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'cat ${HOME}/.ssh/id_rsa' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });

  test('separator-less reader operand .env is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'cat .env' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });

  test('source ~/.zshrc is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'source ~/.zshrc' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });

  test('redirect target > .env is blocked with write semantics', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'echo leak > .env' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });
});

describe('AC4: /etc/passwd is blocked', () => {
  test('Read /etc/passwd is blocked', () => {
    const result = run({ tool_name: 'Read', tool_input: { file_path: '/etc/passwd' } });
    assert.equal(
      result.exitCode,
      2,
      `Expected blocked, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('AC5: path traversal ../../../etc/passwd is blocked', () => {
  test('Bash cat ../../../etc/passwd is blocked', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'cat ../../../etc/passwd' } });
    assert.equal(result.exitCode, 2, `Expected blocked, got ${result.exitCode}`);
  });
});

describe('interpreter invocations stay opaque but are audited', () => {
  test('node -e fs.readFileSync .env passes (audit-only residual risk)', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: {
        command: "node -e \"const fs=require('fs'); console.log(fs.readFileSync('.env', 'utf8'))\"",
      },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('search command text is opaque', () => {
  test('grep .env passes through the hook', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'grep "STOP_HOOK" .env' },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('command expressions that look like paths are not treated as files', () => {
  test('sed expression starting with slash passes for ordinary target', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'sed "/^STOP_HOOK=/d" src/app.ts' },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('grep pattern starting with slash passes for ordinary target', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'grep "/etc/passwd" src/app.ts' },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('AC6: legitimate commands pass', () => {
  test('Read src/foo.ts passes', () => {
    const result = run({ tool_name: 'Read', tool_input: { file_path: 'src/foo.ts' } });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('npm test passes', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'npm test' } });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('ls -la passes', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'ls -la' } });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('git status passes', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('write content mentioning sensitive paths passes', () => {
    const result = run({
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/fixture.ts',
        content: 'const sample = ".env and /etc/passwd are test strings";',
      },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('edit text mentioning sensitive paths passes', () => {
    const result = run({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/fixture.ts',
        old_string: '.env',
        new_string: '/etc/passwd',
      },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('prompt text with @.env passes', () => {
    const result = run({ prompt: 'Please update the docs to mention @.env examples.' });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('rg /etc/passwd src passes', () => {
    const result = run({ tool_name: 'Bash', tool_input: { command: 'rg /etc/passwd src' } });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('grep ordinary workspace file passes', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'grep "function" src/app.ts' },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('node -e reading ordinary workspace file passes', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: {
        command: "node -e \"require('fs').readFileSync('src/app.ts', 'utf8')\"",
      },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });

  test('node -e writing ordinary workspace file passes', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: {
        command: "node -e \"require('fs').writeFileSync('src/generated.txt', 'ok')\"",
      },
    });
    assert.equal(
      result.exitCode,
      0,
      `Expected pass, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
  });
});

describe('AC8: scripts/security-privacy.js is ≤ 50 lines', () => {
  test('entry file line count', () => {
    const content = fs.readFileSync(ENTRY, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 50, `Expected ≤ 50 lines, got ${lines}`);
  });
});

describe('malformed JSON input fails closed', () => {
  test('non-JSON stdin exits 2 in block mode', () => {
    const result = runRaw('not-json');
    assert.equal(
      result.exitCode,
      2,
      `Expected exit 2 for malformed JSON, got ${result.exitCode}\nstderr: ${result.stderr}`
    );
    assert.match(result.stderr, /malformed_payload/);
  });

  test('non-object JSON exits 2 in block mode', () => {
    const result = runRaw('"not-an-object"');
    assert.equal(result.exitCode, 2, `Expected exit 2 for non-object JSON, got ${result.exitCode}`);
  });

  test('empty stdin stays a silent no-op', () => {
    const result = runRaw('');
    assert.equal(result.exitCode, 0, `Expected exit 0 for empty stdin, got ${result.exitCode}`);
  });
});
