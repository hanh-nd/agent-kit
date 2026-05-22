#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { KIT_PATH, WIKI_ARCHIVE_CONVERSATIONS_DIR, WIKI_COMPILED_DIR, WIKI_RAW_DIR } from './constants.js';
import { runWhenInvoked } from './utils.js';
function checkInboxNudge() {
    const inboxPath = path.join(WIKI_RAW_DIR, 'inbox.md');
    try {
        const text = fs.readFileSync(inboxPath, 'utf8');
        const slugs = new Set();
        for (const line of text.split('\n')) {
            const match = line.match(/^- slug:\s*(.+)$/);
            if (match)
                slugs.add(match[1].trim());
        }
        if (slugs.size > 3) {
            return `\n[memory-kit] ${slugs.size} uncompiled handoffs (${[...slugs].join(', ')}). Run /wiki compile to index them.`;
        }
    }
    catch {
        // inbox doesn't exist or is unreadable
    }
    return '';
}
function ensureWikiDirs() {
    try {
        fs.mkdirSync(WIKI_RAW_DIR, { recursive: true });
        fs.mkdirSync(WIKI_COMPILED_DIR, { recursive: true });
        fs.mkdirSync(WIKI_ARCHIVE_CONVERSATIONS_DIR, { recursive: true });
    }
    catch {
        // Silently fail to not block session startup
    }
}
function ensureMemoryEnabled() {
    const settingsPath = path.join(KIT_PATH, 'settings.json');
    try {
        fs.mkdirSync(KIT_PATH, { recursive: true });
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
        const memory = (settings.memory ?? {});
        if (memory.enabled !== true) {
            settings.memory = { ...memory, enabled: true };
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        }
    }
    catch {
        // Silently fail to not block session startup
    }
}
runWhenInvoked(import.meta.url, async () => {
    await new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => (data += chunk));
        process.stdin.on('end', () => resolve());
    });
    ensureMemoryEnabled();
    ensureWikiDirs();
    const nudge = checkInboxNudge();
    console.log(JSON.stringify({
        systemMessage: '[memory-kit] Memory ready' + nudge,
    }));
    process.exit(0);
});
