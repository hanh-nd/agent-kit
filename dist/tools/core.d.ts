/**
 * Core Tools - Extension info and handoff persistence
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_EXTENSIONS } from './config.js';
/**
 * Register core tools with MCP server
 */
export declare function registerCoreTools(server: McpServer): void;
export { DEFAULT_EXTENSIONS };
