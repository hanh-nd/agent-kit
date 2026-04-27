#!/usr/bin/env node

import * as path from 'path';
import {
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FORBIDDEN_PATTERN_STRINGS,
  PROJECT_DIR,
} from './constants.js';
import { blockAction, noOp, runWhenInvoked } from './utils.js';

const FORBIDDEN_REGEXES = FORBIDDEN_PATTERN_STRINGS.map((p) => new RegExp(p, 'i'));

// Only these arg keys contain actual file system paths
const PATH_ARG_KEYS = new Set(['file_path', 'path', 'notebook_path']);

// Only these arg keys contain shell command strings worth tokenizing
const COMMAND_ARG_KEYS = new Set(['command']);

function isBlockedFilename(name) {
  const lower = name.toLowerCase();
  if (FORBIDDEN_FILES.some((f) => lower === f.toLowerCase())) return true;
  if (FORBIDDEN_REGEXES.some((re) => re.test(name))) return true;
  return false;
}

function isOutsideWorkspace(filePath) {
  const resolved = path.resolve(PROJECT_DIR, filePath);
  // Block if it's not the project root and doesn't start with project root + separator
  return resolved !== PROJECT_DIR && !resolved.startsWith(PROJECT_DIR + path.sep);
}

runWhenInvoked(import.meta.url, async () => {
  const raw = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    noOp();
  }

  // ── UserPromptSubmit ──────────────────────────────────────────────────────────
  // Scan @-references before Claude Code resolves them into tool calls.
  if (input.prompt) {
    const atRefRegex = /@([^\s]+)/g;
    let match;
    while ((match = atRefRegex.exec(input.prompt)) !== null) {
      const fileName = path.basename(match[1]);
      if (isBlockedFilename(fileName)) {
        blockAction(`@-reference to '${fileName}' is strictly FORBIDDEN.`);
      }

      // Check for path traversal or absolute paths in @-refs
      if (isOutsideWorkspace(match[1])) {
        blockAction(`@-reference to '${match[1]}' is outside the workspace and FORBIDDEN.`);
      }
    }
  }

  // ── PreToolUse ────────────────────────────────────────────────────────────────
  if (input.tool_name || input.tool || input.action || input.name || input.call) {
    const toolName =
      input.tool_name ||
      input.tool ||
      input.action ||
      input.name ||
      (input.call && input.call.method);
    const args = input.tool_input || input.args || (input.call && input.call.params) || {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== 'string') continue;

      if (PATH_ARG_KEYS.has(key)) {
        // Workspace boundary check
        if (isOutsideWorkspace(value)) {
          blockAction(`Access to '${value}' is outside the workspace and strictly FORBIDDEN.`);
        }

        // Direct filename check on the resolved basename
        const fileName = path.basename(value);
        if (isBlockedFilename(fileName)) {
          blockAction(`Access to '${fileName}' via '${toolName}' is strictly FORBIDDEN.`);
        }

        // Directory segment check
        const segment = value.split(/[/\\]+/).find((s) =>
          FORBIDDEN_DIRS.some((d) => s.toLowerCase() === d.toLowerCase())
        );
        if (segment) {
          blockAction(`Access to sensitive directory '${segment}' is FORBIDDEN.`);
        }
      }

      if (COMMAND_ARG_KEYS.has(key)) {
        // Tokenized check for shell commands (catches inline file references)
        // Use regex to respect quotes (basic shell-like tokenization)
        const tokenRegex = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
        let match;

        while ((match = tokenRegex.exec(value)) !== null) {
          const token = match[1] || match[2] || match[3];
          if (!token) continue;

          // Boundary check for potential paths in shell commands
          if (/[/\\]/.test(token) && isOutsideWorkspace(token)) {
            // Allow common system binary paths
            const isSystemBinary =
              token.startsWith('/usr/bin/') ||
              token.startsWith('/bin/') ||
              token.startsWith('/usr/local/bin/');

            // Heuristic: ignore short tokens starting with / that look like Windows flags (e.g. /W)
            const isWindowsFlag =
              process.platform === 'win32' && token.startsWith('/') && token.length <= 3;

            if (!isSystemBinary && !isWindowsFlag) {
              blockAction(
                `Shell command references path '${token}' outside workspace via '${toolName}'.`
              );
            }
          }

          if (isBlockedFilename(path.basename(token))) {
            blockAction(`Shell command references forbidden file '${token}' via '${toolName}'.`);
          }
        }
      }
    }
  }

  noOp();
});
