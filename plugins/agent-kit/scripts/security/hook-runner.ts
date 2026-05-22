import * as path from 'node:path';
import { enforce } from './enforcement.js';
import { isBlockedFilename, isInForbiddenDir } from './file-checks.js';
import { COMMAND_ARG_KEYS, loadPolicy, PATH_ARG_KEYS } from './policy.js';
import { extractCandidates } from './shell-parser.js';
import { shouldBlockOutside } from './workspace.js';
import { isRecord } from '../utils.js';
import type { SecurityHookPayload, SecurityPolicy } from '@types';

function parsePayload(raw: string): SecurityHookPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function checkPath(p: string, pol: Readonly<SecurityPolicy>, tool: string): void {
  if (shouldBlockOutside(p, pol))
    enforce(`Access to '${p}' is outside the workspace and strictly FORBIDDEN.`, pol);
  const n = path.basename(p);
  if (isBlockedFilename(n, pol))
    enforce(`Access to '${n}' via '${tool}' is strictly FORBIDDEN.`, pol);
  const seg = isInForbiddenDir(p, pol);
  if (seg) enforce(`Access to sensitive directory '${seg}' is FORBIDDEN.`, pol);
}

function inspectPrompt(prompt: unknown, pol: Readonly<SecurityPolicy>): void {
  if (typeof prompt !== 'string') return;
  const re = /@([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(prompt)) !== null) checkPath(match[1], pol, 'UserPromptSubmit');
}

function inspectTool(input: SecurityHookPayload, pol: Readonly<SecurityPolicy>): void {
  const toolValue =
    input.tool_name || input.tool || input.action || input.name || input.call?.method;
  const tool = typeof toolValue === 'string' ? toolValue : 'unknown';
  const argsValue = input.tool_input || input.args || input.call?.params || {};
  const args = isRecord(argsValue) ? argsValue : {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;
    if (PATH_ARG_KEYS.has(key)) checkPath(value, pol, tool);
    if (!COMMAND_ARG_KEYS.has(key)) continue;
    for (const c of extractCandidates(value, pol)) {
      const sysBin = pol.systemBinPaths.some((p) => c.expanded.startsWith(p));
      const winFlag =
        process.platform === 'win32' && c.expanded.startsWith('/') && c.expanded.length <= 3;
      if (!sysBin && !winFlag) {
        if (c.unresolvedVars.length > 0 && /[/\\]/.test(c.expanded))
          enforce(`Shell command has unresolved variable with path '${c.raw}' via '${tool}'.`, pol);
        checkPath(c.expanded, pol, tool);
      } else if (isBlockedFilename(path.basename(c.expanded), pol))
        enforce(`Shell command references forbidden file '${c.expanded}' via '${tool}'.`, pol);
    }
  }
}

export function runSecurityPrivacyHook(raw: string): void {
  const input = parsePayload(raw);
  if (!input) return;
  const pol = loadPolicy();
  inspectPrompt(input.prompt, pol);
  if (input.tool_name || input.tool || input.action || input.name || input.call)
    inspectTool(input, pol);
}
