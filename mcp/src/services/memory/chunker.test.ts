import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chunkMarkdown } from './chunker.js';

const CFG = { chunkSize: 200, overlapLines: 2 };
const SRC = 'test.md';
const META = { sourceType: 'wiki' as const, fileMtimeAt: 123 };

describe('chunkMarkdown', () => {
  test('returns [] for empty string', () => {
    assert.deepEqual(chunkMarkdown('', SRC, CFG, META), []);
  });

  test('returns [] for whitespace-only string', () => {
    assert.deepEqual(chunkMarkdown('   \n\n  ', SRC, CFG, META), []);
  });

  test('single heading + short body produces one chunk with correct metadata', () => {
    const text = '# My Heading\nThis is the body text.';
    const chunks = chunkMarkdown(text, SRC, CFG, META);
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
    const [a] = chunkMarkdown(text, SRC, CFG, META);
    const [b] = chunkMarkdown(text, 'other-source.md', CFG, META);
    assert.equal(a.id, b.id, 'id must depend on content only, not source');
  });

  test('chunk id changes when content changes', () => {
    const [a] = chunkMarkdown('# H\nVersion A', SRC, CFG, META);
    const [b] = chunkMarkdown('# H\nVersion B', SRC, CFG, META);
    assert.notEqual(a.id, b.id);
  });

  test('body exceeding chunkSize produces multiple chunks', () => {
    const word = 'a'.repeat(50);
    const body = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ${word}`).join('\n\n');
    const text = `# Big Section\n${body}`;
    const chunks = chunkMarkdown(text, SRC, { chunkSize: 100, overlapLines: 0 }, META);
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
    const chunks = chunkMarkdown(text, SRC, CFG, META);
    const levels = chunks.map((c) => c.headingLevel);
    assert.ok(levels.includes(1), 'Expected headingLevel 1');
    assert.ok(levels.includes(2), 'Expected headingLevel 2');
    assert.ok(levels.includes(3), 'Expected headingLevel 3');
  });

  test('HTML comment is stripped from chunk content', () => {
    const text = '# Section\nVisible text <!-- hidden comment --> more visible text.';
    const [chunk] = chunkMarkdown(text, SRC, CFG, META);
    assert.ok(!chunk.content.includes('hidden comment'), 'HTML comment must be stripped');
    assert.ok(chunk.content.includes('Visible text'), 'Visible text must remain');
  });

  test('multiline HTML comment is stripped', () => {
    const text = '# Section\nBefore.\n<!-- multi\nline\ncomment -->\nAfter.';
    const [chunk] = chunkMarkdown(text, SRC, CFG, META);
    assert.ok(!chunk.content.includes('multi'), 'Multiline comment must be stripped');
    assert.ok(chunk.content.includes('Before.'), 'Text before comment must remain');
  });

  test('propagates source type and file mtime metadata to every chunk', () => {
    const text = '# One\nBody one.\n\n# Two\nBody two.';
    const chunks = chunkMarkdown(text, SRC, CFG, { sourceType: 'digest', fileMtimeAt: 456 });

    assert.ok(chunks.length > 0);
    for (const chunk of chunks) {
      assert.equal(chunk.sourceType, 'digest');
      assert.equal(chunk.fileMtimeAt, 456);
    }
  });
});
