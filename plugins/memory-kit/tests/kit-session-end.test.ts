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
    assert.ok(rawFiles[0].startsWith('conv_claude_'), `Expected file to start with 'conv_claude_', got ${rawFiles[0]}`);
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
    assert.ok(rawFiles[0].startsWith('conv_codex_'), `Expected file to start with 'conv_codex_', got ${rawFiles[0]}`);
    const rawContent = fs.readFileSync(path.join(rawDir, rawFiles[0]), 'utf8');
    assert.match(rawContent, /Remember the wiki compile rule\./);
    assert.match(rawContent, /Use conv markdown files\./);
    assert.ok(!fs.existsSync(legacyMemoryDir), 'session end must not write to legacy memory dir');
  });

  test('uses sanitized session_id in the output filename when provided', () => {
    const projectDir = makeTempDir();
    const codexDir = path.join(projectDir, '.codex');
    const transcriptPath = path.join(codexDir, 'session.jsonl');
    const scriptPath = path.resolve('dist/scripts/kit-session-end.js');

    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', input_text: 'Hello from session ID test.' }],
        },
      }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'my-custom/session-123' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');

    // The session_id "my-custom/session-123" should be sanitized to "my-customsession-123"
    const expectedFile = 'conv_codex_my-customsession-123.md';
    assert.ok(fs.existsSync(path.join(rawDir, expectedFile)), `Expected ${expectedFile} to exist`);
  });

  test('overwrites the target file instead of appending on subsequent emits', () => {
    const projectDir = makeTempDir();
    const codexDir = path.join(projectDir, '.codex');
    const transcriptPath = path.join(codexDir, 'session.jsonl');
    const scriptPath = path.resolve('dist/scripts/kit-session-end.js');

    fs.mkdirSync(codexDir, { recursive: true });

    // First run with one user message
    const msg1 = JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', input_text: 'First turn' }],
      },
    });
    fs.writeFileSync(transcriptPath, msg1, 'utf8');

    let result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'overwrite-test-session' }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const rawDir = path.join(projectDir, '.agent-kit', 'wiki', 'raw');
    const targetFile = path.join(rawDir, 'conv_codex_overwrite-test-session.md');

    const contentFirstRun = fs.readFileSync(targetFile, 'utf8');
    assert.match(contentFirstRun, /First turn/);

    // Second run with two messages in the transcript (full conversation)
    const msg2 = JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', output_text: 'Second turn' }],
      },
    });
    fs.writeFileSync(transcriptPath, [msg1, msg2].join('\n'), 'utf8');

    result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'overwrite-test-session' }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const contentSecondRun = fs.readFileSync(targetFile, 'utf8');
    assert.match(contentSecondRun, /First turn/);
    assert.match(contentSecondRun, /Second turn/);

    // Crucially, it should not have duplicated the first turn (which would happen if we appended)
    // There should be only one occurrence of '**User:** First turn' in the output.
    const occurrences = (contentSecondRun.match(/\*\*User:\*\* First turn/g) || []).length;
    assert.equal(occurrences, 1, 'Expected First turn to appear exactly once, but it was appended or duplicated');
  });
});
