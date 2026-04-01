import * as path from 'path';

export const PROJECT_DIR =
  process.env.GEMINI_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const KIT_DIR = '.agent-kit';
export const KIT_PATH = path.join(PROJECT_DIR, KIT_DIR);
