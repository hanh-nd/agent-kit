import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeTranscript } from '../scripts/normalize.js';

describe('normalizeTranscript', () => {
  test('C7: strips <instructions> block', () => {
    const input = 'before\n<instructions>entire skill body\nspanning multiple lines</instructions>\nafter';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<instructions>'));
    assert.ok(!result.includes('entire skill body'));
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
  });

  test('C8: strips <command-name> block', () => {
    const input = 'hello\n<command-name>/ak:investigate</command-name>\nworld';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<command-name>'));
    assert.ok(!result.includes('/ak:investigate'));
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('world'));
  });

  test('C9: strips <system-reminder> block', () => {
    const input = 'user text\n<system-reminder>hook injected context\nmore context</system-reminder>\nmore user text';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<system-reminder>'));
    assert.ok(!result.includes('hook injected context'));
    assert.ok(result.includes('user text'));
    assert.ok(result.includes('more user text'));
  });

  test('C10: strips <function_calls> block', () => {
    const input = 'assistant says\n<function_calls>\n{"tool":"read","args":{}}\n</function_calls>\ndone';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<function_calls>'));
    assert.ok(!result.includes('"tool":"read"'));
    assert.ok(result.includes('assistant says'));
    assert.ok(result.includes('done'));
  });

  test('strips <available_resources> block', () => {
    const input = 'start\n<available_resources>file list\nmore files</available_resources>\nend';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<available_resources>'));
    assert.ok(!result.includes('file list'));
    assert.ok(result.includes('start'));
    assert.ok(result.includes('end'));
  });

  test('strips <function_results> block', () => {
    const input = 'call\n<function_results>{"result":"ok"}</function_results>\nresponse';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<function_results>'));
    assert.ok(!result.includes('"result":"ok"'));
  });

  test('strips <command-message> and <command-args>', () => {
    const input =
      '<command-message>ak:investigate</command-message>\n<command-args>some args</command-args>\nactual content';
    const result = normalizeTranscript(input);
    assert.ok(!result.includes('<command-message>'));
    assert.ok(!result.includes('<command-args>'));
    assert.ok(result.includes('actual content'));
  });

  test('C11: clean content passes through unchanged (modulo newline collapse)', () => {
    const input = 'Hello, how are you?\n\nI am fine, thanks.';
    const result = normalizeTranscript(input);
    assert.equal(result, input);
  });

  test('C11: collapses 3+ consecutive newlines to 2', () => {
    const input = 'line1\n\n\n\nline2';
    const result = normalizeTranscript(input);
    assert.equal(result, 'line1\n\nline2');
  });

  test('C12: idempotent — normalizing twice equals normalizing once', () => {
    const input = 'text\n<instructions>body</instructions>\n\n\nextra\n<system-reminder>ctx</system-reminder>\nmore';
    const once = normalizeTranscript(input);
    const twice = normalizeTranscript(once);
    assert.equal(once, twice);
  });

  test('does not throw on malformed or unclosed tags', () => {
    const input = 'text <instructions> unclosed tag and more text';
    assert.doesNotThrow(() => normalizeTranscript(input));
  });
});
