import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_DIGEST_TIMEOUT_MS,
  DEFAULT_DIGEST_MAX_INPUT_CHARS,
  DIGEST_LOCKFILE_REL_PATH,
  WIKI_RAW_DIR,
} from './constants.js';
import {
  defaultProvisionalDigestDir,
  readConversationDigestInput,
  findExistingProvisionalDigest,
  writeProvisionalDigestFile,
  writeConversationDigestSettings,
} from './files.js';
import { getDigestModelSpec } from './model-registry.js';
import { createLlamaLocalDigestProvider } from './providers/llama-local.js';
import type {
  DigestFileOptions,
  DigestPendingCandidateSummary,
  DigestPendingResult,
  ProvisionalDigestResult,
  ConversationDigestInitResult,
  InitializeConversationDigestInput,
} from './types.js';
import { loadProjectSettings, resolveConversationDigestConfig, resolveMemoryConfig } from '../../core/config/index.js';
import { MemoryStore } from '../memory/store.js';
import { MemoryIndexer } from '../memory/indexer.js';
import { releaseLock, tryAcquireProcessLock } from '../../utils/files.js';

function digestLockPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DIGEST_LOCKFILE_REL_PATH);
}

function discoverPendingConversationFiles(workspaceRoot: string): string[] {
  const rawDir = path.join(workspaceRoot, WIKI_RAW_DIR);
  let files: string[];
  try {
    files = fs
      .readdirSync(rawDir)
      .filter((f) => f.startsWith('conv_') && f.endsWith('.md'))
      .map((f) => path.join(rawDir, f))
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      files = [];
    } else {
      throw err;
    }
  }

  const outDir = defaultProvisionalDigestDir(workspaceRoot);
  return files.filter((f) => {
    try {
      const input = readConversationDigestInput(workspaceRoot, f);
      return !findExistingProvisionalDigest(outDir, input);
    } catch {
      return false;
    }
  });
}

async function indexProvisionalDigestFile(
  workspaceRoot: string,
  markdownPath: string,
): Promise<{ indexed: boolean; error?: string }> {
  try {
    const settings = loadProjectSettings(workspaceRoot);
    const config = resolveMemoryConfig(settings, workspaceRoot);
    const store = new MemoryStore(path.join(config.wikiDir, 'index.db'), config);
    const embedder = { embed: async (_texts: string[]) => [], initialize: async () => {} };
    const indexer = new MemoryIndexer(store, embedder, config);
    await indexer.indexFile(markdownPath);
    return { indexed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { indexed: false, error: message };
  }
}

export async function digestConversationFile(options: DigestFileOptions): Promise<ProvisionalDigestResult> {
  const outDir = options.outDir
    ? path.resolve(options.workspaceRoot, options.outDir)
    : defaultProvisionalDigestDir(options.workspaceRoot);
  const input = readConversationDigestInput(options.workspaceRoot, options.inputPath);

  const existingPath = findExistingProvisionalDigest(outDir, input);
  if (existingPath) {
    const indexResult = await indexProvisionalDigestFile(options.workspaceRoot, existingPath);
    return {
      markdown: existingPath,
      status: 'provisional',
      contentHash: input.contentHash,
      skipped: true,
      ...indexResult,
    };
  }

  const provider = await createLlamaLocalDigestProvider(options.modelId);
  try {
    const markdown = await provider.generateDigestMarkdown(input, {
      modelId: options.modelId,
      maxInputChars: options.maxInputChars ?? DEFAULT_DIGEST_MAX_INPUT_CHARS,
      timeoutMs: options.timeoutMs ?? DEFAULT_DIGEST_TIMEOUT_MS,
    });

    const markdownPath = writeProvisionalDigestFile(outDir, input, markdown);
    const indexResult = await indexProvisionalDigestFile(options.workspaceRoot, markdownPath);

    return {
      markdown: markdownPath,
      status: 'provisional',
      contentHash: input.contentHash,
      skipped: false,
      ...indexResult,
    };
  } finally {
    await provider.dispose?.();
  }
}

export function summarizePendingConversations(workspaceRoot: string): DigestPendingCandidateSummary {
  const digestConfig = resolveConversationDigestConfig(loadProjectSettings(workspaceRoot));
  if (!digestConfig || digestConfig.enabled === false) {
    return { initialized: false, pending: 0, reason: 'not-initialized' };
  }

  const candidates = discoverPendingConversationFiles(workspaceRoot);
  if (candidates.length === 0) {
    return { initialized: true, pending: 0, reason: 'no-pending' };
  }

  return { initialized: true, pending: candidates.length };
}

export async function digestPendingConversations({
  workspaceRoot,
  digestFn = digestConversationFile,
  onProgress,
}: {
  workspaceRoot: string;
  digestFn?: (opts: DigestFileOptions) => Promise<ProvisionalDigestResult>;
  onProgress?: (progress: { processed: number; skipped: number; errors: number }) => void | Promise<void>;
}): Promise<DigestPendingResult> {
  const digestConfig = resolveConversationDigestConfig(loadProjectSettings(workspaceRoot));
  if (!digestConfig || digestConfig.enabled === false) {
    return { ok: true, initialized: false, action: 'noop', reason: 'not-initialized' };
  }

  const lockPath = digestLockPath(workspaceRoot);
  if (!tryAcquireProcessLock(lockPath)) {
    return { ok: true, initialized: true, action: 'noop', reason: 'locked' };
  }

  try {
    const candidates = discoverPendingConversationFiles(workspaceRoot);

    if (candidates.length === 0) {
      return { ok: true, initialized: true, action: 'noop', reason: 'no-pending' };
    }

    let count = 0;
    let skipped = 0;
    let errors = 0;

    for (const filePath of candidates) {
      try {
        const result = await digestFn({
          workspaceRoot,
          inputPath: filePath,
          modelId: digestConfig.modelId,
        });
        if (result.skipped) {
          skipped++;
        } else {
          count++;
        }
      } catch {
        errors++;
      }

      if (onProgress) {
        await onProgress({ processed: count, skipped, errors });
      }
    }

    return { ok: true, initialized: true, action: 'digested', count, skipped, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, initialized: true, action: 'error', error: message };
  } finally {
    releaseLock(lockPath);
  }
}

export async function initializeConversationDigestModel(
  input: InitializeConversationDigestInput,
): Promise<ConversationDigestInitResult> {
  try {
    getDigestModelSpec(input.modelId);
    if (input.allowDownload !== true) {
      return {
        initialized: false,
        modelId: input.modelId,
        error: 'Digest model initialization requires explicit download permission',
      };
    }

    const loadedProvider = await createLlamaLocalDigestProvider(input.modelId);
    await loadedProvider?.dispose?.();

    const initializedAt = new Date().toISOString();

    writeConversationDigestSettings(input.workspaceRoot, {
      enabled: input.enabled ?? true,
      initialized: true,
      modelId: input.modelId,
      initializedAt,
    });

    await digestPendingConversations({ workspaceRoot: input.workspaceRoot });

    return {
      initialized: true,
      modelId: input.modelId,
      initializedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      initialized: false,
      modelId: input.modelId,
      error: message,
    };
  }
}
