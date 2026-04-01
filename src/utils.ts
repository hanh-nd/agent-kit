/**
 * Utility functions for agent-kit
 */

import path from 'path';

export function getWorkspaceRoot(): string {
  return (
    process.env.WORKSPACE_DIR ||
    process.env.CLAUDE_WORKSPACE ||
    process.env.GEMINI_WORKSPACE ||
    process.env.INIT_CWD ||
    process.env.PWD ||
    process.cwd()
  );
}
