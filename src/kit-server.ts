#!/usr/bin/env node
/**
 * Agent-Kit MCP Server
 * Provides custom tools for agent orchestration
 *
 * Modular architecture - tools split into separate modules
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import modular tool registrations
import { registerCoreTools } from './tools/core.js';
import { registerAgentTools } from './tools/agent.js';
import { registerIntegrationTools } from './tools/integration.js';

const server = new McpServer({
  name: 'kit-agents',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════════
// REGISTER MODULAR TOOLS
// ═══════════════════════════════════════════════════════════════

registerIntegrationTools(server); // Bitbucket, Jira tools (REST API)
registerCoreTools(server); // Extension info, handoff persistence
registerAgentTools(server); // Gemini/Claude CLI delegation

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const transport = new StdioServerTransport();
await server.connect(transport);
