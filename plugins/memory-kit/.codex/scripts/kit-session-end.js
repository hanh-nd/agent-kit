#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_RAW_DIR } from './constants.js';
import { normalizeTranscript } from './normalize.js';
import { acquireFileLock, getProvider, parseTranscript, releaseFileLock, runWhenInvoked } from './utils.js';
function formatTurns(transcriptPath) {
    const transcript = parseTranscript(transcriptPath);
    if (transcript.messages.length === 0)
        return '';
    const now = new Date().toISOString();
    const lines = [`### ${now}`];
    for (const msg of transcript.messages) {
        const normalized = normalizeTranscript(msg.content);
        if (normalized.replace(/\s/g, '').length < 5)
            continue;
        const role = msg.role === 'assistant' || msg.role === 'gemini' ? 'Assistant' : 'User';
        lines.push(`**${role}:** ${normalized}`);
        lines.push('');
    }
    return lines.join('\n');
}
function sanitizeSessionId(sessionId) {
    return String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
}
runWhenInvoked(import.meta.url, async () => {
    let stdinData = '';
    await new Promise((resolve) => {
        process.stdin.on('data', (chunk) => (stdinData += chunk));
        process.stdin.on('end', () => resolve());
    });
    let transcriptPath;
    let sessionId;
    try {
        const parsed = JSON.parse(stdinData);
        if (typeof parsed === 'object' && parsed !== null) {
            const p = parsed;
            transcriptPath = typeof p.transcript_path === 'string' ? p.transcript_path : undefined;
            sessionId = typeof p.session_id === 'string' || typeof p.session_id === 'number' ? p.session_id : undefined;
        }
    }
    catch {
        // fall through
    }
    if (!transcriptPath) {
        console.log(JSON.stringify({}));
        process.exit(0);
    }
    let content;
    try {
        content = formatTurns(transcriptPath);
    }
    catch {
        console.log(JSON.stringify({}));
        process.exit(0);
    }
    if (!content) {
        console.log(JSON.stringify({}));
        process.exit(0);
    }
    const provider = getProvider(transcriptPath);
    const now = new Date();
    const safeTimestamp = now.toISOString().replace(/[:.]/g, '-');
    const sanitizedSession = sessionId ? sanitizeSessionId(sessionId) : '';
    const suffix = sanitizedSession || safeTimestamp;
    const todayPath = path.join(WIKI_RAW_DIR, `conv_${provider}_${suffix}.md`);
    const lockPath = `${todayPath}.lock`;
    try {
        fs.mkdirSync(WIKI_RAW_DIR, { recursive: true });
    }
    catch {
        // ignore
    }
    const acquired = await acquireFileLock(lockPath);
    try {
        fs.writeFileSync(todayPath, `${content}\n`, 'utf8');
    }
    catch (err) {
        console.error('[memory-kit] Failed to write session end content:', err);
    }
    finally {
        if (acquired)
            releaseFileLock(lockPath);
    }
    console.log(JSON.stringify({}));
    process.exit(0);
});
