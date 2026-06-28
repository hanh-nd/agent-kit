import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createLlamaLocalDigestProvider,
  sanitizeConversationDigestMarkdown,
  titleFromSource,
  trimConversationExport,
} from '../digest/providers/llama-local.js';

describe('titleFromSource', () => {
  test('strips the extension and turns separators into spaces', () => {
    assert.equal(titleFromSource('/a/b/conv_claude_1bda-2b2b.md'), 'conv claude 1bda 2b2b');
  });

  test('handles a bare filename with no directory', () => {
    assert.equal(titleFromSource('inbox.md'), 'inbox');
  });
});

describe('trimConversationExport', () => {
  test('returns the trimmed content unchanged when within the limit', () => {
    assert.equal(trimConversationExport('  hello world  ', 100), 'hello world');
  });

  test('keeps the tail and prepends an omission notice when over the limit', () => {
    const content = 'A'.repeat(50) + 'TAIL_MARKER';
    const out = trimConversationExport(content, 11);

    assert.match(out, /^\[Earlier conversation content omitted/);
    assert.ok(out.endsWith('TAIL_MARKER'), 'keeps the most recent content');
    assert.equal(out.split('\n\n')[1], 'TAIL_MARKER');
  });
});

describe('sanitizeConversationDigestMarkdown', () => {
  test('unwraps a fenced markdown block', () => {
    const out = sanitizeConversationDigestMarkdown('```markdown\n# Title\n\nbody\n```');
    assert.equal(out, '# Title\n\nbody\n');
  });

  test('leaves unfenced text intact and guarantees a single trailing newline', () => {
    const out = sanitizeConversationDigestMarkdown('  plain summary  ');
    assert.equal(out, 'plain summary\n');
  });

  test('does not strip text that merely mentions a code fence inline', () => {
    const out = sanitizeConversationDigestMarkdown('Use ```bash``` to run it.');
    assert.equal(out, 'Use ```bash``` to run it.\n');
  });
});

describe('createLlamaLocalDigestProvider (opt-in real model)', () => {
  const INPUT = {
    sourcePath: '.agent-kit/wiki/raw/conv_2026-05-19T00-45-17-697Z.md',
    contentHash: 'tiny',
    content: '**User:** use local digest generation for archived conversations',
  };

  test(
    'generates a digest with the documented metadata header and a non-empty body',
    { skip: !process.env.AGENT_KIT_DIGEST_MODEL_ID },
    async () => {
      const modelId = process.env.AGENT_KIT_DIGEST_MODEL_ID as string;
      const provider = await createLlamaLocalDigestProvider(modelId);
      try {
        const output = await provider.generateDigestMarkdown(INPUT, {
          modelId,
          maxInputChars: 1000,
          timeoutMs: 120_000,
        });

        assert.match(output, /^## Digest: conv 2026/);
        assert.match(output, /\| \*\*Source\*\* \| .*conv_2026-05-19/);
        assert.match(output, new RegExp(`\\| \\*\\*Model\\*\\* \\| ${modelId} \\|`));
        assert.doesNotMatch(output, /<\/?think>/i);
        const body = output.replace(/^##[\s\S]*?\n\n/, '').trim();
        assert.ok(body.length > 0, 'expected a non-empty digest body');
      } finally {
        await provider.dispose?.();
      }
    },
  );
});
