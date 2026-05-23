/**
 * Core Tools - Extension info and handoff persistence
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { getWorkspaceRoot, mcpText } from '../utils/utils.js';
import { DEFAULT_EXTENSIONS } from '../core/config/index.js';
import { HANDOFF_TYPES, resolveHandoffFolder, validateHandoffFilename } from '../core/handoffs/index.js';

export function handleSaveHandoff(
  args: { type: (typeof HANDOFF_TYPES)[number]; slug: string; files: Record<string, string> },
  workspaceRoot: string,
): ReturnType<typeof mcpText> {
  try {
    if (Object.keys(args.files).length === 0) {
      return mcpText('Error saving handoff: files cannot be empty');
    }

    for (const name of Object.keys(args.files)) {
      try {
        validateHandoffFilename(name);
      } catch (err) {
        return mcpText(`Error saving handoff: ${err instanceof Error ? err.message : err}`);
      }
    }

    const primaryContent = args.files['README.md'] ?? Object.values(args.files)[0];
    const location = resolveHandoffFolder({
      workspaceRoot,
      type: args.type,
      slug: args.slug,
      primaryContent,
    });

    fs.mkdirSync(location.folderPath, { recursive: true });

    for (const [name, content] of Object.entries(args.files)) {
      fs.writeFileSync(path.join(location.folderPath, name), content, 'utf8');
    }

    return mcpText(`✅ Saved to: ${location.folderPath}`);
  } catch (error) {
    return mcpText(`Error saving handoff: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Register core tools with MCP server
 */
export function registerCoreTools(server: McpServer): void {
  // ═══════════════════════════════════════════════════════════════
  // TOOL: SAVE HANDOFF
  // Writes handoff artifacts to the workspace as a folder of files
  // Returns the saved folder path to use in next-step instructions
  // ═══════════════════════════════════════════════════════════════
  server.tool(
    'kit_save_handoff',
    `Save a handoff artifact to .agent-kit/handoffs/. Returns the saved folder path to use in next-step instructions. Do NOT append version numbers (v2, v3, etc.) to the slug.`,
    {
      type: z.enum(HANDOFF_TYPES).describe('Handoff type'),
      files: z
        .record(z.string(), z.string())
        .describe(
          '{ "README.md": "...", "DETAIL.md": "..." } for brainstorm; { "index.md": "..." } for all others. Filenames must match /^[A-Za-z0-9_-]+\\.md$/.',
        ),
      slug: z
        .string()
        .describe(
          'Short identifier for the folder, e.g. "user-auth" or "PROJ-123". Do NOT append version numbers (v2, v3, etc.).',
        ),
    },
    async (args) => handleSaveHandoff(args, getWorkspaceRoot()),
  );
}

// Export DEFAULT_EXTENSIONS for backward compatibility
export { DEFAULT_EXTENSIONS };
