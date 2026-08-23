import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChildRunResult } from '@types';

/**
 * Adversarial payload corpus.
 *
 * Blocked cases must exit 2; allowed cases pin false-positive guards and must
 * exit 0. If a lens weakens, a case here fails.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, '../../scripts/security-privacy.js');
const PROJECT_DIR = path.resolve(__dirname, '../..');

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-adv-settings-'));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function run(payload: unknown, projectDir = PROJECT_DIR): ChildRunResult {
  const result = spawnSync(process.execPath, [ENTRY], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
  return { exitCode: result.status ?? 1, stderr: result.stderr ?? '' };
}

const BLOCKED: Array<{ name: string; payload: unknown }> = [
  {
    name: 'Read tool on .env',
    payload: { tool_name: 'Read', tool_input: { file_path: '.env' } },
  },
  {
    name: 'cat ~/.ssh/id_rsa',
    payload: { tool_name: 'Bash', tool_input: { command: 'cat ~/.ssh/id_rsa' } },
  },
  {
    name: 'env-var indirection cat $HOME/.aws/credentials',
    payload: { tool_name: 'Bash', tool_input: { command: 'cat $HOME/.aws/credentials' } },
  },
  {
    name: 'separator-less reader operand cat .env',
    payload: { tool_name: 'Bash', tool_input: { command: 'cat .env' } },
  },
  {
    name: 'writer exfiltration cp .env /tmp/out',
    payload: { tool_name: 'Bash', tool_input: { command: 'cp .env /tmp/ak-adv-out' } },
  },
  {
    name: 'source ~/.zshrc',
    payload: { tool_name: 'Bash', tool_input: { command: 'source ~/.zshrc' } },
  },
  {
    name: 'heredoc body carrying sensitive path',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'sh <<EOF\ncat /root/.ssh/id_rsa\nEOF' },
    },
  },
  {
    name: 'sensitive read outside the workspace stays denied',
    payload: {
      tool_name: 'Read',
      tool_input: { file_path: '../outside-project/.aws/credentials' },
    },
  },
];

const ALLOWED: Array<{ name: string; payload: unknown }> = [
  {
    name: 'ordinary build command',
    payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
  },
  {
    name: 'audited: redirect write to in-workspace .env',
    payload: { tool_name: 'Bash', tool_input: { command: 'echo leak > .env' } },
  },
  {
    name: 'audited: reader traversal cat ../../../etc/passwd',
    payload: { tool_name: 'Bash', tool_input: { command: 'cat ../../../etc/passwd' } },
  },
  {
    name: 'audited: Glob with outside-workspace path argument',
    payload: { tool_name: 'Glob', tool_input: { pattern: '**/*.pem', path: '/etc' } },
  },
  {
    name: 'search pattern that looks like a sensitive path',
    payload: { tool_name: 'Bash', tool_input: { command: 'rg /etc/passwd src' } },
  },
  {
    name: 'grep pattern with workspace target',
    payload: { tool_name: 'Bash', tool_input: { command: 'grep "STOP_HOOK" src/app.ts' } },
  },
  {
    name: 'sed expression over ordinary file',
    payload: { tool_name: 'Bash', tool_input: { command: 'sed "/^STOP_HOOK=/d" src/app.ts' } },
  },
  {
    name: 'interpreter one-liner over ordinary file',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: "node -e \"require('fs').readFileSync('src/app.ts','utf8')\"" },
    },
  },
  {
    name: 'URL operands are not filesystem paths',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'curl https://example.com/etc/passwd -o out.txt' },
    },
  },
  {
    name: 'prompt text mentioning @.env',
    payload: { prompt: 'Update the docs to mention @.env examples.' },
  },
  {
    name: 'Write content quoting sensitive names',
    payload: {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/fixture.ts',
        content: 'const sample = ".env and /etc/passwd are test strings";',
      },
    },
  },
  {
    name: 'unknown MCP-style tool without paths',
    payload: { tool_name: 'mcp__kit_agents__kit_get_provider', tool_input: {} },
  },
];

describe('adversarial corpus: blocked (exit 2)', () => {
  for (const testCase of BLOCKED) {
    test(`blocks: ${testCase.name}`, () => {
      const result = run(testCase.payload);
      assert.equal(
        result.exitCode,
        2,
        `Expected exit 2 for "${testCase.name}", got ${result.exitCode}\nstderr: ${result.stderr}`
      );
    });
  }

  test('malformed stdin fails closed', () => {
    const result = run('not-json{');
    assert.equal(result.exitCode, 2);
  });

  test('audit mode logs instead of blocking', () => {
    const kitDir = path.join(tmpDir, '.agent-kit');
    fs.mkdirSync(kitDir, { recursive: true });
    fs.writeFileSync(
      path.join(kitDir, 'settings.json'),
      JSON.stringify({ security: { enforcementMode: 'audit' } })
    );
    const result = run(BLOCKED[0].payload, tmpDir);
    assert.equal(result.exitCode, 0);
    const logPath = path.join(kitDir, 'logs', 'security-decisions.log');
    assert.ok(fs.existsSync(logPath), 'expected decision log entry');
    assert.match(fs.readFileSync(logPath, 'utf8'), /sensitive_file/);
  });
});

describe('adversarial corpus: allowed (exit 0)', () => {
  for (const testCase of ALLOWED) {
    test(`allows: ${testCase.name}`, () => {
      const result = run(testCase.payload);
      assert.equal(
        result.exitCode,
        0,
        `Expected exit 0 for "${testCase.name}", got ${result.exitCode}\nstderr: ${result.stderr}`
      );
    });
  }
});
