import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { afterEach, describe, mock, test } from 'node:test';
import { LARGE_PAYLOAD_THRESHOLD, handleConfluenceGetPage, resolveConfluencePageId } from './integration.js';

const PAGE_ID = '123456789';
const PAGE_URL = `https://acme.atlassian.net/wiki/spaces/ENG/pages/${PAGE_ID}/Some+Page+Title`;
const BLOG_URL = 'https://acme.atlassian.net/wiki/spaces/ENG/blog/2026/01/15/987654321/Post+Title';
const TINY_URL = 'https://acme.atlassian.net/wiki/x/AbCdEf';

// Credentials resolve through process.env first, which is enough for these tests: every
// case here supplies credentials rather than asserting their absence.
process.env.ATLASSIAN_CLOUD_ID = 'cloud-a';
process.env.ATLASSIAN_USER_EMAIL = 'dev@acme.test';
process.env.CONFLUENCE_API_TOKEN = 'confluence-token';

interface FetchRecorder {
  calls: string[];
  authHeaders: string[];
}

/** Replace the global fetch for one test; `afterEach` restores it. */
function stubFetch(status: number, body: unknown): FetchRecorder {
  const calls: string[] = [];
  const authHeaders: string[] = [];

  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    authHeaders.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ''));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });

  return { calls, authHeaders };
}

const spilledFiles: string[] = [];

afterEach(() => {
  mock.restoreAll();
  while (spilledFiles.length > 0) {
    const file = spilledFiles.pop();
    if (file) fs.rmSync(file, { force: true });
  }
});

/** Decode the `email:token` pair a Basic auth header carries. */
function decodeBasicAuth(header: string): string {
  return Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
}

function pageFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAGE_ID,
    title: 'Design Notes',
    status: 'current',
    spaceId: '98765',
    version: { number: 7, createdAt: '2026-07-01T10:00:00.000Z' },
    body: { storage: { value: '<p>Hello <strong>world</strong></p>' } },
    labels: { results: [{ name: 'design' }, { name: 'api' }] },
    _links: { base: 'https://acme.atlassian.net/wiki', webui: `/spaces/ENG/pages/${PAGE_ID}/Design+Notes` },
    ...overrides,
  };
}

async function textFor(input: string): Promise<string> {
  return (await handleConfluenceGetPage({ input })).content[0].text;
}

async function successText(page: Record<string, unknown>): Promise<string> {
  stubFetch(200, page);
  return textFor(PAGE_URL);
}

describe('resolveConfluencePageId (BC2, BC5, BC6, BC7)', () => {
  test('H1: full page URL with a title segment resolves to the numeric id', () => {
    assert.deepEqual(resolveConfluencePageId(PAGE_URL), { kind: 'id', pageId: PAGE_ID });
  });

  test('H2: page URL with a query string and fragment but no title segment resolves', () => {
    const url = `https://acme.atlassian.net/wiki/spaces/ENG/pages/${PAGE_ID}?focusedCommentId=99#anchor`;
    assert.deepEqual(resolveConfluencePageId(url), { kind: 'id', pageId: PAGE_ID });
  });

  test('H3: legacy viewpage.action form resolves from the pageId query parameter', () => {
    const url = `https://acme.atlassian.net/pages/viewpage.action?pageId=${PAGE_ID}`;
    assert.deepEqual(resolveConfluencePageId(url), { kind: 'id', pageId: PAGE_ID });
  });

  test('H4: bare numeric id resolves', () => {
    assert.deepEqual(resolveConfluencePageId(PAGE_ID), { kind: 'id', pageId: PAGE_ID });
  });

  test('H8: blog URL is classified as blog, never as an id from its date segments', () => {
    const resolution = resolveConfluencePageId(BLOG_URL);

    assert.equal(resolution.kind, 'blog');
    assert.notEqual(resolution.kind, 'id');
    const serialised = JSON.stringify(resolution);
    assert.ok(!serialised.includes('2026'), 'a date segment must never become a page id');
    assert.ok(!serialised.includes('987654321'), 'a blog post id must never become a page id');
  });
});

describe('handleConfluenceGetPage — pre-network error paths (BC5, BC6, BC7, BC8)', () => {
  test('H5: tiny link errors before any network call and asks for the full page URL', async () => {
    assert.deepEqual(resolveConfluencePageId(TINY_URL), { kind: 'tiny' });

    const { calls } = stubFetch(200, pageFixture());
    const text = await textFor(TINY_URL);

    assert.equal(calls.length, 0, 'MUST NOT call fetch for a tiny link');
    assert.match(text, /tiny link/i);
    assert.match(text, /full page URL/i);
  });

  test('H6: blog URL errors before any network call', async () => {
    const { calls } = stubFetch(200, pageFixture());
    const text = await textFor(BLOG_URL);

    assert.equal(calls.length, 0, 'MUST NOT call fetch for a blog URL');
    assert.match(text, /blog posts are not supported/i);
  });

  test('H7: unrecognised input errors before any network call and lists accepted forms', async () => {
    assert.deepEqual(resolveConfluencePageId('not a confluence link at all'), { kind: 'unknown' });

    const { calls } = stubFetch(200, pageFixture());
    const text = await textFor('not a confluence link at all');

    assert.equal(calls.length, 0, 'MUST NOT call fetch for unrecognised input');
    assert.match(text, /Accepted input forms/);
    assert.match(text, /viewpage\.action\?pageId=/);
    assert.match(text, /numeric page ID/);
  });
});

describe('handleConfluenceGetPage — happy path output (BC3)', () => {
  test('H13: renders the full brief in exactly one request', async () => {
    const { calls, authHeaders } = stubFetch(200, pageFixture());
    const text = await textFor(PAGE_URL);

    assert.equal(calls.length, 1, 'exactly one HTTP request — no space or user lookup');
    assert.ok(calls[0].includes('/ex/confluence/cloud-a/'), `must use the shared cloud id, got: ${calls[0]}`);
    assert.equal(
      decodeBasicAuth(authHeaders[0]),
      'dev@acme.test:confluence-token',
      'Confluence must authenticate with the shared email and its own token, not the Jira token',
    );
    assert.ok(calls[0].includes('body-format=storage'), `got: ${calls[0]}`);
    assert.ok(calls[0].includes('include-labels=true'), `got: ${calls[0]}`);
    assert.ok(calls[0].includes('include-version=true'), `got: ${calls[0]}`);

    assert.match(text, /Design Notes/);
    assert.match(text, /\*\*Status:\*\* current/);
    assert.match(text, /\*\*Space:\*\* ENG/);
    assert.match(text, /\*\*Version:\*\* 7/);
    assert.match(text, /\*\*Last updated:\*\* 2026-07-01T10:00:00\.000Z/);
    assert.match(
      text,
      new RegExp(`\\*\\*URL:\\*\\* https://acme\\.atlassian\\.net/wiki/spaces/ENG/pages/${PAGE_ID}/Design\\+Notes`),
    );
    assert.match(text, /### Content\nHello \*\*world\*\*/);
    assert.match(text, /### Labels\ndesign, api/);
  });

  test('H14: space line is omitted, never guessed, when webui has no /spaces/<KEY>/', async () => {
    const text = await successText(
      pageFixture({ _links: { base: 'https://acme.atlassian.net/wiki', webui: '/foo/bar' } }),
    );

    assert.ok(!text.includes('**Space:**'), `space line must be omitted, got: ${text}`);
    assert.ok(!text.includes('98765'), 'spaceId must never be presented as a space key');
    assert.match(text, /\*\*URL:\*\* https:\/\/acme\.atlassian\.net\/wiki\/foo\/bar/);
  });
});

describe('handleConfluenceGetPage — distinct HTTP and schema errors (BC9)', () => {
  async function errorText(status: number, body: unknown = { message: 'nope' }): Promise<string> {
    stubFetch(status, body);
    return textFor(PAGE_URL);
  }

  test('H15: 401 identifies an auth failure', async () => {
    const text = await errorText(401);
    assert.match(text, /401/);
    assert.match(text, /Auth failed/i);
    assert.ok(!/Not found/i.test(text), '401 must be distinct from the 404 message');
  });

  test('H16: 403 mentions permission or restriction and is distinct from 404', async () => {
    const text = await errorText(403);
    assert.match(text, /403/);
    assert.match(text, /permission|restricted/i);
    assert.ok(!/Not found/i.test(text), '403 must be distinct from the 404 message');
  });

  test('H17: 404 identifies not-found and is distinct from 403', async () => {
    const text = await errorText(404);
    assert.match(text, /Not found/i);
    assert.ok(!text.includes('403'), '404 must be distinct from the 403 message');
  });

  test('H18: other non-OK statuses include the status code', async () => {
    const text = await errorText(500);
    assert.match(text, /500/);
    assert.ok(!/Auth failed/i.test(text), '500 must be distinct from 401');
    assert.ok(!/Not found/i.test(text), '500 must be distinct from 404');
    assert.ok(!/permission|restricted/i.test(text), '500 must be distinct from 403');
  });

  test('H19: a 200 missing title is reported as an invalid response format', async () => {
    const { title: _title, ...withoutTitle } = pageFixture();
    const text = await successText(withoutTitle);

    assert.match(text, /Invalid Confluence response format/);
    assert.ok(!text.includes('### Content'), 'a schema failure must not be presented as partial success');
  });
});

describe('handleConfluenceGetPage — empty and unconvertible bodies (BC10)', () => {
  const EXPECTED_URL = `https://acme.atlassian.net/wiki/spaces/ENG/pages/${PAGE_ID}/Design+Notes`;

  function assertEmptyWarning(text: string, status: string): void {
    assert.match(text, /⚠️ Confluence returned no readable body/);
    assert.ok(text.includes(`status: ${status}`), `warning must name the page status, got: ${text}`);
    assert.ok(text.includes(EXPECTED_URL), `warning must include the absolute URL, got: ${text}`);
    assert.ok(!/### Content\n\s*\n/.test(text), 'MUST NOT emit an empty Content section as if it were success');
  }

  test('H20: body: {} (the documented Atlassian defect) warns explicitly', async () => {
    assertEmptyWarning(await successText(pageFixture({ body: {} })), 'current');
  });

  test('H21: an empty storage value warns explicitly', async () => {
    assertEmptyWarning(await successText(pageFixture({ body: { storage: { value: '' } } })), 'current');
  });

  test('H22: a body that converts to whitespace only warns explicitly', async () => {
    assertEmptyWarning(await successText(pageFixture({ body: { storage: { value: '<p>&nbsp;</p>' } } })), 'current');
  });

  test('H23: a trashed page names its status in the warning', async () => {
    const text = await successText(pageFixture({ status: 'trashed', body: {} }));

    assertEmptyWarning(text, 'trashed');
    assert.match(text, /\*\*Status:\*\* trashed/);
  });
});

describe('handleConfluenceGetPage — oversize bodies spill to a temp file (BC11)', () => {
  const HUGE_TEXT = 'x'.repeat(LARGE_PAYLOAD_THRESHOLD + 10);

  test('H24: the body is written to /tmp and referenced, not inlined', async () => {
    stubFetch(200, pageFixture({ body: { storage: { value: `<p>${HUGE_TEXT}</p>` } } }));

    const text = await textFor(PAGE_URL);

    const spilledPath = text.match(new RegExp(`/tmp/kit-confluence-${PAGE_ID}-\\d+\\.md`))?.[0];
    assert.ok(spilledPath, `output must reference a temp path, got: ${text.slice(0, 300)}`);
    spilledFiles.push(spilledPath);

    assert.ok(fs.existsSync(spilledPath), 'the temp file must actually be written');
    assert.ok(fs.readFileSync(spilledPath, 'utf8').includes(HUGE_TEXT), 'the temp file must hold the markdown');
    assert.ok(!text.includes(HUGE_TEXT), 'MUST NOT inline the body once it has been spilled');
  });
});

describe('handleConfluenceGetPage — secret redaction and labels (BC19, BC20)', () => {
  test('H26: a pasted AWS key in the page body is redacted', async () => {
    const secret = 'AKIAABCDEFGHIJKLMNOP';
    const text = await successText(pageFixture({ body: { storage: { value: `<p>key ${secret} here</p>` } } }));

    assert.match(text, /\[REDACTED\]/);
    assert.ok(!text.includes(secret), 'the raw token MUST NOT reach the agent context');
  });

  test('H27: absent labels render None', async () => {
    const { labels: _labels, ...withoutLabels } = pageFixture();
    assert.match(await successText(withoutLabels), /### Labels\nNone/);
  });

  test('H28: an empty labels result renders None', async () => {
    assert.match(await successText(pageFixture({ labels: { results: [] } })), /### Labels\nNone/);
  });

  test('H29: multiple labels render comma-joined', async () => {
    assert.match(await successText(pageFixture()), /### Labels\ndesign, api/);
  });
});

describe('handleConfluenceGetPage — never rejects (H30)', () => {
  test('H30: every error and success scenario resolves to a valid mcpText envelope', async () => {
    const scenarios: Array<{ label: string; input: string; body: unknown; status: number }> = [
      { label: 'tiny link', input: TINY_URL, status: 200, body: pageFixture() },
      { label: 'blog URL', input: BLOG_URL, status: 200, body: pageFixture() },
      { label: 'unrecognised', input: 'nonsense', status: 200, body: pageFixture() },
      ...[401, 403, 404, 500].map((status) => ({
        label: `HTTP ${status}`,
        input: PAGE_URL,
        status,
        body: { message: 'nope' },
      })),
      { label: 'schema mismatch', input: PAGE_URL, status: 200, body: { id: PAGE_ID } },
      { label: 'empty body', input: PAGE_URL, status: 200, body: pageFixture({ body: {} }) },
      {
        label: 'malformed body markup',
        input: PAGE_URL,
        status: 200,
        body: pageFixture({ body: { storage: { value: '<p><strong>oops</p><![CDATA[' } } }),
      },
      { label: 'happy path', input: PAGE_URL, status: 200, body: pageFixture() },
    ];

    for (const scenario of scenarios) {
      stubFetch(scenario.status, scenario.body);

      const result = await handleConfluenceGetPage({ input: scenario.input });
      assert.equal(result.content.length, 1, `${scenario.label}: expected one content entry`);
      assert.equal(result.content[0].type, 'text', `${scenario.label}: expected a text envelope`);
      assert.equal(typeof result.content[0].text, 'string', `${scenario.label}: expected string text`);
      assert.ok(result.content[0].text.length > 0, `${scenario.label}: expected a non-empty message`);

      mock.restoreAll();
    }
  });
});
