import * as fs from 'node:fs';
import * as path from 'node:path';
import { KIT_PATH } from '../constants.js';
import { isRecord, noOp } from '../utils.js';
import { ENFORCEMENT_MODES } from './constants.js';
import type { AgentKitSettings, SecurityConfig, SecurityPolicy } from '@types';

export function blockAction(reason: string): never {
  process.stderr.write(`Security Block: ${reason}\n`);
  process.exit(2);
}

const DECISIONS_LOG_MAX_BYTES = 2 * 1024 * 1024;

export interface DecisionLogEntry {
  timestamp: string;
  mode: string;
  decision: string;
  reasonCode?: string;
  provider?: string;
  tool?: string;
  action?: string;
  target?: string;
  message: string;
}

/**
 * Append one JSONL line per security decision (allow included) so misses and
 * near-misses are attributable. Contained: logging must never break the hook.
 */
export function recordDecision(entry: DecisionLogEntry): void {
  try {
    const logsDir = path.join(KIT_PATH, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'security-decisions.log');
    try {
      const stats = fs.statSync(logPath);
      if (stats.size > DECISIONS_LOG_MAX_BYTES) {
        fs.truncateSync(logPath, 0);
      }
    } catch {
      // Missing file is fine — first write creates it
    }
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch {
    // Never block on logging failure
  }
}

export function enforce(reason: string, policy: Pick<SecurityPolicy, 'enforcementMode'>): void {
  if (policy.enforcementMode === ENFORCEMENT_MODES.AUDIT) {
    try {
      const logPath = path.join(KIT_PATH, 'logs', 'security-audit.log');
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] AUDIT: ${reason}\n`);
    } catch {
      // Never block on logging failure
    }
    noOp();
  } else {
    blockAction(reason);
  }
}

export function isBlockedFilename(
  name: string,
  policy: Pick<SecurityPolicy, 'forbiddenFiles' | 'forbiddenRegexes'>
): boolean {
  const lower = name.toLowerCase();
  if (policy.forbiddenFiles.some((forbiddenFile) => lower === forbiddenFile)) return true;
  if (policy.forbiddenRegexes.some((regex) => regex.test(name))) return true;
  return false;
}

export function isInForbiddenDir(
  filePath: string,
  policy: Pick<SecurityPolicy, 'forbiddenDirs'>
): string | null {
  const segments = filePath.split(/[/\\]+/);
  return segments.find((segment) => policy.forbiddenDirs.includes(segment.toLowerCase())) ?? null;
}

export function loadSettings(): AgentKitSettings {
  try {
    const settingsPath = path.join(KIT_PATH, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return isRecord(parsed) ? parsed : {};
    }
  } catch {
    // Fall through to defaults on parse error
  }
  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function getSecurityConfig(settings: AgentKitSettings): SecurityConfig {
  const securitySettings = isRecord(settings.security) ? settings.security : {};
  const enforcementMode =
    securitySettings.enforcementMode === ENFORCEMENT_MODES.AUDIT
      ? ENFORCEMENT_MODES.AUDIT
      : ENFORCEMENT_MODES.BLOCK;

  return {
    allowOutside:
      typeof securitySettings.allowOutside === 'boolean' ? securitySettings.allowOutside : false,
    allowedOutsidePaths: stringArray(securitySettings.allowedOutsidePaths),
    enforcementMode,
  };
}
