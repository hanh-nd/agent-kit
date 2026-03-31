/**
 * Utility functions for agent-kit
 */
export declare function getWorkspaceRoot(): string;
/**
 * Resolve path to plugin root.
 * When installed as a Claude Code plugin, CLAUDE_PLUGIN_ROOT is set automatically.
 * Falls back to resolving from the bundled file location for local development.
 */
export declare function getExtensionRoot(): string;
