#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { countTests } from '../scripts/count-tests.js';
import { KIT_DIR, KIT_PATH, PROJECT_DIR } from './constants.js';
import { ENFORCEMENT_MODES } from './security/constants.js';
import { exitWithSuccess, isRecord, noOp, readStdin, runWhenInvoked } from './utils.js';
function ensureDirectories() {
    const dirs = ['handoffs', 'logs'];
    for (const dir of dirs) {
        const dirPath = path.join(KIT_PATH, dir);
        if (!fs.existsSync(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            catch {
                // Silently fail if we can't create directories
            }
        }
    }
}
function ensureGitExclusion() {
    const gitDir = path.join(PROJECT_DIR, '.git');
    if (!fs.existsSync(gitDir))
        return;
    const gitExcludePath = path.join(gitDir, 'info', 'exclude');
    try {
        const infoDir = path.dirname(gitExcludePath);
        if (!fs.existsSync(infoDir)) {
            fs.mkdirSync(infoDir, { recursive: true });
        }
        let content = '';
        if (fs.existsSync(gitExcludePath)) {
            content = fs.readFileSync(gitExcludePath, 'utf8');
        }
        if (!content.includes(KIT_DIR)) {
            const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
            fs.appendFileSync(gitExcludePath, `${separator}${KIT_DIR}\n`);
        }
    }
    catch {
        // Silently fail to not block the server startup
    }
}
const DEFAULT_SETTINGS = {
    security: {
        allowOutside: false,
        allowedOutsidePaths: [],
        enforcementMode: ENFORCEMENT_MODES.BLOCK,
    },
    project: {
        // Auto-detected each session: true once the project has a meaningful test suite (>5 test files).
        // Gates the testing phase in the `code` skill. Never auto-reset to false once true.
        hasTests: false,
        // User-controlled: set to false to skip the testing phase even when hasTests is true.
        runTests: true,
    },
};
function parseSettings(content) {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : {};
}
function ensureSettings() {
    const settingsPath = path.join(KIT_PATH, 'settings.json');
    let current = {};
    if (fs.existsSync(settingsPath)) {
        try {
            current = parseSettings(fs.readFileSync(settingsPath, 'utf8'));
        }
        catch {
            // Corrupted — start fresh
        }
    }
    let changed = false;
    if (!isRecord(current.security)) {
        current.security = {};
        changed = true;
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS.security)) {
        const settingKey = key;
        if (current.security[settingKey] === undefined) {
            current.security[settingKey] = value;
            changed = true;
        }
    }
    if (!isRecord(current.project)) {
        current.project = {};
        changed = true;
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS.project)) {
        const settingKey = key;
        if (current.project[settingKey] === undefined) {
            current.project[settingKey] = value;
            changed = true;
        }
    }
    // Auto-detect test suite: once true, never revert.
    if (!current.project.hasTests) {
        const testCount = countTests(PROJECT_DIR);
        if (testCount > 5) {
            current.project.hasTests = true;
            changed = true;
        }
    }
    if (changed) {
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2));
        }
        catch {
            // Silently fail to not block session startup
        }
    }
}
/**
 * SessionStart Hook — Kit Initializer
 */
runWhenInvoked(import.meta.url, async () => {
    const raw = await readStdin();
    let input;
    try {
        const parsed = JSON.parse(raw);
        input = isRecord(parsed) ? parsed : {};
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Agent-Kit failed to initialize', message);
        noOp();
    }
    ensureDirectories();
    ensureGitExclusion();
    ensureSettings();
    exitWithSuccess(`🛠️ Agent-Kit ready | Session #${input.session_id}`);
});
