// SYNC WITH: src/tools/config.ts — enforced by tests/security-parity.test.js
export const FORBIDDEN_FILES = [
    '.env',
    '.bashrc',
    '.zshrc',
    '.profile',
    '.bash_profile',
    '.bash_history',
    '.zsh_history',
    '.npmrc',
    '.yarnrc',
    '.netrc',
    '.gitconfig',
    'credentials',
];
export const FORBIDDEN_PATTERN_STRINGS = [
    '^\\.env$',
    '^\\.env[^a-z]',
    '^id_rsa',
    '^id_ed25519',
    '^id_ecdsa',
    '\\.pem$',
    'credentials\\.json$',
    'secrets\\.json$',
    'secret\\.json$',
];
export const FORBIDDEN_DIRS = ['.git', '.ssh', '.aws', '.kube', '.gnupg', '.docker'];
export const ENFORCEMENT_MODES = {
    BLOCK: 'block',
    AUDIT: 'audit',
};
export const CLAUDE_TOOL_ACTIONS = new Map([
    ['bash', 'exec'],
    ['read', 'read'],
    ['write', 'write'],
    ['edit', 'edit'],
    ['multiedit', 'edit'],
    ['notebookedit', 'edit'],
    ['glob', 'read'],
    ['grep', 'read'],
]);
export const CODEX_TOOL_ACTIONS = new Map([
    ['shell', 'exec'],
    ['shell_command', 'exec'],
    ['exec_command', 'exec'],
    ['unified_exec', 'exec'],
    ['apply_patch', 'edit'],
    ['applypatch', 'edit'],
    ['apply-patch', 'edit'],
    ['applypatchhandler', 'edit'],
    ['view_image', 'read'],
    ['list_dir', 'read'],
]);
export const GEMINI_TOOL_ACTIONS = new Map([
    ['run_shell_command', 'exec'],
    ['read_file', 'read'],
    ['read_many_files', 'read'],
    ['list_directory', 'read'],
    ['glob', 'read'],
    ['grep_search', 'read'],
    ['search_file_content', 'read'],
    ['write_file', 'write'],
    ['replace', 'edit'],
]);
