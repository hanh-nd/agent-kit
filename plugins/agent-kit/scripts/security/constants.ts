import type { SecurityAction } from '@types';

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
} as const;

/**
 * Shell verbs whose positional operands are file paths consumed as data.
 * Operands are path-checked with read semantics.
 */
export const SHELL_READER_VERBS = new Set([
  'cat',
  'less',
  'more',
  'head',
  'tail',
  'ls',
  'stat',
  'file',
  'wc',
  'diff',
  'source',
  '.',
]);

/** Shell verbs that write, move, or destroy their operand paths. */
export const SHELL_WRITER_VERBS = new Set([
  'cp',
  'mv',
  'rm',
  'tee',
  'truncate',
  'touch',
  'ln',
  'chmod',
  'chown',
]);

/**
 * Search/transform tools whose FIRST positional operand is a pattern or
 * program text, not a path. That operand is skipped; later operands are
 * still path-checked.
 */
export const SHELL_PATTERN_TOOLS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk']);

/**
 * Interpreters whose arguments are program text. Their invocations stay
 * opaque to path analysis (documented residual risk); the whole command is
 * emitted as an audit-only operation so the attempt lands in the decision log.
 */
export const SHELL_OPAQUE_INTERPRETERS = new Set([
  'node',
  'deno',
  'bun',
  'python',
  'python3',
  'ruby',
  'perl',
  'php',
]);

export const CLAUDE_TOOL_ACTIONS = new Map<string, SecurityAction>([
  ['bash', 'exec'],
  ['read', 'read'],
  ['write', 'write'],
  ['edit', 'edit'],
  ['multiedit', 'edit'],
  ['notebookedit', 'edit'],
  ['glob', 'read'],
  ['grep', 'read'],
]);

export const CODEX_TOOL_ACTIONS = new Map<string, SecurityAction>([
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

export const GEMINI_TOOL_ACTIONS = new Map<string, SecurityAction>([
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
