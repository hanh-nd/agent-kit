import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createLlamaLocalDigestProvider } from '../digest/providers/llama-local.js';

const INPUT = {
  sourcePath: '.agent-kit/wiki/archive/conversations/conv_2026-05-19T00-45-17-697Z.md',
  contentHash: 'tiny',
  content: '**User:** use local digest generation for archived conversations',
};

describe('createLlamaLocalDigestProvider', () => {
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
