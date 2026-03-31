/**
 * Utility functions for agent-kit
 */
import path from 'path';
export function getWorkspaceRoot() {
    return (process.env.WORKSPACE_DIR ||
        process.env.CLAUDE_WORKSPACE ||
        process.env.GEMINI_WORKSPACE ||
        process.env.INIT_CWD ||
        process.env.PWD ||
        process.cwd());
}
/**
 * Resolve path to plugin root.
 * When installed as a Claude Code plugin, CLAUDE_PLUGIN_ROOT is set automatically.
 * Falls back to resolving from the bundled file location for local development.
 */
export function getExtensionRoot() {
    // CLAUDE_PLUGIN_ROOT is set by Claude Code when plugin is installed
    if (process.env.CLAUDE_PLUGIN_ROOT) {
        return process.env.CLAUDE_PLUGIN_ROOT;
    }
    // Fallback: resolve from bundled file location (dist/kit-server.js → ../)
    const distDir = path.dirname(new URL(import.meta.url).pathname);
    return path.resolve(distDir, '..');
}
