import * as fs from 'node:fs';
import * as path from 'node:path';
import { KIT_PATH } from '../constants.js';
import { isRecord, noOp } from '../utils.js';
import { ENFORCEMENT_MODES } from './constants.js';
export function blockAction(reason) {
    process.stderr.write(`Security Block: ${reason}\n`);
    process.exit(2);
}
export function enforce(reason, policy) {
    if (policy.enforcementMode === ENFORCEMENT_MODES.AUDIT) {
        try {
            const logPath = path.join(KIT_PATH, 'logs', 'security-audit.log');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] AUDIT: ${reason}\n`);
        }
        catch {
            // Never block on logging failure
        }
        noOp();
    }
    else {
        blockAction(reason);
    }
}
export function isBlockedFilename(name, policy) {
    const lower = name.toLowerCase();
    if (policy.forbiddenFiles.some((forbiddenFile) => lower === forbiddenFile))
        return true;
    if (policy.forbiddenRegexes.some((regex) => regex.test(name)))
        return true;
    return false;
}
export function isInForbiddenDir(filePath, policy) {
    const segments = filePath.split(/[/\\]+/);
    return segments.find((segment) => policy.forbiddenDirs.includes(segment.toLowerCase())) ?? null;
}
export function loadSettings() {
    try {
        const settingsPath = path.join(KIT_PATH, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return isRecord(parsed) ? parsed : {};
        }
    }
    catch {
        // Fall through to defaults on parse error
    }
    return {};
}
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((entry) => typeof entry === 'string')
        : [];
}
export function getSecurityConfig(settings) {
    const securitySettings = isRecord(settings.security) ? settings.security : {};
    const enforcementMode = securitySettings.enforcementMode === ENFORCEMENT_MODES.AUDIT
        ? ENFORCEMENT_MODES.AUDIT
        : ENFORCEMENT_MODES.BLOCK;
    return {
        allowOutside: typeof securitySettings.allowOutside === 'boolean' ? securitySettings.allowOutside : false,
        allowedOutsidePaths: stringArray(securitySettings.allowedOutsidePaths),
        enforcementMode,
    };
}
