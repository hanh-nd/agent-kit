#!/usr/bin/env node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ENFORCEMENT_MODES, FORBIDDEN_DIRS, FORBIDDEN_FILES, FORBIDDEN_PATTERN_STRINGS, PROJECT_DIR, } from '../constants.js';
import { getSecurityConfig, loadSettings } from '../utils.js';
export const PATH_ARG_KEYS = new Set(['file_path', 'path', 'notebook_path']);
export const COMMAND_ARG_KEYS = new Set(['command']);
const KNOWN_ENV_VAR_NAMES = [
    'HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'USER',
    'LOGNAME',
    'TMPDIR',
    'TMP',
    'TEMP',
];
function realpathBestEffort(p) {
    try {
        return fs.realpathSync(p);
    }
    catch {
        return p;
    }
}
function expandTilde(p) {
    if (p === '~')
        return os.homedir();
    if (p.startsWith('~/') || p.startsWith('~\\'))
        return path.join(os.homedir(), p.slice(2));
    return p;
}
export function loadPolicy() {
    const settings = loadSettings();
    const cfg = getSecurityConfig(settings);
    const projectDir = realpathBestEffort(PROJECT_DIR);
    const homeDir = realpathBestEffort(os.homedir());
    const caseInsensitive = ['darwin', 'win32'].includes(process.platform);
    const forbiddenFiles = [...FORBIDDEN_FILES, ...cfg.additionalForbiddenFiles].map((f) => f.toLowerCase());
    const forbiddenRegexes = FORBIDDEN_PATTERN_STRINGS.map((p) => new RegExp(p, 'i'));
    const forbiddenDirs = [...FORBIDDEN_DIRS, ...cfg.additionalForbiddenDirs].map((d) => d.toLowerCase());
    const allowedOutsidePaths = cfg.allowedOutsidePaths
        .map((p) => expandTilde(p))
        .filter((p) => {
        try {
            fs.realpathSync(p);
            return true;
        }
        catch {
            return false;
        }
    })
        .map((p) => realpathBestEffort(p));
    const systemBinPaths = ['/usr/bin/', '/bin/', '/usr/local/bin/', ...cfg.additionalSystemBinPaths];
    const knownEnvVars = {};
    for (const name of KNOWN_ENV_VAR_NAMES) {
        if (process.env[name] !== undefined) {
            knownEnvVars[name] = process.env[name];
        }
    }
    return Object.freeze({
        enforcementMode: cfg.enforcementMode ?? ENFORCEMENT_MODES.BLOCK,
        projectDir,
        homeDir,
        caseInsensitive,
        forbiddenFiles: Object.freeze(forbiddenFiles),
        forbiddenRegexes: Object.freeze(forbiddenRegexes),
        forbiddenDirs: Object.freeze(forbiddenDirs),
        allowedOutsidePaths: Object.freeze(allowedOutsidePaths),
        allowOutside: cfg.allowOutside ?? false,
        systemBinPaths: Object.freeze(systemBinPaths),
        knownEnvVars: Object.freeze(knownEnvVars),
    });
}
