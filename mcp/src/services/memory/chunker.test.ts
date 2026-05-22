import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chunkMarkdown, cleanContentForEmbedding, computeChunkId } from './chunker.js';

const CFG = { chunkSize: 200, overlapLines: 2 };
const SRC = 'test.md';

describe('chunkMarkdown', () => {
  test('returns [] for empty string', () => {
    assert.deepEqual(chunkMarkdown('', SRC, CFG), []);
  });

  test('returns [] for whitespace-only string', () => {
    assert.deepEqual(chunkMarkdown('   \n\n  ', SRC, CFG), []);
  });

  test('single heading + short body produces one chunk with correct metadata', () => {
    const text = '# My Heading\nThis is the body text.';
    const chunks = chunkMarkdown(text, SRC, CFG);
    assert.equal(chunks.length, 1);
    const [c] = chunks;
    assert.equal(c.heading, 'My Heading');
    assert.equal(c.headingLevel, 1);
    assert.equal(c.source, SRC);
    assert.ok(c.lineStart >= 1);
    assert.ok(c.lineEnd >= c.lineStart);
  });

  test('chunk id is deterministic — same content produces same id', () => {
    const text = '# Section\nHello world.';
    const [a] = chunkMarkdown(text, SRC, CFG);
    const [b] = chunkMarkdown(text, 'other-source.md', CFG);
    assert.equal(a.id, b.id, 'id must depend on content only, not source');
  });

  test('chunk id changes when content changes', () => {
    const [a] = chunkMarkdown('# H\nVersion A', SRC, CFG);
    const [b] = chunkMarkdown('# H\nVersion B', SRC, CFG);
    assert.notEqual(a.id, b.id);
  });

  test('body exceeding chunkSize produces multiple chunks', () => {
    const word = 'a'.repeat(50);
    const body = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ${word}`).join('\n\n');
    const text = `# Big Section\n${body}`;
    const chunks = chunkMarkdown(text, SRC, { chunkSize: 100, overlapLines: 0 });
    assert.ok(chunks.length > 1, `Expected >1 chunks, got ${chunks.length}`);
    for (const c of chunks) {
      assert.equal(c.heading, 'Big Section');
    }
  });

  test('multiple headings produce separate chunks with correct headingLevel', () => {
    const text = [
      '# Top Level',
      'Top content.',
      '## Sub Level',
      'Sub content.',
      '### Deep Level',
      'Deep content.',
    ].join('\n');
    const chunks = chunkMarkdown(text, SRC, CFG);
    const levels = chunks.map((c) => c.headingLevel);
    assert.ok(levels.includes(1), 'Expected headingLevel 1');
    assert.ok(levels.includes(2), 'Expected headingLevel 2');
    assert.ok(levels.includes(3), 'Expected headingLevel 3');
  });

  test('HTML comment is stripped from chunk content', () => {
    const text = '# Section\nVisible text <!-- hidden comment --> more visible text.';
    const [chunk] = chunkMarkdown(text, SRC, CFG);
    assert.ok(!chunk.content.includes('hidden comment'), 'HTML comment must be stripped');
    assert.ok(chunk.content.includes('Visible text'), 'Visible text must remain');
  });

  test('multiline HTML comment is stripped', () => {
    const text = '# Section\nBefore.\n<!-- multi\nline\ncomment -->\nAfter.';
    const [chunk] = chunkMarkdown(text, SRC, CFG);
    assert.ok(!chunk.content.includes('multi'), 'Multiline comment must be stripped');
    assert.ok(chunk.content.includes('Before.'), 'Text before comment must remain');
  });
});

describe('computeChunkId', () => {
  test('returns 16-character hex string', () => {
    const id = computeChunkId('hello world');
    assert.equal(id.length, 16);
    assert.match(id, /^[0-9a-f]{16}$/);
  });

  test('same content always produces same id', () => {
    assert.equal(computeChunkId('abc'), computeChunkId('abc'));
  });

  test('different content produces different id', () => {
    assert.notEqual(computeChunkId('abc'), computeChunkId('xyz'));
  });
});

describe('cleanContentForEmbedding', () => {
  test('strips HTML comment', () => {
    assert.equal(cleanContentForEmbedding('hello <!-- comment --> world'), 'hello  world');
  });

  test('strips multiline HTML comment', () => {
    const input = 'before <!-- line1\nline2 --> after';
    const result = cleanContentForEmbedding(input);
    assert.ok(!result.includes('line1'));
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
  });

  test('returns original string when no comments present', () => {
    const text = 'plain text without comments';
    assert.equal(cleanContentForEmbedding(text), text);
  });

  test('preserves fenced code block content', () => {
    const text = '```js\nconst x = 1;\n```';
    assert.equal(cleanContentForEmbedding(text), text);
  });
});
