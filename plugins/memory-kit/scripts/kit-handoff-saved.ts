#!/usr/bin/env node

// PostToolUse hook — fires after every kit_save_handoff call.
// Matcher uses the tool definition name "kit_save_handoff" (stable across provider namespace changes).

import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_DIR, WIKI_RAW_DIR } from './constants.js';
import { acquireFileLock, noOp, readStdin, releaseFileLock, runWhenInvoked } from './utils.js';

interface PostToolUsePayload {
  tool_name?: string;
  tool_input?: { type?: string; slug?: string; files?: Record<string, string> };
  tool_response?: Array<{ type?: string; text?: string }>;
}

interface InboxEntry {
  timestamp: string;
  type: string;
  slug: string;
  relPath: string;
  summary: string;
}

function extractSavedAbsPath(payload: PostToolUsePayload): string | null {
  const blocks = payload.tool_response;
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    const text = block?.text;
    if (typeof text !== 'string') continue;
    if (text.startsWith('Error saving handoff:')) return null;
    const match = text.match(/✅ Saved to:\s*(\S.+?)\s*$/m);
    if (match) return match[1];
  }
  return null;
}

function deriveTypeAndSlug(
  absPath: string,
  fallback: { type?: string; slug?: string },
): { type: string; slug: string } {
  const type = path.basename(absPath) || fallback.type || 'unknown';
  const slug = path.basename(path.dirname(absPath)) || fallback.slug || 'unknown';
  return { type, slug };
}

function pickSummarySource(toolInput: PostToolUsePayload['tool_input']): string | undefined {
  const files = toolInput?.files;
  if (!files || typeof files !== 'object') return undefined;
  if (typeof files['README.md'] === 'string') return files['README.md'];
  return Object.values(files).find((v): v is string => typeof v === 'string');
}

function deriveSummary(content: string | undefined): string {
  for (const line of (content ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed;
    }
  }
  return '(no summary)';
}

function formatInboxEntry(entry: InboxEntry): string {
  return (
    `\n## [${entry.timestamp}] handoff | ${entry.type}-${entry.slug}\n` +
    `- type: ${entry.type}\n` +
    `- slug: ${entry.slug}\n` +
    `- path: ${entry.relPath}\n` +
    `- summary: ${entry.summary}\n`
  );
}

runWhenInvoked(import.meta.url, async () => {
  const stdinData = await readStdin();

  let payload: PostToolUsePayload;
  try {
    payload = JSON.parse(stdinData) as PostToolUsePayload;
  } catch {
    noOp();
  }

  const absPath = extractSavedAbsPath(payload);
  if (!absPath) {
    noOp();
  }

  const relPath = path.relative(PROJECT_DIR, absPath).split(path.sep).join('/');
  const { type, slug } = deriveTypeAndSlug(absPath, {
    type: payload.tool_input?.type,
    slug: payload.tool_input?.slug,
  });
  const summary = deriveSummary(pickSummarySource(payload.tool_input));
  const timestamp = new Date().toISOString().slice(0, 19);
  const entry = formatInboxEntry({ timestamp, type, slug, relPath, summary });

  try {
    fs.mkdirSync(WIKI_RAW_DIR, { recursive: true });
  } catch {
    // ignore
  }

  const inboxPath = path.join(WIKI_RAW_DIR, 'inbox.md');
  const lockPath = `${inboxPath}.lock`;
  const acquired = await acquireFileLock(lockPath);

  try {
    fs.appendFileSync(inboxPath, entry, 'utf8');
  } catch (err) {
    console.error('[memory-kit] Failed to append inbox entry:', err);
  } finally {
    if (acquired) {
      releaseFileLock(lockPath);
    } else {
      console.error('[memory-kit] inbox.md lock not acquired; relying on POSIX atomic append');
    }
  }

  noOp();
});
