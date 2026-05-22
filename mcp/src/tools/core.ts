/**
 * Core Tools - Extension info and handoff persistence
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { getWorkspaceRoot, mcpText } from '../utils/utils.js';
import { DEFAULT_EXTENSIONS } from './config.js';
import { HANDOFF_TYPES, resolveHandoffPath } from './handoffs.js';

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
      type: z.enum(HANDOFF_TYPES).describe('Handoff type'),
      content: z.string().describe('Full markdown content to save'),
      slug: z
        .string()
        .describe(
          'Short identifier for the filename, e.g. "user-auth" or "PROJ-123". Do NOT append version numbers (v2, v3, etc.).',
        ),
    },
    async ({ type, content, slug }) => {
      try {
        const location = resolveHandoffPath({
          workspaceRoot: getWorkspaceRoot(),
          type,
          slug,
          content,
        });
        const handoffDir = path.dirname(location.filePath);

        if (!fs.existsSync(handoffDir)) {
          fs.mkdirSync(handoffDir, { recursive: true });
        }

        fs.writeFileSync(location.filePath, content, 'utf8');

        return mcpText(`✅ Saved to: ${location.filePath}`);
      } catch (error) {
        return mcpText(`Error saving handoff: ${error}`);
      }
    },
  );
}

// Export DEFAULT_EXTENSIONS for backward compatibility
export { DEFAULT_EXTENSIONS };
