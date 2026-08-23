import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, before, after, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChildRunResult, SecurityCase } from '@types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, '../../scripts/security-privacy.js');
const PROJECT_DIR = path.resolve(__dirname, '../..');

// skip entire suite if entry script missing
const entryExists = fs.existsSync(ENTRY);

let tmpDir: string;
let symlinkPath: string;

describe('security-privacy equivalence', { skip: !entryExists }, () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-eq-'));
    symlinkPath = path.join(tmpDir, 'passwd-link');
    try {
      fs.symlinkSync('/etc/passwd', symlinkPath);
    } catch {
      /* skip on systems without /etc/passwd */
    }
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  function run(payload: unknown): ChildRunResult {
    const result = spawnSync(process.execPath, [ENTRY], {
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
      encoding: 'utf8',
    });
    const errorCode = result.error && 'code' in result.error ? result.error.code : undefined;
    const exitCode =
      result.status ??
      (typeof errorCode === 'string' || typeof errorCode === 'number' ? errorCode : undefined);
    return { exitCode, stderr: result.stderr ?? '' };
  }

  const EQUAL_CASES: SecurityCase[] = [
    {
      name: 'read safe file',
      payload: { tool_name: 'Read', tool_input: { file_path: 'src/foo.ts' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'npm test',
      payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'ls -la',
      payload: { tool_name: 'Bash', tool_input: { command: 'ls -la' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'git status',
      payload: { tool_name: 'Bash', tool_input: { command: 'git status' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'read /etc/passwd',
      payload: { tool_name: 'Read', tool_input: { file_path: '/etc/passwd' } },
      expect: { exitCode: 2 },
    },
    {
      name: 'shell traversal via reader verb is blocked',
      payload: { tool_name: 'Bash', tool_input: { command: 'cat ../../../etc/passwd' } },
      expect: { exitCode: 2 },
    },
    {
      name: 'rg /etc/passwd src passes',
      payload: { tool_name: 'Bash', tool_input: { command: 'rg /etc/passwd src' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'unknown shell with path-looking argument passes',
      payload: { tool_name: 'Bash', tool_input: { command: 'python scripts/generate.py' } },
      expect: { exitCode: 0 },
    },
    {
      name: 'prompt path mention passes',
      payload: { prompt: 'Use @.env as an example in docs.' },
      expect: { exitCode: 0 },
    },
    {
      name: 'malformed json is blocked (fail closed)',
      payload: null,
      expect: { exitCode: 2 },
      raw: 'not-json',
    },
  ];

  const IMPROVE_CASES: SecurityCase[] = [];

  for (const tc of EQUAL_CASES) {
    test(`equal: ${tc.name}`, () => {
      const input = tc.raw ?? JSON.stringify(tc.payload);
      const result = spawnSync(process.execPath, [ENTRY], {
        input,
        env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
        encoding: 'utf8',
      });
      const exitCode = result.status ?? (result.error ? 1 : 0);
      assert.equal(
        exitCode,
        tc.expect.exitCode,
        `Expected exitCode ${tc.expect.exitCode} for "${tc.name}", got ${exitCode}\nstderr: ${result.stderr}`
      );
    });
  }

  for (const tc of IMPROVE_CASES) {
    test(`improve: ${tc.name} — new entry must block`, () => {
      const result = run(tc.payload);
      assert.equal(
        result.exitCode,
        tc.expect.exitCode,
        `Expected exitCode ${tc.expect.exitCode} for "${tc.name}", got ${result.exitCode}\nstderr: ${result.stderr}`
      );
    });
  }
});
