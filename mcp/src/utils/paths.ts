import * as os from 'os';
import * as path from 'path';

export const AGENT_KIT_HOME = path.join(os.homedir(), '.agent-kit');
export const CREDENTIALS_FILE = path.join(AGENT_KIT_HOME, 'credentials');
export const GLOBAL_SETTINGS_FILE = path.join(AGENT_KIT_HOME, 'settings.json');
export const MODEL_CACHE_DIR = path.join(AGENT_KIT_HOME, 'cache', 'models');
export const FASTEMBED_CACHE_DIR = path.join(MODEL_CACHE_DIR, 'fastembed');
