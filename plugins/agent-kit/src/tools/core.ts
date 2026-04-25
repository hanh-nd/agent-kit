/**
 * Core Tools - Extension info and handoff persistence
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { getWorkspaceRoot, mcpText } from '../utils/utils.js';
import { DEFAULT_EXTENSIONS } from './config.js';

/**
 * Register core tools with MCP server
 */
export function registerCoreTools(server: McpServer): void {
  // ═══════════════════════════════════════════════════════════════
  // TOOL: SAVE HANDOFF
  // Writes handoff artifacts to the workspace
  // Returns the saved file path to use in next-step instructions
  // ═══════════════════════════════════════════════════════════════
  server.tool(
    'kit_save_handoff',
    `Save a handoff artifact to .agent-kit/handoffs/. Returns the saved file path to use in next-step instructions. Do NOT append version numbers (v2, v3, etc.) to the slug.`,
    {
      type: z.enum(['brainstorm', 'plan', 'ticket', 'research']).describe('Handoff type'),
      content: z.string().describe('Full markdown content to save'),
      slug: z
        .string()
        .describe(
          'Short identifier for the filename, e.g. "user-auth" or "PROJ-123". Do NOT append version numbers (v2, v3, etc.).'
        ),
    },
    async ({ type, content, slug }) => {
      try {
        const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        const handoffDir = path.join(getWorkspaceRoot(), '.agent-kit', 'handoffs', `${type}s`);

        if (!fs.existsSync(handoffDir)) {
          fs.mkdirSync(handoffDir, { recursive: true });
        }

        const files = fs.readdirSync(handoffDir);
        const slugPattern = new RegExp(`^${type}-([0-9T-]{19}-)?${safeSlug}\\.md$`);
        const existingFile = files
          .filter((f) => slugPattern.test(f))
          .sort()
          .pop();

        let filePath: string;
        if (existingFile) {
          filePath = path.join(handoffDir, existingFile);
        } else {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `${type}-${timestamp}-${safeSlug}.md`;
          filePath = path.join(handoffDir, filename);
        }

        fs.writeFileSync(filePath, content, 'utf8');

        return mcpText(`✅ Saved to: ${filePath}`);
      } catch (error) {
        return mcpText(`Error saving handoff: ${error}`);
      }
    }
  );
}

// Export DEFAULT_EXTENSIONS for backward compatibility
export { DEFAULT_EXTENSIONS };
