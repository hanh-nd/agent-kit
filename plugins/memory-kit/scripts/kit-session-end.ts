#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { WIKI_RAW_DIR } from './constants.js';
import { normalizeTranscript } from './normalize.js';
import { acquireFileLock, parseTranscript, releaseFileLock, runWhenInvoked } from './utils.js';

function formatTurns(transcriptPath: string): string {
  const transcript = parseTranscript(transcriptPath);
  if (transcript.messages.length === 0) return '';

  const now = new Date().toISOString();
  const lines: string[] = [`### ${now}`];

  for (const msg of transcript.messages) {
    const normalized = normalizeTranscript(msg.content);
    if (normalized.replace(/\s/g, '').length < 5) continue;
    const role = msg.role === 'assistant' || msg.role === 'gemini' ? 'Assistant' : 'User';
    lines.push(`**${role}:** ${normalized}`);
    lines.push('');
  }

  return lines.join('\n');
}

runWhenInvoked(import.meta.url, async () => {
  let stdinData = '';
  await new Promise<void>((resolve) => {
    process.stdin.on('data', (chunk) => (stdinData += chunk));
    process.stdin.on('end', () => resolve());
  });

  let transcriptPath: string | undefined;
  try {
    const parsed: unknown = JSON.parse(stdinData);
    if (typeof parsed === 'object' && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      transcriptPath = typeof p.transcript_path === 'string' ? p.transcript_path : undefined;
    }
  } catch {
    // fall through
  }

  if (!transcriptPath) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  let content: string;
  try {
    content = formatTurns(transcriptPath);
  } catch {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  if (!content) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const now = new Date();
  const safeTimestamp = now.toISOString().replace(/[:.]/g, '-');
  const todayPath = path.join(WIKI_RAW_DIR, `conv_${safeTimestamp}.md`);
  const lockPath = `${todayPath}.lock`;

  try {
    fs.mkdirSync(WIKI_RAW_DIR, { recursive: true });
  } catch {
    // ignore
  }

  const acquired = await acquireFileLock(lockPath);
  try {
    fs.appendFileSync(todayPath, `\n${content}\n`, 'utf8');
  } catch (err) {
    console.error('[memory-kit] Failed to write session end content:', err);
  } finally {
    if (acquired) releaseFileLock(lockPath);
  }

  console.log(JSON.stringify({}));
  process.exit(0);
});
