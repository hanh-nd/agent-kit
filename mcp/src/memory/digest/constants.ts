import * as path from 'node:path';

export const DEFAULT_DIGEST_MODEL_ID = 'qwen2.5-1.5b-instruct-q4';
export const DEFAULT_DIGEST_MAX_INPUT_CHARS = 3000;
export const DEFAULT_DIGEST_TIMEOUT_MS = 120_000;
export const DIGEST_TIMEOUT_GRACE_MS = 5_000;
export const DIGEST_WORKER_FLAG = '__agent-kit-digest-worker';
export const DIGEST_WORKER_RESULT_PREFIX = 'AGENT_KIT_DIGEST_RESULT ';

export const KIT_DIR = '.agent-kit';
export const WIKI_DIR = path.join(KIT_DIR, 'wiki');
export const WIKI_RAW_DIR = path.join(WIKI_DIR, 'raw');
export const PROVISIONAL_DIGEST_DIR = path.join(WIKI_DIR, 'compiled', 'provisional', 'conversation-digests');
export const DIGEST_LOCKFILE_REL_PATH = path.join(KIT_DIR, 'digest-worker.lock');

export const LLAMA_CONTEXT_SIZE = 4096;
export const LLAMA_MAX_GENERATED_TOKENS = 512;
export const LLAMA_TEMPERATURE = 0.1;
