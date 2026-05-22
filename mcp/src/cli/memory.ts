import {
  initializeConversationDigestModel,
  digestConversationFile,
  digestPendingConversations,
} from '../memory/digest/processor.js';
import { isDigestWorkerInvocation, runDigestFileInWorker } from '../memory/digest/worker.js';
import {
  DEFAULT_DIGEST_MAX_INPUT_CHARS,
  DEFAULT_DIGEST_MODEL_ID,
  DEFAULT_DIGEST_TIMEOUT_MS,
  DIGEST_WORKER_RESULT_PREFIX,
} from '../memory/digest/constants.js';
import { loadProjectSettings, resolveConversationDigestConfig } from '../tools/config.js';
import { parseArgs, stringFlag, numberFlag } from '../utils/args.js';
import { getWorkspaceRoot } from '../utils/utils.js';

function writeDigestFileResult(result: unknown, workerMode: boolean): void {
  if (workerMode) {
    process.stdout.write(DIGEST_WORKER_RESULT_PREFIX + JSON.stringify(result) + '\n');
    return;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

async function cmdDigestInit(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const modelId = stringFlag(parsed.flags, 'model') ?? DEFAULT_DIGEST_MODEL_ID;
  const result = await initializeConversationDigestModel({
    workspaceRoot: getWorkspaceRoot(),
    modelId,
    allowDownload: true,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.initialized ? 0 : 1;
}

async function cmdDigestFile(args: string[]): Promise<number> {
  const workerMode = isDigestWorkerInvocation(args);
  const workerResult = runDigestFileInWorker(args);
  if (workerResult !== undefined) return workerResult;

  const parsed = parseArgs(args);
  const workspaceRoot = getWorkspaceRoot();
  const digestConfig = resolveConversationDigestConfig(loadProjectSettings(workspaceRoot));
  const modelId = stringFlag(parsed.flags, 'model') ?? digestConfig?.modelId ?? DEFAULT_DIGEST_MODEL_ID;
  const inputPath = stringFlag(parsed.flags, 'input');

  if (!inputPath) {
    process.stderr.write('Usage: agent-kit-cli memory digest-file --input <path> --model <id>\n');
    return 1;
  }

  const result = await digestConversationFile({
    workspaceRoot,
    inputPath,
    modelId,
    outDir: stringFlag(parsed.flags, 'out'),
    maxInputChars: numberFlag(parsed.flags, 'max-input-chars', DEFAULT_DIGEST_MAX_INPUT_CHARS),
    timeoutMs: numberFlag(parsed.flags, 'timeout-ms', DEFAULT_DIGEST_TIMEOUT_MS),
  });

  writeDigestFileResult(result, workerMode);
  return 0;
}

async function cmdDigestPending(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.flags.get('hook') !== true) {
    process.stderr.write('Usage: agent-kit-cli memory digest-pending --hook\n');
    return 1;
  }

  const result = await digestPendingConversations({ workspaceRoot: getWorkspaceRoot() });
  process.stdout.write(JSON.stringify(result) + '\n');
  return 0;
}

export async function runMemoryCli(args: string[], _env: NodeJS.ProcessEnv): Promise<number> {
  const [command, ...rest] = args;
  try {
    if (command === 'digest-file') return await cmdDigestFile(rest);
    if (command === 'digest-init') return await cmdDigestInit(rest);
    if (command === 'digest-pending') return await cmdDigestPending(rest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write('[agent-kit] memory ' + (command ?? '') + ' failed: ' + message + '\n');
    return 1;
  }

  process.stderr.write('Usage: agent-kit-cli memory <digest-file|digest-init|digest-pending>\n');
  return 1;
}
