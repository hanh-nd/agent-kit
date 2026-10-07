import * as assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';
import {
  MAX_PAGES,
  handleCreateBitbucketPr,
  handleFindBitbucketReviewers,
  handleGetBitbucketPrComments,
  matchReviewers,
  normalizeName,
  resolveBitbucketPr,
  resolveBitbucketRepo,
} from './integration.js';

const API = 'https://api.bitbucket.org/2.0';
const PR_URL = 'https://bitbucket.org/acme/web-app/pull-requests/42';

process.env.BITBUCKET_USER_EMAIL = 'dev@acme.test';
process.env.BITBUCKET_API_TOKEN = 'bb-token';
process.env.BITBUCKET_DEFAULT_WORKSPACE = 'acme';

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/** Replace the global fetch for one test with a queue of responses; `afterEach` restores it. */
function stubFetch(responses: Array<{ status: number; body: unknown }>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

afterEach(() => mock.restoreAll());

describe('resolveBitbucketPr / resolveBitbucketRepo', () => {
  test('B1: PR URL resolves to workspace, repo and id', () => {
    assert.deepEqual(resolveBitbucketPr(PR_URL), { ok: true, ws: 'acme', repo: 'web-app', prId: 42 });
  });

  test('B2: numeric PR id uses the default workspace', () => {
    assert.deepEqual(resolveBitbucketPr('7', undefined, 'api'), { ok: true, ws: 'acme', repo: 'api', prId: 7 });
  });

  test('B3: numeric PR id without repoSlug is rejected', () => {
    assert.equal(resolveBitbucketPr('7').ok, false);
  });

  test('B4: repo accepts URL, workspace/repo pair, clone URL and bare slug', () => {
    const expected = { ok: true, ws: 'acme', repo: 'web-app' };
    assert.deepEqual(resolveBitbucketRepo('https://bitbucket.org/acme/web-app/src/main/'), expected);
    assert.deepEqual(resolveBitbucketRepo('acme/web-app'), expected);
    assert.deepEqual(resolveBitbucketRepo('git@bitbucket.org:acme/web-app.git'), expected);
    assert.deepEqual(resolveBitbucketRepo('web-app'), expected);
    assert.deepEqual(resolveBitbucketRepo('web-app', 'other'), { ok: true, ws: 'other', repo: 'web-app' });
  });

  test('B5: slugs with URL-breaking characters are rejected', () => {
    assert.equal(resolveBitbucketRepo('acme/web app').ok, false);
    assert.equal(resolveBitbucketRepo('../evil').ok, false);
  });
});

const SELF_UUID = '{11111111-1111-1111-1111-111111111111}';
const MEMBERS = [
  { uuid: '{aaaaaaaa-0000-0000-0000-000000000001}', display_name: 'Trần Văn Điền', nickname: 'dientv' },
  { uuid: '{aaaaaaaa-0000-0000-0000-000000000002}', display_name: 'Nguyễn Tiến Dũng', nickname: 'dungnt' },
  { uuid: '{aaaaaaaa-0000-0000-0000-000000000003}', display_name: 'Lê Dũng', nickname: 'dungle' },
  { uuid: SELF_UUID, display_name: 'Ngô Hạnh', nickname: 'hanhnd' },
];
const member = (i: number) => ({
  uuid: MEMBERS[i].uuid,
  displayName: MEMBERS[i].display_name,
  nickname: MEMBERS[i].nickname,
});

type Route = (url: string, method: string) => { status: number; body: unknown } | undefined;

/** Route requests by URL (lookups run concurrently, so order is not stable); unrouted → 500. */
function stubRoutes(route: Route): RecordedCall[] {
  const calls: RecordedCall[] = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const res = route(url, method) ?? { status: 500, body: `unrouted ${method} ${url}` };
    return new Response(typeof res.body === 'string' ? res.body : JSON.stringify(res.body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

/** Workspace members split over two pages, the current user, and a 201 for PR creation. */
function bitbucketRoutes(overrides: Route = () => undefined): Route {
  return (url, method) => {
    const hit = overrides(url, method);
    if (hit) return hit;
    if (url === `${API}/workspaces/acme/members?pagelen=100`) {
      return {
        status: 200,
        body: { values: MEMBERS.slice(0, 2).map((user) => ({ user })), next: `${API}/workspaces/acme/members?page=2` },
      };
    }
    if (url === `${API}/workspaces/acme/members?page=2`) {
      return { status: 200, body: { values: MEMBERS.slice(2).map((user) => ({ user })) } };
    }
    if (url === `${API}/user`) return { status: 200, body: { uuid: SELF_UUID } };
    if (method === 'POST') return { status: 201, body: created };
    return undefined;
  };
}

const created = {
  id: 101,
  title: 'Add login',
  state: 'OPEN',
  draft: true,
  source: { branch: { name: 'feature/login' } },
  destination: { branch: { name: 'develop' } },
  reviewers: [{ display_name: 'Bob' }],
  links: { html: { href: 'https://bitbucket.org/acme/web-app/pull-requests/101' } },
};

const postOf = (calls: RecordedCall[]) => calls.find((c) => c.method === 'POST');

describe('matchReviewers / normalizeName', () => {
  const members = MEMBERS.map((_, i) => member(i));

  test('N1: normalizeName strips Vietnamese diacritics including đ', () => {
    assert.equal(normalizeName('  Trần Văn Điền '), 'tran van dien');
  });

  test('N2: a single word matches a whole word of the display name, accent-insensitive', () => {
    const r = matchReviewers(['Dien'], members);
    assert.deepEqual(r.resolved, [{ query: 'Dien', member: member(0) }]);
  });

  test('N3: a word shared by several members is ambiguous, never guessed', () => {
    const r = matchReviewers(['Dung'], members);
    assert.equal(r.resolved.length, 0);
    assert.deepEqual(
      r.ambiguous[0].candidates.map((c) => c.uuid),
      [member(1).uuid, member(2).uuid],
    );
  });

  test('N4: full name, nickname and multi-word queries disambiguate', () => {
    const r = matchReviewers(['nguyen tien dung', 'dungle', 'Le Dung'], members);
    assert.deepEqual(
      r.resolved.map((x) => x.member.uuid),
      [member(1).uuid, member(2).uuid, member(2).uuid],
    );
  });

  test('N5: partial words do not match', () => {
    assert.deepEqual(matchReviewers(['Die'], members).unmatched, ['Die']);
  });
});

describe('handleCreateBitbucketPr', () => {
  test('C1: POSTs the documented body and renders id + URL', async () => {
    const calls = stubRoutes(bitbucketRoutes());
    const text = (
      await handleCreateBitbucketPr({
        repository: 'acme/web-app',
        title: ' Add login ',
        sourceBranch: 'feature/login',
        destinationBranch: 'develop',
        description: 'Body',
        closeSourceBranch: true,
        draft: true,
        reviewers: ['504c3b62-8120-4f0c-a7bc-87800b9d6f70'],
      })
    ).content[0].text;

    const post = postOf(calls);
    assert.ok(post);
    assert.equal(post.url, `${API}/repositories/acme/web-app/pullrequests`);
    assert.deepEqual(post.body, {
      title: 'Add login',
      source: { branch: { name: 'feature/login' } },
      destination: { branch: { name: 'develop' } },
      description: 'Body',
      close_source_branch: true,
      draft: true,
      reviewers: [{ uuid: '{504c3b62-8120-4f0c-a7bc-87800b9d6f70}' }],
    });
    assert.ok(!calls.some((c) => c.url.includes('/members')), 'UUID-only reviewers need no member lookup');
    assert.match(text, /Created PR #101: Add login/);
    assert.match(text, /pull-requests\/101/);
    assert.match(text, /feature\/login → develop/);
    assert.match(text, /\(draft\)/);
    assert.match(text, /Reviewers:\*\* Bob/);
  });

  test('C2: omits destination so Bitbucket defaults to the main branch; no lookups without reviewers', async () => {
    const calls = stubRoutes(bitbucketRoutes());
    await handleCreateBitbucketPr({ repository: 'web-app', title: 'T', sourceBranch: 'feat' });
    assert.equal(calls.length, 1);
    assert.deepEqual(postOf(calls)?.body, { title: 'T', source: { branch: { name: 'feat' } } });
  });

  test('C3: names resolve across member pages, dedupe, and drop the PR author', async () => {
    const calls = stubRoutes(bitbucketRoutes());
    const text = (
      await handleCreateBitbucketPr({
        repository: 'acme/web-app',
        title: 'T',
        sourceBranch: 'f',
        reviewers: ['Dien', 'dientv', 'Le Dung', 'Hanh'],
      })
    ).content[0].text;
    assert.deepEqual(postOf(calls)?.body, {
      title: 'T',
      source: { branch: { name: 'f' } },
      reviewers: [{ uuid: member(0).uuid }, { uuid: member(2).uuid }],
    });
    assert.match(text, /PR author\) were named as a reviewer — skipped/);
  });

  test('C4: ambiguous or unknown names abort before any PR is created', async () => {
    const calls = stubRoutes(bitbucketRoutes());
    const text = (
      await handleCreateBitbucketPr({
        repository: 'acme/web-app',
        title: 'T',
        sourceBranch: 'f',
        reviewers: ['Dung', 'Zed'],
      })
    ).content[0].text;
    assert.equal(postOf(calls), undefined);
    assert.match(text, /PR not created/);
    assert.match(text, /"Dung" matches 2 members/);
    assert.match(text, /Nguyễn Tiến Dũng \(@dungnt\)/);
    assert.match(text, /"Zed" matches no workspace member/);
  });

  test('C5: a 403 on the member list names the missing scope', async () => {
    stubRoutes(bitbucketRoutes((url) => (url.includes('/members') ? { status: 403, body: {} } : undefined)));
    const text = (
      await handleCreateBitbucketPr({ repository: 'acme/web-app', title: 'T', sourceBranch: 'f', reviewers: ['Dien'] })
    ).content[0].text;
    assert.match(text, /read:workspace:bitbucket/);
  });

  test('C5b: the member-list scope hint is not repeated by the generic scope hint', async () => {
    stubRoutes(bitbucketRoutes((url) => (url.includes('/members') ? { status: 403, body: {} } : undefined)));
    const text = (
      await handleCreateBitbucketPr({ repository: 'acme/web-app', title: 'T', sourceBranch: 'f', reviewers: ['Dien'] })
    ).content[0].text;
    assert.doesNotMatch(text, /Check the API token has these scopes/);
  });

  test('C6: without read:user scope the author is not filtered, but creation proceeds', async () => {
    const calls = stubRoutes(bitbucketRoutes((url) => (url.endsWith('/user') ? { status: 403, body: {} } : undefined)));
    await handleCreateBitbucketPr({ repository: 'acme/web-app', title: 'T', sourceBranch: 'f', reviewers: ['Dien'] });
    assert.deepEqual((postOf(calls)?.body as { reviewers: unknown }).reviewers, [{ uuid: member(0).uuid }]);
  });

  test('C7: 400 surfaces the Bitbucket error message', async () => {
    stubRoutes(() => ({
      status: 400,
      body: { type: 'error', error: { message: 'There are no changes to be pulled' } },
    }));
    const text = (await handleCreateBitbucketPr({ repository: 'acme/web-app', title: 'T', sourceBranch: 'f' }))
      .content[0].text;
    assert.match(text, /API error 400: There are no changes to be pulled/);
  });
});

describe('handleFindBitbucketReviewers', () => {
  test('F1: reports matched, skipped-self, ambiguous and unknown names', async () => {
    stubRoutes(bitbucketRoutes());
    const text = (await handleFindBitbucketReviewers({ names: ['Dien', 'Hanh', 'Dung', 'Zed'] })).content[0].text;
    assert.match(text, /## Reviewer lookup \(acme\)/);
    assert.match(text, /✅ Trần Văn Điền \(@dientv\) \{aaaaaaaa-0000-0000-0000-000000000001\}/);
    assert.match(text, /PR author\) were named — skipped/);
    assert.match(text, /"Dung" matches 2 members/);
    assert.match(text, /"Zed" matches no workspace member/);
  });

  test('F2: an invalid workspace slug is rejected before any request', async () => {
    const calls = stubRoutes(bitbucketRoutes());
    const text = (await handleFindBitbucketReviewers({ names: ['Dien'], workspace: '../x' })).content[0].text;
    assert.equal(calls.length, 0);
    assert.match(text, /Invalid workspace slug/);
  });
});

function comment(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    created_on: '2026-10-01T10:00:00Z',
    content: { raw: `body ${id}` },
    user: { display_name: `user${id}` },
    deleted: false,
    ...extra,
  };
}

describe('handleGetBitbucketPrComments', () => {
  test('M1: follows next links and threads general + inline comments', async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: {
          values: [comment(1), comment(2, { inline: { path: 'src/a.ts', to: 12 } })],
          next: `${API}/repositories/acme/web-app/pullrequests/42/comments?pagelen=100&page=2`,
        },
      },
      {
        status: 200,
        body: {
          values: [
            comment(3, { parent: { id: 2 }, inline: { path: 'src/a.ts', to: 12 } }),
            comment(4, {
              inline: { path: 'src/b.ts', from: 5 },
              resolution: { type: 'comment_resolution', user: { display_name: 'Ann' } },
            }),
          ],
        },
      },
    ]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL })).content[0].text;

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, `${API}/repositories/acme/web-app/pullrequests/42/comments?pagelen=100`);
    assert.match(text, /4 comments in 3 threads · 2 open · 1 resolved/);
    assert.match(text, /### General\n- \*\*#1 · user1 · 2026-10-01 · 🟡 open\*\*\n  > body 1/);
    assert.match(text, /#### `src\/a.ts`\n- \*\*#2 · user2 · 2026-10-01 · line 12 · 🟡 open\*\*/);
    assert.match(text, /  ↳ \*\*#3 · user3 · 2026-10-01\*\*\n    > body 3/);
    assert.match(text, /#4 · user4 · 2026-10-01 · old line 5 · ✅ resolved by Ann/);
  });

  test('M2: includeResolved=false hides resolved threads', async () => {
    stubFetch([
      {
        status: 200,
        body: { values: [comment(1), comment(2, { resolution: { type: 'comment_resolution' } })] },
      },
    ]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL, includeResolved: false })).content[0].text;
    assert.match(text, /#1 /);
    assert.doesNotMatch(text, /#2 /);
  });

  test('M3: deleted comments are hidden unless they carry replies', async () => {
    stubFetch([
      {
        status: 200,
        body: {
          values: [comment(1, { deleted: true }), comment(2, { deleted: true }), comment(3, { parent: { id: 2 } })],
        },
      },
    ]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL })).content[0].text;
    assert.doesNotMatch(text, /#1 /);
    assert.match(text, /#2 [^\n]*\n  > _\(deleted\)_/);
    assert.match(text, /↳ \*\*#3 /);
  });

  test('M4: a next link to another host is never followed', async () => {
    const calls = stubFetch([{ status: 200, body: { values: [comment(1)], next: 'https://evil.example/steal' } }]);
    await handleGetBitbucketPrComments({ input: PR_URL });
    assert.equal(calls.length, 1);
  });

  test('M5: stops at the page cap and says so', async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: { values: [comment(1)], next: `${API}/repositories/acme/web-app/pullrequests/42/comments?page=n` },
      },
    ]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL })).content[0].text;
    assert.equal(calls.length, MAX_PAGES);
    assert.match(text, /Stopped after 20 pages/);
  });

  test('M7: a 403 appends the scopes the tool needs', async () => {
    stubFetch([{ status: 403, body: {} }]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL })).content[0].text;
    assert.match(text, /Access denied \(403\)/);
    assert.match(text, /Check the API token has these scopes: read:pullrequest:bitbucket\./);
  });

  test('M6: 404 maps to a not-found message', async () => {
    stubFetch([{ status: 404, body: { type: 'error', error: { message: 'nope' } } }]);
    const text = (await handleGetBitbucketPrComments({ input: PR_URL })).content[0].text;
    assert.match(text, /Not found/);
  });
});
