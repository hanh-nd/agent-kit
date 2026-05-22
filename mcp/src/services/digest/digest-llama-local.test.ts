import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createLlamaLocalDigestProvider,
  sanitizeConversationDigestMarkdown,
  trimConversationExport,
} from '../digest/providers/llama-local.js';

const INPUT = {
  sourcePath: '.agent-kit/wiki/archive/conversations/conv_2026-05-19T00-45-17-697Z.md',
  contentHash: 'tiny',
  content: '**User:** use local digest generation for archived conversations',
};

describe('createLlamaLocalDigestProvider', () => {
  test('strips code fences without rewriting model output', () => {
    const markdown = sanitizeConversationDigestMarkdown('```md\n# Notes\n\n**Summary**\n\nUse local digesting.\n```');

    assert.match(markdown, /^# Notes/);
    assert.match(markdown, /\*\*Summary\*\*/);
    assert.doesNotMatch(markdown, /```/);
  });

  test('trims conversation exports from the end without parsing turns', () => {
    const trimmed = trimConversationExport('first decision\nsecond decision\nfinal decision', 14);

    assert.match(trimmed, /omitted/);
    assert.doesNotMatch(trimmed, /first decision/);
    assert.match(trimmed, /final decision/);
  });

  test('runs an opt-in smoke test against a real model', { skip: !process.env.AGENT_KIT_DIGEST_MODEL_ID }, async () => {
    const modelId = process.env.AGENT_KIT_DIGEST_MODEL_ID as string;
    const provider = await createLlamaLocalDigestProvider(modelId);
    const output = await provider.generateDigestMarkdown(INPUT, {
      modelId,
      maxInputChars: 1000,
      timeoutMs: 120_000,
    });
    assert.match(output, /^# Conversation Digest:/);
    assert.match(output, /Status: provisional/);
  });
});
