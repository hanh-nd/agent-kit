/**
 * Agent Delegation Tools - Invoke external agent CLIs (Gemini, Claude)
 * Supports handoff file injection and automatic fallback
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
/**
 * Register agent delegation tools with MCP server
 */
export declare function registerAgentTools(server: McpServer): void;
