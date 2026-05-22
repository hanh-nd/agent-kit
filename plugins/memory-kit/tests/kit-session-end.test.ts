import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-kit-session-end-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('kit-session-end', () => {
  test('C24: strips <instructions> and <command-name> content from written conv_*.md', () => {
    const projectDir = makeTempDir();
    const claudeDir = path.join(projectDir, '.claude', 'projects', 'test-project');
    const transcriptPath = path.join(claudeDir, 'session.jsonl');
    const scriptPath = path.resolve('dist/scripts/kit-session-end.js');

    fs.mkdirSync(claudeDir, { recursive: true });

    // Simulate an isMeta user message with <instructions> and a <command-name>
    const skillInvocationMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '<command-name>/ak:plan</command-name>\n<command-message>ak:plan</command-message>\n<instructions>This is the full skill body that should be stripped out.\nIt can span multiple lines.\n</instructions>\n<available_resources>list of files</available_resources>',
          },
        ],
      },
    };

    const actualUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'What should we implement next?' }],
      },
    };

    const assistantMessage = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'We should implement the lockfile first.' }],
      },
    };

    fs.writeFileSync(
      transcriptPath,
      [skillInvocationMessage, actualUserMessage, assistantMessage].map((m) => JSON.stringify(m)).join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({ transcript_path: transcriptPath }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);

    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    const rawFiles = fs.readdirSync(rawDir).filter((name) => /^conv_.*\.md$/.test(name));
    assert.equal(rawFiles.length, 1);
    const rawContent = fs.readFileSync(path.join(rawDir, rawFiles[0]), 'utf8');

    // Actual conversation content must be present
    assert.match(rawContent, /What should we implement next\?/);
    assert.match(rawContent, /We should implement the lockfile first\./);

    // Noise must be absent
    assert.ok(!rawContent.includes('<instructions>'), 'instructions block must be stripped');
    assert.ok(!rawContent.includes('full skill body'), 'skill body content must be stripped');
    assert.ok(!rawContent.includes('<command-name>'), 'command-name block must be stripped');
    assert.ok(!rawContent.includes('<available_resources>'), 'available_resources block must be stripped');
    // The pure skill-invocation message must not produce a blank User line
    assert.ok(!rawContent.match(/\*\*User:\*\*\s*\n/), 'empty User line must not appear');
  });

  test('writes non-empty transcripts to wiki/raw conv markdown files only', () => {
    const projectDir = makeTempDir();
    const codexDir = path.join(projectDir, '.codex');
    const transcriptPath = path.join(codexDir, 'session.jsonl');
    const scriptPath = path.resolve('dist/scripts/kit-session-end.js');

    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', input_text: 'Remember the wiki compile rule.' }],
          },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', output_text: 'Use conv markdown files.' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({ transcript_path: transcriptPath }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '{}');

    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    const legacyMemoryDir = path.join(projectDir, '.agent-kit', 'memory');
    const rawFiles = fs.readdirSync(rawDir).filter((name) => /^conv_.*\.md$/.test(name));

    assert.equal(rawFiles.length, 1);
    const rawContent = fs.readFileSync(path.join(rawDir, rawFiles[0]), 'utf8');
    assert.match(rawContent, /Remember the wiki compile rule\./);
    assert.match(rawContent, /Use conv markdown files\./);
    assert.ok(!fs.existsSync(legacyMemoryDir), 'session end must not write to legacy memory dir');
  });
});
