/**
 * Credential loader — reads ~/.claude/credentials (INI format, like ~/.aws/credentials)
 *
 * Resolution order per key:
 *   1. process.env.KEY  (explicit override / CI)
 *   2. ~/.claude/credentials [profile] section
 *   3. undefined
 *
 * File format:
 *   [default]
 *   ATLASSIAN_USER_EMAIL = user@example.com
 *   ATLASSIAN_API_TOKEN  = your_token_here
 *
 * Active profile: KIT_PROFILE env var (defaults to "default")
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CREDENTIALS_FILE = path.join(os.homedir(), '.claude', 'credentials');

type IniProfile = Record<string, string>;
type IniData = Record<string, IniProfile>;

let cachedCredentials: IniProfile | null = null;

/**
 * Parse a simple INI file into a map of profiles.
 * Ignores comment lines (# or ;) and blank lines.
 */
function parseIni(content: string): IniData {
  const result: IniData = {};
  let currentSection = 'default';

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (!result[currentSection]) result[currentSection] = {};
    result[currentSection][key] = value;
  }

  return result;
}

/**
 * Load credentials from ~/.claude/credentials for the active profile.
 * Result is cached for the lifetime of the MCP server process.
 */
function loadCredentials(): IniProfile {
  if (cachedCredentials !== null) return cachedCredentials;

  if (!fs.existsSync(CREDENTIALS_FILE)) {
    cachedCredentials = {};
    return cachedCredentials;
  }

  // Warn if the file is world-readable (not chmod 600)
  try {
    const stat = fs.statSync(CREDENTIALS_FILE);
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      process.stderr.write(
        `[credentials] ⚠️  Warning: ${CREDENTIALS_FILE} has permissions ${mode.toString(8)} — expected 600. Run: chmod 600 ${CREDENTIALS_FILE}\n`
      );
    }
  } catch {
    // Non-fatal
  }

  const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
  const ini = parseIni(content);

  const profile = process.env.KIT_PROFILE ?? 'default';
  cachedCredentials = ini[profile] ?? {};

  if (Object.keys(cachedCredentials).length === 0 && profile !== 'default') {
    process.stderr.write(
      `[credentials] ⚠️  Profile "${profile}" not found in ${CREDENTIALS_FILE}. Falling back to empty.\n`
    );
  }

  return cachedCredentials;
}

/**
 * Resolve a credential key using the priority chain:
 *   process.env.KEY → ~/.claude/credentials [profile] → undefined
 */
export function getCredential(key: string): string | undefined {
  if (process.env[key]) {
    return process.env[key];
  }

  return loadCredentials()[key];
}
