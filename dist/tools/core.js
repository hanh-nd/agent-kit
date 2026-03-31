/**
 * Core Tools - Extension info and handoff persistence
 */
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { getExtensionRoot, getWorkspaceRoot } from '../utils.js';
import { DEFAULT_EXTENSIONS } from './config.js';
/**
 * Register core tools with MCP server
 */
export function registerCoreTools(server) {
    // ═══════════════════════════════════════════════════════════════
    // TOOL: GET EXTENSION INFO
    // Returns absolute paths so agents can use native Read tool
    // for loading agent personas and skill files
    // ═══════════════════════════════════════════════════════════════
    server.tool('kit_get_extension_info', 'Get absolute paths to the agent-kit extension directories (agents, skills, commands, scripts). Use the returned paths with the native Read tool to load agent personas and skill modules.', {}, async () => {
        try {
            const root = getExtensionRoot();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            extensionRoot: root,
                            agentsDir: path.join(root, 'agents'),
                            skillsDir: path.join(root, 'skills'),
                            commandsDir: path.join(root, 'commands'),
                            scriptsDir: path.join(root, 'scripts'),
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error getting extension info: ${error}` }],
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════
    // TOOL: SAVE HANDOFF
    // Writes brainstorm/plan/ticket artifacts to the workspace
    // Returns the saved file path for use in next-step instructions
    // ═══════════════════════════════════════════════════════════════
    server.tool('kit_save_handoff', 'Save a brainstorm, plan, or ticket handoff artifact to .agent-kit/handoffs/. Returns the saved file path to use in next-step instructions.', {
        type: z.enum(['brainstorm', 'plan', 'ticket']).describe('Handoff type'),
        content: z.string().describe('Full markdown content to save'),
        slug: z
            .string()
            .describe('Short identifier for the filename, e.g. "user-auth" or "PROJ-123"'),
    }, async ({ type, content, slug }) => {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
            const filename = `${type}-${timestamp}-${safeSlug}.md`;
            const handoffDir = path.join(getWorkspaceRoot(), '.agent-kit', 'handoffs', `${type}s`);
            if (!fs.existsSync(handoffDir)) {
                fs.mkdirSync(handoffDir, { recursive: true });
            }
            const filePath = path.join(handoffDir, filename);
            fs.writeFileSync(filePath, content, 'utf8');
            return {
                content: [{ type: 'text', text: `✅ Saved to: ${filePath}` }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error saving handoff: ${error}` }],
            };
        }
    });
}
// Export DEFAULT_EXTENSIONS for backward compatibility
export { DEFAULT_EXTENSIONS };
