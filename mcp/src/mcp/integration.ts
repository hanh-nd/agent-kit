/**
 * Integration Tools - Bitbucket, Jira, Confluence
 * Tools: kit_get_bitbucket_pr, kit_create_bitbucket_pr, kit_find_bitbucket_reviewers, kit_get_bitbucket_pr_comments, kit_jira_get_ticket, kit_confluence_get_page
 */

import { writeFileSync } from 'fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getCredential } from '../services/integration/credentials.js';
import { mcpText } from '../utils/utils.js';
import { adfToMarkdown } from '../services/integration/parser/adf.js';
import { storageToMarkdown } from '../services/integration/parser/storage.js';
import { sanitizeOutput } from '../core/security/index.js';

/**
 * Payload size (chars) at or above which a body is spilled to a temp file
 * instead of inlined into the agent context.
 */
export const LARGE_PAYLOAD_THRESHOLD = 50_000;

// Zod schema for Bitbucket PR REST API response
const BitbucketPrSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']),
  author: z.object({ display_name: z.string(), nickname: z.string() }),
  source: z.object({ branch: z.object({ name: z.string() }) }),
  destination: z.object({ branch: z.object({ name: z.string() }) }),
});

// Response of POST /pullrequests (201). Permissive beyond what the output renders.
const BitbucketCreatedPrSchema = z.object({
  id: z.number(),
  title: z.string(),
  state: z.string().optional(),
  draft: z.boolean().optional(),
  source: z.object({ branch: z.object({ name: z.string() }) }).optional(),
  destination: z.object({ branch: z.object({ name: z.string() }) }).optional(),
  reviewers: z.array(z.object({ display_name: z.string().optional() }).passthrough()).optional(),
  links: z
    .object({ html: z.object({ href: z.string() }).optional() })
    .passthrough()
    .optional(),
});

const BitbucketCommentSchema = z
  .object({
    id: z.number(),
    created_on: z.string().optional(),
    updated_on: z.string().optional(),
    content: z.object({ raw: z.string().nullable().optional() }).passthrough().optional(),
    user: z.object({ display_name: z.string().optional() }).passthrough().nullable().optional(),
    deleted: z.boolean().optional(),
    pending: z.boolean().optional(),
    parent: z.object({ id: z.number() }).passthrough().nullable().optional(),
    inline: z
      .object({
        path: z.string(),
        from: z.number().nullable().optional(),
        to: z.number().nullable().optional(),
        start_from: z.number().nullable().optional(),
        start_to: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    resolution: z
      .object({
        type: z.string().optional(),
        user: z.object({ display_name: z.string().optional() }).passthrough().nullable().optional(),
        created_on: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

type BitbucketComment = z.infer<typeof BitbucketCommentSchema>;

const BitbucketCommentPageSchema = z.object({
  values: z.array(BitbucketCommentSchema),
  next: z.string().optional(),
});

// MEDIUM 2: Jira ticket schema for runtime validation
// ADF (Atlassian Document Format) can have many nested content types
// We use a more permissive schema that accepts any ADF structure
const AdfContentSchema = z
  .object({
    type: z.string().optional(),
    content: z.array(z.unknown()).optional(),
    text: z.string().optional(),
  })
  .passthrough();

const JiraFieldsSchema = z.object({
  summary: z.string(),
  status: z.object({ name: z.string() }).optional(),
  priority: z.object({ name: z.string() }).optional(),
  assignee: z.object({ displayName: z.string() }).nullable().optional(),
  reporter: z.object({ displayName: z.string() }).nullable().optional(),
  issuetype: z.object({ name: z.string() }).optional(),
  // Handle both plain string and ADF (Atlassian Document Format) structures
  description: z
    .union([
      z.string(),
      z
        .object({
          type: z.string().optional(),
          version: z.number().optional(),
          content: z.array(AdfContentSchema).optional(),
        })
        .passthrough(), // Accept any additional ADF fields
    ])
    .nullable()
    .optional(),
  labels: z.array(z.string()).optional(),
});

const JiraTicketSchema = z.object({
  errorMessages: z.array(z.string()).optional(),
  fields: JiraFieldsSchema,
});

// Confluence Cloud REST v2 page schema. Deliberately permissive: only the fields the
// output renders are required, so an additive Atlassian change cannot break the tool.
const ConfluencePageSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().optional(),
  spaceId: z.string().optional(),
  version: z
    .object({
      number: z.number().optional(),
      createdAt: z.string().optional(),
      message: z.string().optional(),
      minorEdit: z.boolean().optional(),
      authorId: z.string().optional(),
    })
    .optional(),
  body: z
    .object({
      storage: z.object({ value: z.string().optional() }).passthrough().optional(),
    })
    .passthrough()
    .optional(),
  labels: z
    .object({ results: z.array(z.object({ name: z.string() }).passthrough()).optional() })
    .passthrough()
    .optional(),
  _links: z.object({ base: z.string().optional(), webui: z.string().optional() }).passthrough().optional(),
});

export type ConfluenceIdResolution =
  | { kind: 'id'; pageId: string }
  | { kind: 'tiny' }
  | { kind: 'blog' }
  | { kind: 'unknown' };

export interface AtlassianContext {
  auth: string;
  cloudId: string;
}

/**
 * API token scopes each tool needs, from Atlassian's OpenAPI specs (`x-atlassian-oauth2-scopes`).
 * Used for 401/403 hints; mcp/README.md lists the same scopes for setup.
 */
export const REQUIRED_SCOPES = {
  // The PR diff endpoint redirects to the repository diff, which needs read:repository.
  kit_get_bitbucket_pr: ['read:pullrequest:bitbucket', 'read:repository:bitbucket'],
  kit_get_bitbucket_pr_comments: ['read:pullrequest:bitbucket'],
  // read:workspace resolves reviewer names; read:user skips the author (optional — degrades, never fails).
  kit_create_bitbucket_pr: [
    'read:pullrequest:bitbucket',
    'write:pullrequest:bitbucket',
    'read:workspace:bitbucket',
    'read:user:bitbucket',
  ],
  kit_find_bitbucket_reviewers: ['read:workspace:bitbucket', 'read:user:bitbucket'],
  kit_jira_get_ticket: ['read:jira-work'],
  kit_confluence_get_page: ['read:page:confluence'],
} as const;

type ScopedTool = keyof typeof REQUIRED_SCOPES;

/** Error text for a tool, with its required scopes appended on 401/403 unless a scope is already named. */
function errorText(error: unknown, tool: ScopedTool): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\((401|403)\)/.test(message) || message.includes(':bitbucket') || message.includes('scope')) return message;
  return `${message}\n\nCheck the API token has these scopes: ${REQUIRED_SCOPES[tool].join(', ')}.`;
}

function buildBasicAuth(emailVar: string, tokenVar: string): string {
  const email = getCredential(emailVar);
  const token = getCredential(tokenVar);
  if (!email || !token) throw new Error(`Missing ${emailVar} or ${tokenVar}`);
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// Jira and Confluence share one site and one account, so they share ATLASSIAN_CLOUD_ID
// and ATLASSIAN_USER_EMAIL — but Atlassian issues scoped API tokens per app, so each
// product carries its own token.
const PRODUCT_TOKEN_KEY: Record<'jira' | 'confluence', string> = {
  jira: 'JIRA_API_TOKEN',
  confluence: 'CONFLUENCE_API_TOKEN',
};

/** Resolve the shared cloud id plus the product's basic-auth header (shared email, own token). */
export function buildAtlassianContext(product: 'jira' | 'confluence'): AtlassianContext {
  const cloudId = getCredential('ATLASSIAN_CLOUD_ID');
  if (!cloudId) throw new Error('Missing ATLASSIAN_CLOUD_ID');

  return { auth: buildBasicAuth('ATLASSIAN_USER_EMAIL', PRODUCT_TOKEN_KEY[product]), cloudId };
}

async function callRestApi(url: string, auth: string, accept = 'application/json', body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: auth, Accept: accept };
  const init: RequestInit = { headers };
  if (body !== undefined) {
    init.method = 'POST';
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  if (resp.status === 401) throw new Error(`❌ Auth failed (401): ${url}`);
  if (resp.status === 403)
    throw new Error(`❌ Access denied (403): ${url}\n\nYou lack permission for this resource, or it is restricted.`);
  if (resp.status === 404) throw new Error(`❌ Not found: ${url}`);
  if (!resp.ok) throw new Error(`❌ API error ${resp.status}: ${extractApiError(await resp.text())}`);
  return accept === 'text/plain' ? resp.text() : resp.json();
}

/** Bitbucket errors arrive as `{ type: 'error', error: { message, detail?, fields? } }`; surface the readable parts. */
function extractApiError(text: string): string {
  try {
    const err = (JSON.parse(text) as { error?: { message?: unknown; detail?: unknown; fields?: unknown } }).error;
    if (err && typeof err.message === 'string') {
      const parts = [err.message];
      if (typeof err.detail === 'string' && err.detail) parts.push(err.detail);
      if (err.fields && typeof err.fields === 'object') parts.push(JSON.stringify(err.fields));
      return parts.join('\n');
    }
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return text;
}

const CONFLUENCE_INPUT_FORMS = [
  'Accepted input forms:',
  '  • https://<site>.atlassian.net/wiki/spaces/<SPACEKEY>/pages/<pageId>/<Title>',
  '  • https://<site>.atlassian.net/pages/viewpage.action?pageId=<pageId>',
  '  • a bare numeric page ID (e.g. 123456789)',
].join('\n');

/**
 * Resolve a user-supplied Confluence reference to a numeric page id.
 *
 * The blog branch MUST stay ahead of numeric extraction: a blog URL carries date and
 * post-id segments that generic extraction would misread as a page id, silently
 * fetching the wrong content.
 */
export function resolveConfluencePageId(input: string): ConfluenceIdResolution {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'unknown' };

  if (/\/blog(?:posts?)?\//.test(trimmed)) return { kind: 'blog' };
  if (/\/wiki\/x\/[A-Za-z0-9]+/.test(trimmed)) return { kind: 'tiny' };

  const spacesPageMatch = trimmed.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)(?:[/?#]|$)/);
  if (spacesPageMatch) return { kind: 'id', pageId: spacesPageMatch[1] };

  const queryMatch = trimmed.match(/[?&]pageId=(\d+)(?:[&#]|$)/);
  if (queryMatch) return { kind: 'id', pageId: queryMatch[1] };

  if (/^\d+$/.test(trimmed)) return { kind: 'id', pageId: trimmed };

  return { kind: 'unknown' };
}

function buildConfluenceHeader(page: z.infer<typeof ConfluencePageSchema>, absoluteUrl: string): string {
  const webui = page._links?.webui ?? '';
  const spaceKey = webui.match(/\/spaces\/([^/]+)\//)?.[1];

  const lines = [`## 📄 ${page.title}`, '', `**Status:** ${page.status || 'Unknown'}`];
  if (spaceKey) lines.push(`**Space:** ${spaceKey}`);
  lines.push(`**Version:** ${page.version?.number ?? 'Unknown'}`);
  lines.push(`**Last updated:** ${page.version?.createdAt || 'Unknown'}`);
  lines.push(`**URL:** ${absoluteUrl || 'Unknown'}`);

  return lines.join('\n');
}

/**
 * Handler for kit_confluence_get_page. Exported (rather than living inside the
 * registerTool closure) so behaviour is unit testable without a transport or network.
 * Never rejects — every failure path resolves to an actionable mcpText message.
 */
export async function handleConfluenceGetPage(args: {
  input: string;
}): Promise<{ content: [{ type: 'text'; text: string }] }> {
  try {
    const resolution = resolveConfluencePageId(args.input);
    if (resolution.kind === 'tiny') {
      return mcpText(
        `❌ Confluence tiny links cannot be resolved without following a redirect.\n\nOpen the link in a browser and pass the full page URL instead.\n\n${CONFLUENCE_INPUT_FORMS}`,
      );
    }
    if (resolution.kind === 'blog') {
      return mcpText(
        `❌ Confluence blog posts are not supported — they live on a different endpoint than pages.\n\n${CONFLUENCE_INPUT_FORMS}`,
      );
    }
    if (resolution.kind === 'unknown') {
      return mcpText(`❌ Could not extract a Confluence page ID from: ${args.input}\n\n${CONFLUENCE_INPUT_FORMS}`);
    }

    const { auth, cloudId } = buildAtlassianContext('confluence');
    const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${resolution.pageId}?body-format=storage&include-labels=true&include-version=true`;
    const jsonData = await callRestApi(url, auth);

    const parseResult = ConfluencePageSchema.safeParse(jsonData);
    if (!parseResult.success) {
      return mcpText(`❌ Invalid Confluence response format: ${parseResult.error.message}`);
    }
    const page = parseResult.data;

    const base = page._links?.base ?? '';
    const webui = page._links?.webui ?? '';
    const absoluteUrl = base && webui ? `${base}${webui}` : base || webui;
    const markdown = storageToMarkdown(page.body?.storage?.value);

    let contentSection: string;
    if (!markdown.trim()) {
      contentSection = `⚠️ Confluence returned no readable body for this page (status: ${page.status || 'Unknown'}). Open ${absoluteUrl || 'the page in Confluence'} to view it directly.`;
    } else if (markdown.length >= LARGE_PAYLOAD_THRESHOLD) {
      const filePath = `/tmp/kit-confluence-${resolution.pageId}-${Date.now()}.md`;
      try {
        writeFileSync(filePath, sanitizeOutput(markdown), 'utf8');
        contentSection = `Content is large (${markdown.length} chars). Full markdown written to: \`${filePath}\`. Read this file before proceeding.`;
      } catch {
        contentSection = `⚠️ Could not write page content to a temp file. Showing inline (may be very large).\n\n${markdown}`;
      }
    } else {
      contentSection = markdown;
    }

    const labels = page.labels?.results?.map((label) => label.name).filter((name) => name.length > 0) ?? [];

    const output = `${buildConfluenceHeader(page, absoluteUrl)}

### Content
${contentSection}

### Labels
${labels.length > 0 ? labels.join(', ') : 'None'}`;

    return mcpText(sanitizeOutput(output));
  } catch (error) {
    return mcpText(`Error: ${errorText(error, 'kit_confluence_get_page')}`);
  }
}

const BITBUCKET_API = 'https://api.bitbucket.org/2.0';
// Dot-only slugs ("." / "..") would let the request path climb out of /repositories/.
const BITBUCKET_SLUG = /^(?!\.+$)[A-Za-z0-9._-]+$/;
/** Safety cap on followed pagination pages (100 items each). */
export const MAX_PAGES = 20;

export type BitbucketRef<T> = ({ ok: true } & T) | { ok: false; error: string };

const MISSING_WORKSPACE = `❌ workspace is required. Pass it as a parameter or set BITBUCKET_DEFAULT_WORKSPACE in your MCP env config.`;

function checkSlugs(ws: string, repo: string): string | undefined {
  if (!BITBUCKET_SLUG.test(ws)) return `❌ Invalid workspace slug: ${ws}`;
  if (!BITBUCKET_SLUG.test(repo)) return `❌ Invalid repo slug: ${repo}`;
  return undefined;
}

/** Resolve a PR URL, or a numeric PR id plus workspace/repoSlug, to its coordinates. */
export function resolveBitbucketPr(
  input: string,
  workspace?: string,
  repoSlug?: string,
): BitbucketRef<{ ws: string; repo: string; prId: number }> {
  const trimmed = input.trim();
  let ws: string | undefined;
  let repo: string | undefined;
  let prId: number | undefined;

  const urlMatch = trimmed.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
  if (urlMatch) {
    ws = urlMatch[1];
    repo = urlMatch[2];
    prId = parseInt(urlMatch[3], 10);
  } else if (/^\d+$/.test(trimmed)) {
    prId = parseInt(trimmed, 10);
    ws = workspace || getCredential('BITBUCKET_DEFAULT_WORKSPACE');
    repo = repoSlug;
  }

  if (!ws) return { ok: false, error: MISSING_WORKSPACE };
  if (!repo || !prId) {
    return { ok: false, error: `❌ Could not parse PR URL. Expected: bitbucket.org/{ws}/{repo}/pull-requests/{id}` };
  }
  const slugError = checkSlugs(ws, repo);
  if (slugError) return { ok: false, error: slugError };
  return { ok: true, ws, repo, prId };
}

/** Resolve a repo URL, `workspace/repo`, or a bare repo slug (plus workspace or default) to its coordinates. */
export function resolveBitbucketRepo(
  repository: string,
  workspace?: string,
): BitbucketRef<{ ws: string; repo: string }> {
  const trimmed = repository.trim().replace(/\.git$/, '');
  let ws: string | undefined;
  let repo: string | undefined;

  const urlMatch = trimmed.match(/bitbucket\.org[/:]([^/]+)\/([^/?#]+)/);
  const pairMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (urlMatch) {
    ws = urlMatch[1];
    repo = urlMatch[2];
  } else if (pairMatch) {
    ws = pairMatch[1];
    repo = pairMatch[2];
  } else if (trimmed) {
    ws = workspace || getCredential('BITBUCKET_DEFAULT_WORKSPACE');
    repo = trimmed;
  }

  if (!repo) {
    return { ok: false, error: `❌ repository is required: a Bitbucket repo URL, "workspace/repo", or a repo slug.` };
  }
  if (!ws) return { ok: false, error: MISSING_WORKSPACE };
  const slugError = checkSlugs(ws, repo);
  if (slugError) return { ok: false, error: slugError };
  return { ok: true, ws, repo };
}

/** Bitbucket expects reviewer UUIDs wrapped in braces: `{xxxxxxxx-...}`. */
function normalizeReviewerUuid(raw: string): string | undefined {
  const bare = raw.trim().replace(/^\{|\}$/g, '');
  return /^[0-9a-fA-F-]{36}$/.test(bare) ? `{${bare}}` : undefined;
}

const BitbucketMembersPageSchema = z.object({
  values: z.array(
    z
      .object({
        user: z
          .object({ uuid: z.string(), display_name: z.string().optional(), nickname: z.string().optional() })
          .passthrough(),
      })
      .passthrough(),
  ),
  next: z.string().optional(),
});

export interface BitbucketMember {
  uuid: string;
  displayName: string;
  nickname?: string;
}

export interface ReviewerResolution {
  resolved: Array<{ query: string; member: BitbucketMember }>;
  ambiguous: Array<{ query: string; candidates: BitbucketMember[] }>;
  unmatched: string[];
}

/** Lowercase and strip diacritics so "Dũng" matches "Dung" and "Đức" matches "Duc". */
export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Match reviewer queries against workspace members. A query matches a member by exact
 * display name / nickname first; failing that, when every word of the query is a whole
 * word of the member's name ("Dung" → "Nguyen Tien Dung"). More than one hit is ambiguous —
 * never guessed. UUID queries must be resolved by the caller before this runs.
 */
export function matchReviewers(queries: string[], members: BitbucketMember[]): ReviewerResolution {
  const result: ReviewerResolution = { resolved: [], ambiguous: [], unmatched: [] };
  for (const query of queries) {
    const q = normalizeName(query);
    const qTokens = nameTokens(query);
    if (qTokens.length === 0) continue;

    let hits = members.filter(
      (m) => normalizeName(m.displayName) === q || (m.nickname !== undefined && normalizeName(m.nickname) === q),
    );
    if (hits.length === 0) {
      hits = members.filter((m) => {
        const words = new Set([...nameTokens(m.displayName), ...nameTokens(m.nickname ?? '')]);
        return qTokens.every((t) => words.has(t));
      });
    }

    if (hits.length === 1) result.resolved.push({ query, member: hits[0] });
    else if (hits.length > 1) result.ambiguous.push({ query, candidates: hits });
    else result.unmatched.push(query);
  }
  return result;
}

async function fetchWorkspaceMembers(ws: string, auth: string): Promise<BitbucketMember[]> {
  let url: string | undefined = `${BITBUCKET_API}/workspaces/${ws}/members?pagelen=100`;
  const members: BitbucketMember[] = [];
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    let data: unknown;
    try {
      data = await callRestApi(url, auth);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message}\n\nLooking up reviewers by name lists workspace members — the API token needs the read:workspace:bitbucket scope.`,
      );
    }
    const parseResult = BitbucketMembersPageSchema.safeParse(data);
    if (!parseResult.success) throw new Error(`❌ Invalid workspace members response: ${parseResult.error.message}`);
    for (const { user } of parseResult.data.values) {
      members.push({ uuid: user.uuid, displayName: user.display_name ?? '', nickname: user.nickname });
    }
    pages++;
    url = parseResult.data.next?.startsWith(`${BITBUCKET_API}/`) ? parseResult.data.next : undefined;
  }
  return members;
}

/** UUID of the token owner, or undefined when the token lacks read:user:bitbucket. */
async function fetchCurrentUserUuid(auth: string): Promise<string | undefined> {
  try {
    const data = (await callRestApi(`${BITBUCKET_API}/user`, auth)) as { uuid?: unknown };
    return typeof data.uuid === 'string' ? data.uuid : undefined;
  } catch {
    return undefined;
  }
}

interface ReviewerLookup {
  /** Deduplicated reviewers, the token owner removed. */
  reviewers: BitbucketMember[];
  /** True when the token owner was named and dropped — Bitbucket rejects the author as reviewer. */
  skippedSelf: boolean;
  ambiguous: ReviewerResolution['ambiguous'];
  unmatched: string[];
}

/** Resolve names, nicknames or UUIDs to workspace members. Members are fetched only when a name is given. */
async function lookupReviewers(ws: string, auth: string, queries: string[]): Promise<ReviewerLookup> {
  const byUuid: BitbucketMember[] = [];
  const names: string[] = [];
  for (const query of queries) {
    const uuid = normalizeReviewerUuid(query);
    if (uuid) byUuid.push({ uuid, displayName: uuid });
    else if (query.trim()) names.push(query);
  }

  const [members, selfUuid] = await Promise.all([
    names.length > 0 ? fetchWorkspaceMembers(ws, auth) : Promise.resolve([]),
    fetchCurrentUserUuid(auth),
  ]);
  const match = matchReviewers(names, members);

  const seen = new Set<string>();
  const reviewers: BitbucketMember[] = [];
  let skippedSelf = false;
  for (const member of [...byUuid, ...match.resolved.map((r) => r.member)]) {
    const key = member.uuid.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (selfUuid && key === selfUuid.toLowerCase()) {
      skippedSelf = true;
      continue;
    }
    reviewers.push(member);
  }
  return { reviewers, skippedSelf, ambiguous: match.ambiguous, unmatched: match.unmatched };
}

function describeMember(member: BitbucketMember): string {
  return `${member.displayName}${member.nickname ? ` (@${member.nickname})` : ''} ${member.uuid}`;
}

/** Markdown lines for names that did not resolve to exactly one member. */
function describeReviewerProblems(lookup: Pick<ReviewerLookup, 'ambiguous' | 'unmatched'>): string[] {
  const lines: string[] = [];
  for (const { query, candidates } of lookup.ambiguous) {
    lines.push(`- ❓ "${query}" matches ${candidates.length} members — use a fuller name or a UUID:`);
    for (const candidate of candidates.slice(0, 10)) lines.push(`  - ${describeMember(candidate)}`);
    if (candidates.length > 10) lines.push(`  - …and ${candidates.length - 10} more`);
  }
  for (const query of lookup.unmatched) lines.push(`- ❌ "${query}" matches no workspace member`);
  return lines;
}

export interface FindBitbucketReviewersArgs {
  names: string[];
  workspace?: string;
}

/**
 * Handler for kit_find_bitbucket_reviewers: dry-run of the reviewer resolution that
 * kit_create_bitbucket_pr performs, so callers can verify names before pushing anything.
 * Never rejects — every failure path resolves to an actionable mcpText message.
 */
export async function handleFindBitbucketReviewers(
  args: FindBitbucketReviewersArgs,
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  try {
    const ws = args.workspace?.trim() || getCredential('BITBUCKET_DEFAULT_WORKSPACE');
    if (!ws) return mcpText(MISSING_WORKSPACE);
    if (!BITBUCKET_SLUG.test(ws)) return mcpText(`❌ Invalid workspace slug: ${ws}`);
    if (args.names.every((name) => !name.trim())) return mcpText('❌ names is required.');

    const auth = buildBasicAuth('BITBUCKET_USER_EMAIL', 'BITBUCKET_API_TOKEN');
    const lookup = await lookupReviewers(ws, auth, args.names);

    const lines = [`## Reviewer lookup (${ws})`];
    for (const member of lookup.reviewers) lines.push(`- ✅ ${describeMember(member)}`);
    if (lookup.skippedSelf) lines.push('- ⏭️ You (the PR author) were named — skipped, Bitbucket rejects self-review');
    lines.push(...describeReviewerProblems(lookup));
    return mcpText(lines.join('\n'));
  } catch (error) {
    return mcpText(errorText(error, 'kit_find_bitbucket_reviewers'));
  }
}

export interface CreateBitbucketPrArgs {
  repository: string;
  workspace?: string;
  title: string;
  sourceBranch: string;
  destinationBranch?: string;
  description?: string;
  closeSourceBranch?: boolean;
  draft?: boolean;
  reviewers?: string[];
}

/**
 * Handler for kit_create_bitbucket_pr. Exported so it is unit testable without a transport.
 * Never rejects — every failure path resolves to an actionable mcpText message.
 */
export async function handleCreateBitbucketPr(
  args: CreateBitbucketPrArgs,
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  try {
    const ref = resolveBitbucketRepo(args.repository, args.workspace);
    if (!ref.ok) return mcpText(ref.error);

    const title = args.title.trim();
    const sourceBranch = args.sourceBranch.trim();
    if (!title) return mcpText('❌ title is required.');
    if (!sourceBranch) return mcpText('❌ sourceBranch is required.');

    const auth = buildBasicAuth('BITBUCKET_USER_EMAIL', 'BITBUCKET_API_TOKEN');

    // Resolve every reviewer before creating anything: one bad name aborts with no PR made.
    let reviewerUuids: string[] = [];
    let skippedSelf = false;
    if (args.reviewers && args.reviewers.some((r) => r.trim())) {
      const lookup = await lookupReviewers(ref.ws, auth, args.reviewers);
      const problems = describeReviewerProblems(lookup);
      if (problems.length > 0) {
        return mcpText(
          `❌ PR not created — some reviewers did not resolve to exactly one member:\n${problems.join('\n')}`,
        );
      }
      reviewerUuids = lookup.reviewers.map((member) => member.uuid);
      skippedSelf = lookup.skippedSelf;
    }

    // Omitted destination defaults to the repository's main branch (Bitbucket behaviour).
    const body: Record<string, unknown> = { title, source: { branch: { name: sourceBranch } } };
    const destinationBranch = args.destinationBranch?.trim();
    if (destinationBranch) body.destination = { branch: { name: destinationBranch } };
    if (args.description) body.description = args.description;
    if (args.closeSourceBranch !== undefined) body.close_source_branch = args.closeSourceBranch;
    if (args.draft !== undefined) body.draft = args.draft;
    if (reviewerUuids.length > 0) body.reviewers = reviewerUuids.map((uuid) => ({ uuid }));

    const url = `${BITBUCKET_API}/repositories/${ref.ws}/${ref.repo}/pullrequests`;
    const jsonData = await callRestApi(url, auth, 'application/json', body);

    const parseResult = BitbucketCreatedPrSchema.safeParse(jsonData);
    if (!parseResult.success) {
      return mcpText(`⚠️ PR was likely created, but the response could not be parsed: ${parseResult.error.message}`);
    }
    const pr = parseResult.data;
    const reviewers = pr.reviewers?.map((r) => r.display_name).filter(Boolean) ?? [];

    const lines = [
      `✅ Created PR #${pr.id}: ${pr.title}`,
      `**URL:** ${pr.links?.html?.href ?? `https://bitbucket.org/${ref.ws}/${ref.repo}/pull-requests/${pr.id}`}`,
      `**Branch:** ${pr.source?.branch.name ?? sourceBranch} → ${pr.destination?.branch.name ?? destinationBranch ?? '(main branch)'}`,
      `**State:** ${pr.state ?? 'OPEN'}${pr.draft ? ' (draft)' : ''}`,
    ];
    if (reviewers.length > 0) lines.push(`**Reviewers:** ${reviewers.join(', ')}`);
    if (skippedSelf)
      lines.push('⏭️ You (the PR author) were named as a reviewer — skipped, Bitbucket rejects self-review.');

    return mcpText(lines.join('\n'));
  } catch (error) {
    return mcpText(errorText(error, 'kit_create_bitbucket_pr'));
  }
}

function describeInlineAnchor(inline: NonNullable<BitbucketComment['inline']>): string {
  if (inline.to) {
    return inline.start_to && inline.start_to !== inline.to
      ? `lines ${inline.start_to}–${inline.to}`
      : `line ${inline.to}`;
  }
  if (inline.from) {
    return inline.start_from && inline.start_from !== inline.from
      ? `old lines ${inline.start_from}–${inline.from}`
      : `old line ${inline.from}`;
  }
  return 'file';
}

function renderComment(comment: BitbucketComment, depth: number, isRoot: boolean): string {
  const indent = '  '.repeat(depth);
  const meta = [`#${comment.id}`, comment.user?.display_name || 'Unknown', comment.created_on?.slice(0, 10) ?? ''];
  if (isRoot && comment.inline) meta.push(describeInlineAnchor(comment.inline));
  if (comment.pending) meta.push('pending (unpublished)');
  if (isRoot) {
    meta.push(
      comment.resolution
        ? `✅ resolved${comment.resolution.user?.display_name ? ` by ${comment.resolution.user.display_name}` : ''}`
        : '🟡 open',
    );
  }

  const header = `${indent}${depth > 0 ? '↳ ' : '- '}**${meta.filter(Boolean).join(' · ')}**`;
  const raw = comment.deleted ? '_(deleted)_' : comment.content?.raw?.trim() || '_(empty)_';
  const body = raw
    .split('\n')
    .map((line) => `${indent}  > ${line}`)
    .join('\n');
  return `${header}\n${body}`;
}

export interface GetBitbucketPrCommentsArgs {
  input: string;
  workspace?: string;
  repoSlug?: string;
  includeResolved?: boolean;
  includeDeleted?: boolean;
}

/**
 * Handler for kit_get_bitbucket_pr_comments. Follows `next` links (pagelen=100) up to
 * MAX_PAGES, then renders threads: general comments first, inline ones grouped by file.
 * Never rejects — every failure path resolves to an actionable mcpText message.
 */
export async function handleGetBitbucketPrComments(
  args: GetBitbucketPrCommentsArgs,
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  try {
    const ref = resolveBitbucketPr(args.input, args.workspace, args.repoSlug);
    if (!ref.ok) return mcpText(ref.error);
    const includeResolved = args.includeResolved ?? true;
    const includeDeleted = args.includeDeleted ?? false;

    const auth = buildBasicAuth('BITBUCKET_USER_EMAIL', 'BITBUCKET_API_TOKEN');
    let url: string | undefined =
      `${BITBUCKET_API}/repositories/${ref.ws}/${ref.repo}/pullrequests/${ref.prId}/comments?pagelen=100`;
    const comments: BitbucketComment[] = [];
    let pages = 0;
    while (url && pages < MAX_PAGES) {
      const parseResult = BitbucketCommentPageSchema.safeParse(await callRestApi(url, auth));
      if (!parseResult.success) {
        return mcpText(`❌ Invalid Bitbucket comments response: ${parseResult.error.message}`);
      }
      comments.push(...parseResult.data.values);
      pages++;
      // Never forward credentials to a host other than the Bitbucket API.
      url = parseResult.data.next?.startsWith(`${BITBUCKET_API}/`) ? parseResult.data.next : undefined;
    }
    const truncated = Boolean(url);

    const byId = new Map(comments.map((c) => [c.id, c]));
    const children = new Map<number, BitbucketComment[]>();
    const roots: BitbucketComment[] = [];
    for (const comment of comments) {
      const parentId = comment.parent?.id;
      // A reply whose parent was not returned is promoted to a root so it is never lost.
      if (parentId !== undefined && byId.has(parentId)) {
        children.set(parentId, [...(children.get(parentId) ?? []), comment]);
      } else {
        roots.push(comment);
      }
    }

    const renderThread = (comment: BitbucketComment, depth: number): string[] => {
      const replies = (children.get(comment.id) ?? []).flatMap((child) => renderThread(child, depth + 1));
      // Skip a deleted comment unless asked, but keep it as a stub when live replies hang off it.
      if (comment.deleted && !includeDeleted && replies.length === 0) return [];
      return [renderComment(comment, depth, depth === 0), ...replies];
    };

    const visibleRoots = roots.filter((root) => includeResolved || !root.resolution);
    const general: string[] = [];
    const inlineByFile = new Map<string, string[]>();
    for (const root of visibleRoots) {
      const rendered = renderThread(root, 0);
      if (rendered.length === 0) continue;
      if (root.inline) {
        inlineByFile.set(root.inline.path, [...(inlineByFile.get(root.inline.path) ?? []), ...rendered]);
      } else {
        general.push(...rendered);
      }
    }

    const liveRoots = roots.filter((root) => !root.deleted);
    const unresolved = liveRoots.filter((root) => !root.resolution).length;
    const summary = `${comments.length} comments in ${liveRoots.length} threads · ${unresolved} open · ${liveRoots.length - unresolved} resolved`;

    let output = `## PR #${ref.prId} comments\n${summary}${includeResolved ? '' : ' (resolved threads hidden)'}`;
    if (truncated) {
      output += `\n\n⚠️ Stopped after ${MAX_PAGES} pages (${comments.length} comments); later comments are not shown.`;
    }
    if (general.length === 0 && inlineByFile.size === 0) {
      output += '\n\nNo comments to show.';
    } else {
      if (general.length > 0) output += `\n\n### General\n${general.join('\n')}`;
      if (inlineByFile.size > 0) {
        output += '\n\n### Inline';
        for (const [path, rendered] of inlineByFile) output += `\n\n#### \`${path}\`\n${rendered.join('\n')}`;
      }
    }

    if (output.length >= LARGE_PAYLOAD_THRESHOLD) {
      const filePath = `/tmp/kit-pr-${ref.prId}-comments-${Date.now()}.md`;
      try {
        writeFileSync(filePath, sanitizeOutput(output), 'utf8');
        return mcpText(
          `## PR #${ref.prId} comments\n${summary}\n\nComments are large (${output.length} chars). Full markdown written to: \`${filePath}\`. Read this file before proceeding.`,
        );
      } catch {
        // Fall through and inline.
      }
    }
    return mcpText(sanitizeOutput(output));
  } catch (error) {
    return mcpText(errorText(error, 'kit_get_bitbucket_pr_comments'));
  }
}

export function registerIntegrationTools(server: McpServer): void {
  // TOOL: GET BITBUCKET PR
  server.registerTool(
    'kit_get_bitbucket_pr',
    {
      title: 'Get Bitbucket PR',
      description:
        'Get Bitbucket PR details and optionally the diff. Accepts a full PR URL or a numeric PR ID with workspace + repoSlug.',
      inputSchema: {
        input: z.string().describe('Bitbucket PR URL or numeric PR ID'),
        workspace: z
          .string()
          .optional()
          .describe('Bitbucket workspace slug (required for numeric ID if BITBUCKET_DEFAULT_WORKSPACE not set)'),
        repoSlug: z.string().optional().describe('Bitbucket repo slug (required for numeric ID)'),
        includeDiff: z.boolean().optional().default(true).describe('Include unified diff in response'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ input, workspace, repoSlug, includeDiff }) => {
      try {
        const ref = resolveBitbucketPr(input, workspace, repoSlug);
        if (!ref.ok) return mcpText(ref.error);
        const { ws: safeWs, repo: safeRepo, prId } = ref;
        const auth = buildBasicAuth('BITBUCKET_USER_EMAIL', 'BITBUCKET_API_TOKEN');

        const prUrl = `https://api.bitbucket.org/2.0/repositories/${safeWs}/${safeRepo}/pullrequests/${prId}`;
        const jsonData = await callRestApi(prUrl, auth);

        const parseResult = BitbucketPrSchema.safeParse(jsonData);
        if (!parseResult.success) {
          throw new Error(`Failed to parse PR response: ${parseResult.error.message}`);
        }
        const pr = parseResult.data;

        let output = `## PR #${pr.id}: ${pr.title}
**State:** ${pr.state}  **Author:** ${pr.author.display_name}
**Branch:** ${pr.source.branch.name} → ${pr.destination.branch.name}

### Description
${pr.description || 'No description'}`;

        if (includeDiff) {
          const diffUrl = `https://api.bitbucket.org/2.0/repositories/${safeWs}/${safeRepo}/pullrequests/${prId}/diff`;
          const diff = (await callRestApi(diffUrl, auth, 'text/plain')) as string;

          if (diff.length < LARGE_PAYLOAD_THRESHOLD) {
            output += `\n\n### Diff\n\`\`\`diff\n${diff}\n\`\`\``;
          } else {
            const filePath = `/tmp/kit-pr-${prId}-${Date.now()}.diff`;
            try {
              writeFileSync(filePath, diff, 'utf8');
              output += `\n\n### Diff\nDiff is large (${diff.length} chars). Full diff written to: \`${filePath}\`. Read this file before reviewing.`;
            } catch {
              output += `\n\n### Diff\n⚠️ Could not write diff to temp file. Showing inline (may be very large).\n\`\`\`diff\n${diff}\n\`\`\``;
            }
          }
        }

        return mcpText(output);
      } catch (error) {
        return mcpText(errorText(error, 'kit_get_bitbucket_pr'));
      }
    },
  );

  // TOOL: CREATE BITBUCKET PR
  server.registerTool(
    'kit_create_bitbucket_pr',
    {
      title: 'Create Bitbucket PR',
      description:
        'Create a Bitbucket Cloud pull request from an already-pushed source branch. If destinationBranch is omitted, Bitbucket targets the repository main branch. Returns the new PR id and URL.',
      inputSchema: {
        repository: z
          .string()
          .describe(
            'Bitbucket repo URL, "workspace/repo", or a repo slug (uses workspace / BITBUCKET_DEFAULT_WORKSPACE)',
          ),
        workspace: z.string().optional().describe('Bitbucket workspace slug, used when repository is a bare slug'),
        title: z.string().describe('PR title'),
        sourceBranch: z.string().describe('Source branch name (must already exist on the remote)'),
        destinationBranch: z.string().optional().describe('Destination branch name; defaults to the repo main branch'),
        description: z.string().optional().describe('PR description (markdown)'),
        closeSourceBranch: z.boolean().optional().describe('Close the source branch when the PR is merged'),
        draft: z.boolean().optional().describe('Create the PR as a draft'),
        reviewers: z
          .array(z.string())
          .optional()
          .describe(
            'Reviewers as names, nicknames or account UUIDs, e.g. ["Dien", "Nguyen Tien Dung"]. Matching is case- and accent-insensitive; a name that matches no member or several aborts with no PR created. The PR author is skipped.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => handleCreateBitbucketPr(args),
  );

  // TOOL: FIND BITBUCKET REVIEWERS
  server.registerTool(
    'kit_find_bitbucket_reviewers',
    {
      title: 'Find Bitbucket Reviewers',
      description:
        'Resolve reviewer names, nicknames or UUIDs to Bitbucket workspace members — the same matching kit_create_bitbucket_pr uses. Reports matched, ambiguous (with candidates) and unknown names, so reviewers can be verified before pushing or creating a PR.',
      inputSchema: {
        names: z.array(z.string()).describe('Names, nicknames or account UUIDs, e.g. ["Dien", "Dung"]'),
        workspace: z.string().optional().describe('Bitbucket workspace slug (defaults to BITBUCKET_DEFAULT_WORKSPACE)'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) => handleFindBitbucketReviewers(args),
  );

  // TOOL: GET BITBUCKET PR COMMENTS
  server.registerTool(
    'kit_get_bitbucket_pr_comments',
    {
      title: 'Get Bitbucket PR Comments',
      description:
        'Get all comments on a Bitbucket PR as threads: general comments, then inline comments grouped by file with line anchors and resolved/open status. Accepts a full PR URL or a numeric PR ID with workspace + repoSlug.',
      inputSchema: {
        input: z.string().describe('Bitbucket PR URL or numeric PR ID'),
        workspace: z
          .string()
          .optional()
          .describe('Bitbucket workspace slug (required for numeric ID if BITBUCKET_DEFAULT_WORKSPACE not set)'),
        repoSlug: z.string().optional().describe('Bitbucket repo slug (required for numeric ID)'),
        includeResolved: z.boolean().optional().default(true).describe('Include resolved threads'),
        includeDeleted: z.boolean().optional().default(false).describe('Include deleted comments'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) => handleGetBitbucketPrComments(args),
  );

  // TOOL: JIRA GET TICKET
  server.registerTool(
    'kit_jira_get_ticket',
    {
      title: 'Get Jira Ticket',
      description: 'Get ticket details from Jira using the Atlassian REST API',
      inputSchema: {
        ticketId: z.string().describe('Jira ticket ID (e.g., PROJ-123)'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ ticketId }) => {
      try {
        const safeTicketId = ticketId.match(/^[A-Z]+-\d+$/)?.[0];
        if (!safeTicketId) {
          return mcpText(`❌ Invalid ticket ID format: ${ticketId}\n\nExpected format: PROJ-123`);
        }

        const { auth, cloudId } = buildAtlassianContext('jira');
        const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${safeTicketId}`;
        const jsonData = await callRestApi(url, auth);

        const parseResult = JiraTicketSchema.safeParse(jsonData);
        if (!parseResult.success) {
          return mcpText(`❌ Invalid Jira response format: ${parseResult.error.message}`);
        }
        const ticket = parseResult.data;

        if (ticket.errorMessages && ticket.errorMessages.length > 0) {
          return mcpText(`❌ Ticket not found: ${ticketId}\n\n${ticket.errorMessages.join('\n')}`);
        }

        const output = `## 🎫 ${ticketId}: ${ticket.fields.summary}

**Status:** ${ticket.fields.status?.name || 'Unknown'}
**Priority:** ${ticket.fields.priority?.name || 'None'}
**Assignee:** ${ticket.fields.assignee?.displayName || 'Unassigned'}
**Reporter:** ${ticket.fields.reporter?.displayName || 'Unknown'}
**Type:** ${ticket.fields.issuetype?.name || 'Unknown'}

### Description
${typeof ticket.fields.description === 'string' ? ticket.fields.description : adfToMarkdown(ticket.fields.description)}

### Labels
${ticket.fields.labels?.join(', ') || 'None'}`;

        return mcpText(output);
      } catch (error) {
        return mcpText(`Error: ${errorText(error, 'kit_jira_get_ticket')}`);
      }
    },
  );

  // TOOL: CONFLUENCE GET PAGE
  server.registerTool(
    'kit_confluence_get_page',
    {
      title: 'Get Confluence Page',
      description:
        'Get a Confluence page as markdown using the Atlassian REST API. Accepts a full Confluence page URL or a numeric page ID.',
      inputSchema: {
        input: z.string().describe('Confluence page URL or numeric page ID'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ input }) => handleConfluenceGetPage({ input }),
  );
}
