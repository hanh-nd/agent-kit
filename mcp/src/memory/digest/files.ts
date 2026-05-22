import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConversationDigestInput, ConversationDigestSettings } from './types.js';
import { PROVISIONAL_DIGEST_DIR } from './constants.js';
import { atomicWriteTextFile } from '../../utils/files.js';
import { sha256Hex } from '../../utils/hash.js';
import { loadProjectSettings, writeProjectSettings } from '../../tools/config.js';

export function defaultProvisionalDigestDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, PROVISIONAL_DIGEST_DIR);
}

export function readConversationDigestInput(workspaceRoot: string, inputPath: string): ConversationDigestInput {
  const absoluteInput = path.isAbsolute(inputPath) ? inputPath : path.resolve(workspaceRoot, inputPath);
  const content = fs.readFileSync(absoluteInput, 'utf8');

  return {
    sourcePath: path.relative(workspaceRoot, absoluteInput),
    content,
    contentHash: sha256Hex(content),
  };
}

export function provisionalDigestPath(
  outDir: string,
  input: Pick<ConversationDigestInput, 'sourcePath' | 'contentHash'>,
): string {
  const safeName = path
    .basename(input.sourcePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-');
  return path.join(outDir, `${input.contentHash.slice(0, 16)}-${safeName}.md`);
}

export function findExistingProvisionalDigest(outDir: string, input: ConversationDigestInput): string | undefined {
  const markdownPath = provisionalDigestPath(outDir, input);
  return fs.existsSync(markdownPath) ? markdownPath : undefined;
}

export function writeProvisionalDigestFile(outDir: string, input: ConversationDigestInput, markdown: string): string {
  const markdownPath = provisionalDigestPath(outDir, input);
  atomicWriteTextFile(markdownPath, markdown);
  return markdownPath;
}

export function writeConversationDigestSettings(workspaceRoot: string, digest: ConversationDigestSettings): void {
  const current = loadProjectSettings(workspaceRoot);
  const memory = current.memory ?? {};
  writeProjectSettings(workspaceRoot, {
    memory: {
      ...memory,
      enabled: memory.enabled ?? true,
      conversationDigest: digest,
    },
  });
}
