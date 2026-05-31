/**
 * Integration Tools - Bitbucket, Jira
 * Tools: kit_get_bitbucket_pr, kit_jira_get_ticket
 */

import { writeFileSync } from 'fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getCredential } from '../services/integration/credentials.js';
import { mcpText } from '../utils/utils.js';
import { adfToMarkdown } from '../services/integration/parser/adf.js';
import { sanitize } from '../core/security/index.js';

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

function buildBasicAuth(emailVar: string, tokenVar: string): string {
  const email = getCredential(emailVar);
  const token = getCredential(tokenVar);
  if (!email || !token) throw new Error(`Missing ${emailVar} or ${tokenVar}`);
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function callRestApi(url: string, auth: string, accept = 'application/json'): Promise<unknown> {
  const resp = await fetch(url, { headers: { Authorization: auth, Accept: accept } });
  if (resp.status === 401) throw new Error(`❌ Auth failed (401): ${url}`);
  if (resp.status === 404) throw new Error(`❌ Not found: ${url}`);
  if (!resp.ok) throw new Error(`❌ API error ${resp.status}: ${await resp.text()}`);
  return accept === 'text/plain' ? resp.text() : resp.json();
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

        const cloudId = getCredential('ATLASSIAN_CLOUD_ID');
        if (!cloudId) throw new Error('Missing ATLASSIAN_CLOUD_ID');

        const auth = buildBasicAuth('ATLASSIAN_USER_EMAIL', 'ATLASSIAN_API_TOKEN');
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
}
