#!/usr/bin/env node
/**
 * Agent-Kit MCP Server
 * Provides custom tools for agent orchestration
 *
 * Modular architecture - tools split into separate modules
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerCoreTools } from '../mcp/core.js';
import { registerAgentTools } from '../mcp/agent.js';
import { registerIntegrationTools } from '../mcp/integration.js';
import { loadProjectSettings } from '../core/config/index.js';
import { registerMemoryTools } from '../mcp/memory.js';
import { getWorkspaceRoot } from '../utils/utils.js';

const server = new McpServer({
  name: 'kit-agents',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════════
// REGISTER MODULAR TOOLS
// ═══════════════════════════════════════════════════════════════

registerIntegrationTools(server);
registerCoreTools(server);
registerAgentTools(server);

const workspaceRoot = getWorkspaceRoot();
const settings = loadProjectSettings(workspaceRoot);
const memoryIndexer = registerMemoryTools(server, settings, workspaceRoot);

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const transport = new StdioServerTransport();
await server.connect(transport);

// Fire-and-forget startup indexing — must run after server.connect
if (memoryIndexer) {
  void memoryIndexer.startupIndex();
}
