/**
 * Configuration utilities
 * Shared configuration constants and loaders
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MEMORY_CONFIG } from '../../services/memory/constants.js';
import type { MemoryConfig } from '../../services/memory/types.js';
import type { ConversationDigestSettings } from '../../services/digest/types.js';
import { atomicWriteJsonFile } from '../../utils/files.js';

/**
 * Default file extensions - expanded to support more languages
 * Used by kit_get_project_context and other tools
 */
export const DEFAULT_EXTENSIONS = [
  '.ts',
  '.js',
  '.tsx',
  '.jsx', // JavaScript/TypeScript
  '.py', // Python
  '.go', // Go
  '.rs', // Rust
  '.java',
  '.kt', // Java/Kotlin
  '.cpp',
  '.c',
  '.h',
  '.hpp', // C/C++
  '.php', // PHP
  '.rb', // Ruby
  '.swift', // Swift
  '.vue',
  '.svelte', // Frontend frameworks
  '.json',
  '.yaml',
  '.yml', // Config files
  '.md', // Documentation
];
/**
 * Project settings interface
 */
export interface ProjectSettings {
  fileExtensions?: string[];
  memory?: Partial<MemoryConfig>;
  [key: string]: unknown;
}

export { MemoryConfig };

/**
 * Merge DEFAULT_MEMORY_CONFIG with settings.memory; resolve wikiDir when not explicitly set.
 */
export function resolveMemoryConfig(settings: ProjectSettings, workspaceRoot: string): MemoryConfig {
  const override = settings.memory ?? {};

  return {
    ...DEFAULT_MEMORY_CONFIG,
    ...override,
    enabled: override.enabled ?? DEFAULT_MEMORY_CONFIG.enabled,
    wikiDir:
      typeof override.wikiDir === 'string' && override.wikiDir.length > 0
        ? override.wikiDir
        : path.join(workspaceRoot, '.agent-kit', 'wiki'),
  };
}

/**
 * Get file extensions - from settings.json or defaults
 * Allows project-specific customization
 */
export function getFileExtensions(projectDir: string): string[] {
  const settings = loadProjectSettings(projectDir);
  if (settings.fileExtensions && Array.isArray(settings.fileExtensions)) {
    return settings.fileExtensions;
  }
  return DEFAULT_EXTENSIONS;
}

export function loadProjectSettings(projectDir: string): ProjectSettings {
  const settingsPath = path.join(projectDir, '.agent-kit', 'settings.json');

  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (error) {
      console.error(`[agent-kit] Warning: Failed to parse ${settingsPath}:`, error);
    }
  }

  return {};
}

export function writeProjectSettings(workspaceRoot: string, patch: Partial<ProjectSettings>): void {
  const settingsPath = path.join(workspaceRoot, '.agent-kit', 'settings.json');
  const current = loadProjectSettings(workspaceRoot);
  atomicWriteJsonFile(settingsPath, { ...current, ...patch });
}

export function resolveConversationDigestConfig(settings: ProjectSettings): ConversationDigestSettings | undefined {
  const digest = settings.memory?.conversationDigest;
  if (!digest?.initialized || typeof digest.modelId !== 'string' || typeof digest.initializedAt !== 'string') {
    return undefined;
  }
  return {
    enabled: digest.enabled !== false,
    initialized: true,
    modelId: digest.modelId,
    initializedAt: digest.initializedAt,
  };
}

/**
 * Sensitive files that agents are FORBIDDEN from reading/writing.
 */
export const FORBIDDEN_FILES: string[] = [
  '.env',
  '.bashrc',
  '.zshrc',
  '.profile',
  '.bash_profile',
  '.bash_history',
  '.zsh_history',
  'config.mjs',
  '.npmrc',
  '.yarnrc',
  '.netrc',
  '.gitconfig',
  'credentials', // ~/.agent-kit/credentials file
];

/**
 * Regex patterns (case-insensitive) matched against path.basename.
 */
export const FORBIDDEN_PATTERNS: RegExp[] = [
  /^\.env$/i, // .env, .Env — case-insensitive exact
  /^\.env[^a-z]/i, // .env_bak, .env-prod, .env.local
  /^id_rsa/i, // SSH private keys
  /^id_ed25519/i,
  /^id_ecdsa/i,
  /\.pem$/i, // Certificates
  /credentials\.json$/i,
  /secrets\.json$/i,
  /secret\.json$/i,
];

/**
 * Directory name segments that are always blocked.
 */
export const FORBIDDEN_DIRS: string[] = ['.git', '.ssh', '.aws', '.kube', '.gnupg', '.docker'];
