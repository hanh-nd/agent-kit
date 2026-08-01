/**
 * Integration Tools - Bitbucket, Jira, Confluence
 * Tools: kit_get_bitbucket_pr, kit_jira_get_ticket, kit_confluence_get_page
 */

import { writeFileSync } from 'fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getCredential } from '../services/integration/credentials.js';
import { mcpText } from '../utils/utils.js';
import { adfToMarkdown } from '../services/integration/parser/adf.js';
import { storageToMarkdown } from '../services/integration/parser/storage.js';
import { sanitize, sanitizeOutput } from '../core/security/index.js';

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

async function callRestApi(url: string, auth: string, accept = 'application/json'): Promise<unknown> {
  const resp = await fetch(url, { headers: { Authorization: auth, Accept: accept } });
  if (resp.status === 401) throw new Error(`❌ Auth failed (401): ${url}`);
  if (resp.status === 403)
    throw new Error(`❌ Access denied (403): ${url}\n\nYou lack permission for this resource, or it is restricted.`);
  if (resp.status === 404) throw new Error(`❌ Not found: ${url}`);
  if (!resp.ok) throw new Error(`❌ API error ${resp.status}: ${await resp.text()}`);
  return accept === 'text/plain' ? resp.text() : resp.json();
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
    return mcpText(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
        let ws: string | undefined;
        let repo: string | undefined;
        let prId: number | undefined;

        const urlMatch = input.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
        if (urlMatch) {
          ws = urlMatch[1];
          repo = urlMatch[2];
          prId = parseInt(urlMatch[3], 10);
        } else if (input.match(/^\d+$/)) {
          prId = parseInt(input, 10);
          ws = workspace || getCredential('BITBUCKET_DEFAULT_WORKSPACE');
          repo = repoSlug;
        }

        if (!ws) {
          return mcpText(
            `❌ workspace is required. Pass it as a parameter or set BITBUCKET_DEFAULT_WORKSPACE in your MCP env config.`,
          );
        }
        if (!repo || !prId) {
          return mcpText(`❌ Could not parse PR URL. Expected: bitbucket.org/{ws}/{repo}/pull-requests/{id}`);
        }

        const safeWs = sanitize(ws);
        const safeRepo = sanitize(repo);
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
        return mcpText(error instanceof Error ? error.message : String(error));
      }
    },
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
        return mcpText(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
