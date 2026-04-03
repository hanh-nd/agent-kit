/**
 * Integration Tools - Bitbucket, Jira
 * Tools: kit_get_bitbucket_pr, kit_jira_get_ticket
 */

import { writeFileSync } from 'fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { sanitize } from './security.js';

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

/**
 * Extract plain text from ADF (Atlassian Document Format) content
 * Recursively walks the content tree to find text nodes
 */
function extractAdfText(adf: Record<string, unknown> | null | undefined): string {
  if (!adf || typeof adf !== 'object') return 'No description';

  const content = adf.content as Array<Record<string, unknown>> | undefined;
  if (!content || !Array.isArray(content)) return 'No description';

  const textParts: string[] = [];

  function extractText(nodes: Array<Record<string, unknown>>): void {
    for (const node of nodes) {
      if (typeof node.text === 'string') {
        textParts.push(node.text);
      }
      if (Array.isArray(node.content)) {
        extractText(node.content as Array<Record<string, unknown>>);
      }
    }
  }

  extractText(content);
  return textParts.join(' ') || 'No description';
}

function buildJiraBasicAuth(): string {
  const email = process.env.ATLASSIAN_USER_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) {
    throw new Error('Missing ATLASSIAN_USER_EMAIL or ATLASSIAN_API_TOKEN');
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

function buildBitbucketBasicAuth(): string {
  const email = process.env.BITBUCKET_USER_EMAIL;
  const token = process.env.BITBUCKET_API_TOKEN;
  if (!email || !token) {
    throw new Error('Missing BITBUCKET_USER_EMAIL or BITBUCKET_API_TOKEN');
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function callAtlassianRestApi(url: string): Promise<unknown> {
  const auth = buildJiraBasicAuth();
  const resp = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (resp.status === 401) {
    throw new Error('❌ Auth failed: check ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN');
  }
  if (resp.status === 404) {
    throw new Error(`❌ Not found: ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`❌ API error ${resp.status}: ${await resp.text()}`);
  }
  return await resp.json();
}

async function callBitbucketRestApi(url: string): Promise<unknown> {
  const auth = buildBitbucketBasicAuth();
  const resp = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (resp.status === 401) {
    throw new Error('❌ Auth failed: check BITBUCKET_USER_EMAIL and BITBUCKET_API_TOKEN');
  }
  if (resp.status === 404) {
    throw new Error(`❌ Not found: ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`❌ API error ${resp.status}: ${await resp.text()}`);
  }
  return await resp.json();
}

async function callBitbucketDiffApi(url: string): Promise<string> {
  const auth = buildBitbucketBasicAuth();
  const resp = await fetch(url, { headers: { Authorization: auth, Accept: 'text/plain' } });
  if (resp.status === 401) {
    throw new Error('❌ Auth failed: check BITBUCKET_USER_EMAIL and BITBUCKET_API_TOKEN');
  }
  if (resp.status === 404) {
    throw new Error(`❌ Not found: ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`❌ API error ${resp.status}: ${await resp.text()}`);
  }
  return await resp.text();
}

export function registerIntegrationTools(server: McpServer): void {
  // TOOL: GET BITBUCKET PR
  server.tool(
    'kit_get_bitbucket_pr',
    'Get Bitbucket PR details and optionally the diff. Accepts a full PR URL or a numeric PR ID with workspace + repoSlug.',
    {
      input: z.string().describe('Bitbucket PR URL or numeric PR ID'),
      workspace: z
        .string()
        .optional()
        .describe(
          'Bitbucket workspace slug (required for numeric ID if BITBUCKET_DEFAULT_WORKSPACE not set)'
        ),
      repoSlug: z.string().optional().describe('Bitbucket repo slug (required for numeric ID)'),
      includeDiff: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include unified diff in response'),
    },
    async ({ input, workspace, repoSlug, includeDiff }) => {
      try {
        const bbEmail = process.env.BITBUCKET_USER_EMAIL;
        const bbToken = process.env.BITBUCKET_API_TOKEN;
        if (!bbEmail || !bbToken) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Missing BITBUCKET_USER_EMAIL or BITBUCKET_API_TOKEN. Create an API token at id.atlassian.com/manage-profile/security/api-tokens.`,
              },
            ],
          };
        }

        let ws: string | undefined;
        let repo: string | undefined;
        let prId: number | undefined;

        // Try URL parse
        const urlMatch = input.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
        if (urlMatch) {
          ws = urlMatch[1];
          repo = urlMatch[2];
          prId = parseInt(urlMatch[3], 10);
        } else if (input.match(/^\d+$/)) {
          prId = parseInt(input, 10);
          ws = workspace || process.env.BITBUCKET_DEFAULT_WORKSPACE;
          repo = repoSlug;
        }

        if (!ws) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ workspace is required. Pass it as a parameter or set BITBUCKET_DEFAULT_WORKSPACE in your MCP env config.`,
              },
            ],
          };
        }

        if (!repo || !prId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Could not parse PR URL. Expected: bitbucket.org/{ws}/{repo}/pull-requests/{id}`,
              },
            ],
          };
        }

        const safeWs = sanitize(ws);
        const safeRepo = sanitize(repo);

        const prUrl = `https://api.bitbucket.org/2.0/repositories/${safeWs}/${safeRepo}/pullrequests/${prId}`;
        const jsonData = await callBitbucketRestApi(prUrl);

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
          const diff = await callBitbucketDiffApi(diffUrl);
          const DIFF_FILE_THRESHOLD = 50_000;

          if (diff.length < DIFF_FILE_THRESHOLD) {
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

        return { content: [{ type: 'text' as const, text: output }] };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: errorMsg }] };
      }
    }
  );

  // TOOL: JIRA GET TICKET
  server.tool(
    'kit_jira_get_ticket',
    'Get ticket details from Jira using the Atlassian REST API',
    {
      ticketId: z.string().describe('Jira ticket ID (e.g., PROJ-123)'),
    },
    async ({ ticketId }) => {
      try {
        const cloudId = process.env.ATLASSIAN_CLOUD_ID;
        const userEmail = process.env.ATLASSIAN_USER_EMAIL;
        const apiToken = process.env.ATLASSIAN_API_TOKEN;

        if (!cloudId || !userEmail || !apiToken) {
          const missing = [
            !cloudId && 'ATLASSIAN_CLOUD_ID',
            !userEmail && 'ATLASSIAN_USER_EMAIL',
            !apiToken && 'ATLASSIAN_API_TOKEN',
          ]
            .filter(Boolean)
            .join(', ');
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Missing ${missing}. Create an API Token at id.atlassian.com/manage-profile/security/api-tokens.`,
              },
            ],
          };
        }

        const safeTicketId = ticketId.match(/^[A-Z]+-\d+$/)?.[0];
        if (!safeTicketId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Invalid ticket ID format: ${ticketId}\n\nExpected format: PROJ-123`,
              },
            ],
          };
        }

        const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${safeTicketId}`;
        const jsonData = await callAtlassianRestApi(url);

        const parseResult = JiraTicketSchema.safeParse(jsonData);
        if (!parseResult.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Invalid Jira response format: ${parseResult.error.message}`,
              },
            ],
          };
        }
        const ticket = parseResult.data;

        if (ticket.errorMessages && ticket.errorMessages.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Ticket not found: ${ticketId}\n\n${ticket.errorMessages.join('\n')}`,
              },
            ],
          };
        }

        const output = `## 🎫 ${ticketId}: ${ticket.fields.summary}

**Status:** ${ticket.fields.status?.name || 'Unknown'}
**Priority:** ${ticket.fields.priority?.name || 'None'}
**Assignee:** ${ticket.fields.assignee?.displayName || 'Unassigned'}
**Reporter:** ${ticket.fields.reporter?.displayName || 'Unknown'}
**Type:** ${ticket.fields.issuetype?.name || 'Unknown'}

### Description
${
  typeof ticket.fields.description === 'string'
    ? ticket.fields.description
    : extractAdfText(ticket.fields.description as Record<string, unknown>)
}

### Labels
${ticket.fields.labels?.join(', ') || 'None'}`;

        return { content: [{ type: 'text' as const, text: output }] };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }] };
      }
    }
  );
}
