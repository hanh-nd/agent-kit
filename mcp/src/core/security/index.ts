/**
 * Security Helpers - Prevent Command Injection
 * Exported utilities for safe command execution
 */

import { execFileSync } from 'child_process';
import * as path from 'path';
import { getWorkspaceRoot } from '../../utils/utils.js';
import { FORBIDDEN_DIRS, FORBIDDEN_FILES, FORBIDDEN_PATTERNS } from '../config/index.js';

/**
 * Sanitize string for safe use with execFileSync
 * Only removes dangerous shell operators - safe chars like !?#* are allowed
 * since execFileSync doesn't invoke a shell and handles args safely
 *
 * NOTE: Flag injection is NOT handled here because:
 * 1. execFileSync uses arg arrays, not shell parsing
 * 2. Adding -- prefix would corrupt content (e.g., commit messages)
 * 3. Callers should use '--' separator when needed for specific commands
 */
export function sanitize(input: string): string {
  // Only remove truly dangerous shell operators
  // Keep: ! ? # * ( ) [ ] { } - for valid content like "Fix bug!" or "- TODO item"
  return String(input)
    .replace(/[;&|`$<>\\]/g, '')
    .trim()
    .slice(0, 500); // Limit length
}

/**
 * Validate file path to prevent path traversal attacks and access to forbidden files.
 * Uses stricter path.sep check to prevent prefix matching flaws.
 */
export function validatePath(filePath: string, baseDir: string = process.cwd()): string {
  const resolved = path.resolve(baseDir, filePath);
  const root = path.resolve(baseDir);

  // 1. Path traversal check
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  // 2. Directory segment check
  const segments = resolved.split(path.sep);
  for (const segment of segments) {
    if (FORBIDDEN_DIRS.some((d) => segment.toLowerCase() === d.toLowerCase())) {
      throw new Error(`Access to sensitive directory is FORBIDDEN: ${segment}`);
    }
  }

  // 3. Forbidden files check (two-stage)
  const fileName = path.basename(resolved);
  const isExactForbidden = FORBIDDEN_FILES.some((f) => fileName.toLowerCase() === f.toLowerCase());
  const isPatternForbidden = FORBIDDEN_PATTERNS.some((re) => re.test(fileName));

  if (isExactForbidden || isPatternForbidden) {
    throw new Error(`Access to sensitive file is FORBIDDEN: ${fileName}`);
  }

  return resolved;
}

export function commandExists(cmd: string): boolean {
  try {
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checkCmd, [cmd], {
      encoding: 'utf8',
      cwd: getWorkspaceRoot(),
      timeout: 5000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize output text by redacting sensitive tokens (API keys, etc.)
 */
export function sanitizeOutput(text: string): string {
  const SECRET_PATTERNS: RegExp[] = [
    /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g, // GitHub tokens
    /SK-[A-Za-z0-9]{40,}/g, // OpenAI keys
    /AKIA[0-9A-Z]{16}/g, // AWS access keys
    /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
    /[Aa]tlassian[_-]?[Aa][Pp][Ii][_-]?[Tt]oken[^\s]*\s*[:=]\s*\S+/g, // Atlassian token patterns
  ];

  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}
