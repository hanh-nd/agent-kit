import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENFORCEMENT_MODES, KIT_PATH } from './constants.js';
import type { AgentKitSettings, SecurityConfig } from '@types';

export function spawnBackground(scriptUrl: string | URL, args: string[] = []): void {
  const scriptPath =
    scriptUrl instanceof URL ? fileURLToPath(scriptUrl) : fileURLToPath(new URL(scriptUrl));

  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

export function runWhenInvoked(importMetaUrl: string, fn: () => void | Promise<void>): void {
  if (!process.argv[1]) return;
  const entryPath = fs.realpathSync(process.argv[1]);
  const modulePath = fs.realpathSync(fileURLToPath(importMetaUrl));
  if (entryPath === modulePath) {
    void fn();
  }
}

export function noOp(): never {
  console.log(JSON.stringify({}));
  process.exit(0);
}

export function blockAction(reason: string): never {
  process.stderr.write(`Security Block: ${reason}\n`);
  process.exit(2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  const s = isRecord(settings.security) ? settings.security : {};
  const enforcementMode =
    s.enforcementMode === ENFORCEMENT_MODES.AUDIT
      ? ENFORCEMENT_MODES.AUDIT
      : ENFORCEMENT_MODES.BLOCK;

  return {
    allowOutside: typeof s.allowOutside === 'boolean' ? s.allowOutside : false,
    allowedOutsidePaths: stringArray(s.allowedOutsidePaths),
    additionalSystemBinPaths: stringArray(s.additionalSystemBinPaths),
    additionalForbiddenFiles: stringArray(s.additionalForbiddenFiles),
    additionalForbiddenDirs: stringArray(s.additionalForbiddenDirs),
    enforcementMode,
  };
}
