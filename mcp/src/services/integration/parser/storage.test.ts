import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEPTH_TRUNCATION_MARKER, MAX_STORAGE_DEPTH, storageToMarkdown } from './storage.js';

describe('storageToMarkdown — never-throw guarantee (BC12)', () => {
  test('S1: empty string returns a string without throwing', () => {
    const output = storageToMarkdown('');
    assert.equal(typeof output, 'string');
    assert.equal(output, '');
  });

  test('S2: null and undefined return a string without throwing', () => {
    assert.equal(storageToMarkdown(null), '');
    assert.equal(storageToMarkdown(undefined), '');
  });

  test('S3: unbalanced tags do not throw and text survives', () => {
    const output = storageToMarkdown('<p><strong>hi</p>');
    assert.ok(output.includes('hi'), `expected "hi" in output, got: ${JSON.stringify(output)}`);
  });

  test('S4: unterminated CDATA does not throw and the tail is not swallowed', () => {
    const output = storageToMarkdown('<ac:plain-text-body><![CDATA[abc');
    assert.ok(output.includes('abc'), `expected "abc" in output, got: ${JSON.stringify(output)}`);
  });

  test('S5: stray angle brackets terminate without an infinite loop', () => {
    assert.equal(typeof storageToMarkdown('<'), 'string');
    assert.equal(typeof storageToMarkdown('>'), 'string');
    assert.equal(storageToMarkdown('<<>>'), '<<>>');
  });
});

describe('storageToMarkdown — unhandled markup is visible, never dropped (BC13)', () => {
  test('S6: unknown macro renders a visible placeholder', () => {
    const output = storageToMarkdown(
      '<ac:structured-macro ac:name="chart"><ac:parameter ac:name="type">pie</ac:parameter></ac:structured-macro>',
    );
    assert.ok(output.includes('[macro: chart]'), `expected "[macro: chart]", got: ${JSON.stringify(output)}`);
  });

  test('S7: unknown non-macro tag still renders its children', () => {
    const output = storageToMarkdown('<foo>visible text</foo>');
    assert.ok(output.includes('visible text'), `children must never be dropped, got: ${JSON.stringify(output)}`);
  });

  test('S8: macro with no ac:name renders [macro: unknown]', () => {
    const output = storageToMarkdown('<ac:structured-macro>body</ac:structured-macro>');
    assert.ok(output.includes('[macro: unknown]'), `expected "[macro: unknown]", got: ${JSON.stringify(output)}`);
  });
});

describe('storageToMarkdown — code blocks and CDATA are verbatim (BC14)', () => {
  const CDATA_BODY = '<div>if (a < b) { return "x &amp; y"; }</div>';

  test('S9: code macro fences with its language and keeps CDATA byte-for-byte', () => {
    const output = storageToMarkdown(
      `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">ts</ac:parameter>` +
        `<ac:plain-text-body><![CDATA[${CDATA_BODY}]]></ac:plain-text-body></ac:structured-macro>`,
    );

    assert.ok(output.startsWith('```ts\n'), `expected a \`\`\`ts fence, got: ${JSON.stringify(output)}`);
    assert.ok(output.includes(CDATA_BODY), 'CDATA payload must appear verbatim');
    // MUST NOT: entities inside CDATA are not decoded, and <div> was not parsed as a tag.
    assert.ok(!output.includes('"x & y"'), '&amp; inside CDATA must not be decoded');
    assert.ok(output.includes('<div>'), '<div> inside CDATA must not be consumed as markup');
  });

  test('S10: pre renders a fenced block with no language', () => {
    const output = storageToMarkdown('<pre>x</pre>');
    assert.equal(output, '```\nx\n```');
  });
});

describe('storageToMarkdown — lists nest rather than flatten (BC15)', () => {
  test('S11: ul inside li is indented by exactly 2 spaces and not flattened', () => {
    const output = storageToMarkdown('<ul><li>a<ul><li>b</li></ul></li></ul>');

    assert.ok(output.includes('- a'), `expected "- a", got: ${JSON.stringify(output)}`);
    assert.ok(output.includes('\n  - b'), `expected "b" indented 2 spaces, got: ${JSON.stringify(output)}`);
    // MUST NOT: flattened to the same level.
    assert.ok(!output.includes('\n- b'), `"b" must not sit at the outer level, got: ${JSON.stringify(output)}`);
  });

  test('S12: ol renders numbered bullets', () => {
    const output = storageToMarkdown('<ol><li>a</li><li>b</li></ol>');
    assert.equal(output, '1. a\n1. b');
  });
});

describe('storageToMarkdown — GFM tables (BC16)', () => {
  test('S13: th-headed table emits a separator row and escapes cell pipes', () => {
    const output = storageToMarkdown(
      '<table><tbody><tr><th>Key</th><th>Value</th></tr><tr><td>a|b</td><td>c</td></tr></tbody></table>',
    );

    assert.ok(output.includes('| Key | Value |'), `expected a header row, got: ${JSON.stringify(output)}`);
    assert.ok(output.includes('| --- | --- |'), `expected one --- per header cell, got: ${JSON.stringify(output)}`);
    assert.ok(output.includes('| a\\|b | c |'), `expected the cell pipe escaped, got: ${JSON.stringify(output)}`);
  });

  test('S14: table with no rows renders empty without throwing', () => {
    assert.equal(storageToMarkdown('<table></table>'), '');
  });
});

describe('storageToMarkdown — entity decoding outside CDATA (BC17)', () => {
  test('S15: named entities decode and the raw sequences disappear', () => {
    const output = storageToMarkdown('<p>A&amp;B&nbsp;C &lt;tag&gt; &quot;q&quot; &apos;a&apos;</p>');

    assert.ok(output.includes('A&B'), `&amp; must decode, got: ${JSON.stringify(output)}`);
    assert.ok(output.includes('<tag>'), '&lt;/&gt; must decode');
    assert.ok(output.includes('"q"'), '&quot; must decode');
    assert.ok(output.includes("'a'"), '&apos; must decode');
    assert.ok(output.includes('B\u00A0C'), `&nbsp; must decode to U+00A0, got: ${JSON.stringify(output)}`);

    for (const raw of ['&nbsp;', '&amp;', '&lt;', '&gt;', '&quot;', '&apos;']) {
      assert.ok(!output.includes(raw), `raw entity ${raw} must not survive, got: ${JSON.stringify(output)}`);
    }
  });

  test('S16: decimal and hexadecimal numeric references both decode', () => {
    const output = storageToMarkdown('<p>&#8212; and &#x2014;</p>');

    assert.equal(output, '— and —');
    assert.ok(!output.includes('&#8212;'), 'raw decimal reference must not survive');
    assert.ok(!output.includes('&#x2014;'), 'raw hexadecimal reference must not survive');
  });

  test('S17: unrecognised entity-shaped text passes through unchanged', () => {
    assert.equal(storageToMarkdown('<p>&fooz;</p>'), '&fooz;');
  });
});

describe('storageToMarkdown — depth cap (BC18)', () => {
  test('S18: nesting past MAX_STORAGE_DEPTH truncates visibly without a RangeError', () => {
    const depth = MAX_STORAGE_DEPTH + 50;
    const xhtml = '<div>'.repeat(depth) + 'deep' + '</div>'.repeat(depth);

    const output = storageToMarkdown(xhtml);

    assert.ok(
      output.includes(DEPTH_TRUNCATION_MARKER),
      `expected the truncation marker, got: ${JSON.stringify(output.slice(0, 200))}`,
    );
  });
});

describe('storageToMarkdown — standard and Confluence constructs (BC3)', () => {
  test('S19: headings, inline marks and block constructs map per the mapping table', () => {
    assert.equal(storageToMarkdown('<h1>a</h1>'), '# a');
    assert.equal(storageToMarkdown('<h2>a</h2>'), '## a');
    assert.equal(storageToMarkdown('<h3>a</h3>'), '### a');
    assert.equal(storageToMarkdown('<h4>a</h4>'), '#### a');
    assert.equal(storageToMarkdown('<h5>a</h5>'), '##### a');
    assert.equal(storageToMarkdown('<h6>a</h6>'), '###### a');

    assert.equal(storageToMarkdown('<p><strong>a</strong></p>'), '**a**');
    assert.equal(storageToMarkdown('<p><em>a</em></p>'), '*a*');
    assert.equal(storageToMarkdown('<p><code>a</code></p>'), '`a`');
    assert.equal(storageToMarkdown('<p><s>a</s></p>'), '~~a~~');
    assert.equal(storageToMarkdown('<p><u>a</u></p>'), 'a');
    assert.equal(storageToMarkdown('<p><sup>a</sup></p>'), '^a^');
    assert.equal(storageToMarkdown('<p><sub>a</sub></p>'), '~a~');

    assert.equal(storageToMarkdown('<blockquote><p>a</p></blockquote>'), '> a');
    assert.equal(storageToMarkdown('<hr/>'), '---');
    assert.equal(storageToMarkdown('<p>a<br/>b</p>'), 'a\nb');
    assert.equal(storageToMarkdown('<p><a href="https://x.test/y">link</a></p>'), '[link](https://x.test/y)');
  });

  test('S20: panel, expand and jira macros render their known shapes', () => {
    const info = storageToMarkdown(
      '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>heads up</p></ac:rich-text-body></ac:structured-macro>',
    );
    assert.equal(info, '> **INFO**\n> heads up');

    const warning = storageToMarkdown(
      '<ac:structured-macro ac:name="warning"><ac:rich-text-body><p>careful</p></ac:rich-text-body></ac:structured-macro>',
    );
    assert.equal(warning, '> **WARNING**\n> careful');

    const expand = storageToMarkdown(
      '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">More</ac:parameter>' +
        '<ac:rich-text-body><p>hidden</p></ac:rich-text-body></ac:structured-macro>',
    );
    assert.equal(expand, '**More**\n\nhidden');

    const jira = storageToMarkdown(
      '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">PROJ-123</ac:parameter></ac:structured-macro>',
    );
    assert.equal(jira, '`PROJ-123`');
  });

  test('S21: Confluence links, images, tasks, emoticons and layouts render', () => {
    const pageLink = storageToMarkdown('<ac:link><ri:page ri:content-title="Design Notes" /></ac:link>');
    assert.ok(pageLink.includes('Design Notes'), `expected the page title as link text, got: ${pageLink}`);

    const attachmentLink = storageToMarkdown('<ac:link><ri:attachment ri:filename="spec.pdf" /></ac:link>');
    assert.equal(attachmentLink, '[attachment: spec.pdf]');

    const image = storageToMarkdown('<ac:image><ri:attachment ri:filename="diagram.png" /></ac:image>');
    assert.equal(image, '[image: diagram.png]');

    const tasks = storageToMarkdown(
      '<ac:task-list>' +
        '<ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>todo</ac:task-body></ac:task>' +
        '<ac:task><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task>' +
        '</ac:task-list>',
    );
    assert.equal(tasks, '- [ ] todo\n- [x] done');

    assert.equal(storageToMarkdown('<p><ac:emoticon ac:name="smile" /></p>'), ':smile:');

    const layout = storageToMarkdown(
      '<ac:layout-section><ac:layout-cell><p>inside</p></ac:layout-cell></ac:layout-section>',
    );
    assert.equal(layout, 'inside');
  });
});

describe('storageToMarkdown — large body completes (F12)', () => {
  test('S22: a ~300 KB mixed body converts to a non-empty string', () => {
    const block =
      '<h2>Section</h2><p>Some <strong>bold</strong> and <em>italic</em> text with &amp; entities.</p>' +
      '<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>' +
      '<table><tbody><tr><th>K</th><th>V</th></tr><tr><td>a</td><td>b|c</td></tr></tbody></table>' +
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">ts</ac:parameter>' +
      '<ac:plain-text-body><![CDATA[const x: number = 1; // < > &]]></ac:plain-text-body></ac:structured-macro>' +
      '<ac:structured-macro ac:name="chart"/>';

    const xhtml = block.repeat(Math.ceil(300_000 / block.length));
    assert.ok(xhtml.length >= 300_000, 'fixture must be at least 300 KB');

    const output = storageToMarkdown(xhtml);
    assert.ok(output.length > 0, 'conversion must produce output');
  });
});

describe('storageToMarkdown — extended HTML named entities (BC17)', () => {
  test('S23: common HTML entities decode and the raw sequences disappear', () => {
    const output = storageToMarkdown(
      '<p>A &rarr; B &larr; C &mdash; D &ndash; E &hellip; &copy; &reg; &trade; &deg; &times; &euro; &lsquo;x&rsquo; &ldquo;y&rdquo;</p>',
    );

    for (const [entity, char] of [
      ['&rarr;', '→'],
      ['&larr;', '←'],
      ['&mdash;', '—'],
      ['&ndash;', '–'],
      ['&hellip;', '…'],
      ['&copy;', '©'],
      ['&reg;', '®'],
      ['&trade;', '™'],
      ['&deg;', '°'],
      ['&times;', '×'],
      ['&euro;', '€'],
    ] as const) {
      assert.ok(output.includes(char), `${entity} must decode to ${char}, got: ${JSON.stringify(output)}`);
      assert.ok(!output.includes(entity), `raw ${entity} must not survive`);
    }
    assert.ok(output.includes('‘x’'), 'smart single quotes must decode');
    assert.ok(output.includes('“y”'), 'smart double quotes must decode');
  });

  test('S24: case-sensitive entity names are respected', () => {
    // Prime vs prime differ; a case-insensitive map would collapse them.
    assert.equal(storageToMarkdown('<p>&Prime; &prime;</p>'), '″ ′');
  });
});

describe('storageToMarkdown — block-level images sit on their own line', () => {
  test('S25: an image between two blocks is separated, not glued to the next block', () => {
    const output = storageToMarkdown('<ac:image><ri:attachment ri:filename="a.png" /></ac:image><p>after</p>');

    assert.equal(output, '[image: a.png]\n\nafter');
    assert.ok(!output.includes(']after'), 'the image marker must not be glued to the following text');
  });

  test('S26: an image inside a paragraph stays inline', () => {
    const output = storageToMarkdown('<p>before <ac:image><ri:attachment ri:filename="a.png" /></ac:image> after</p>');

    assert.equal(output, 'before [image: a.png] after');
  });
});
