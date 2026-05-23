import * as os from 'os';
import * as path from 'path';

export const PROJECT_DIR =
  process.env.CODEX_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

export const AGENT_KIT_HOME = path.join(os.homedir(), '.agent-kit');
export const KIT_DIR = '.agent-kit';
export const KIT_PATH = path.join(PROJECT_DIR, KIT_DIR);
export const WIKI_DIR = path.join(KIT_PATH, 'wiki');
export const WIKI_RAW_DIR = path.join(WIKI_DIR, 'raw');
export const WIKI_COMPILED_DIR = path.join(WIKI_DIR, 'compiled');
export const WIKI_ARCHIVE_CONVERSATIONS_DIR = path.join(WIKI_DIR, 'archive', 'conversations');
