import { spawnSync } from 'node:child_process';
import { parseArgs, numberFlag } from '../../cli/utils/args.js';
import {
  DEFAULT_DIGEST_TIMEOUT_MS,
  DIGEST_TIMEOUT_GRACE_MS,
  DIGEST_WORKER_FLAG,
  DIGEST_WORKER_RESULT_PREFIX,
} from './constants.js';

interface DigestWorkerResult {
  markdown: string;
  status: 'provisional';
}

function isDigestWorkerResult(value: unknown): value is DigestWorkerResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return typeof record.markdown === 'string' && record.status === 'provisional';
}

function parseDigestWorkerSuccess(stdout: string): boolean {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(DIGEST_WORKER_RESULT_PREFIX));

  if (!line) return false;

  try {
    return isDigestWorkerResult(JSON.parse(line.slice(DIGEST_WORKER_RESULT_PREFIX.length)));
  } catch {
    return false;
  }
}

export function isDigestWorkerInvocation(args: string[]): boolean {
  return parseArgs(args).flags.get(DIGEST_WORKER_FLAG) === true;
}

export function runDigestFileInWorker(args: string[]): number | undefined {
  const parsed = parseArgs(args);
  if (parsed.flags.get(DIGEST_WORKER_FLAG) === true) return undefined;

  const entrypoint = process.argv[1];
  if (!entrypoint) return undefined;

  const timeoutMs = numberFlag(parsed.flags, 'timeout-ms', DEFAULT_DIGEST_TIMEOUT_MS);
  const result = spawnSync(
    process.execPath,
    [entrypoint, 'memory', 'digest-file', ...args, `--${DIGEST_WORKER_FLAG}`],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
      timeout: timeoutMs + DIGEST_TIMEOUT_GRACE_MS,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);

  const workerSucceeded = parseDigestWorkerSuccess(result.stdout);
  if (result.stderr && !workerSucceeded) process.stderr.write(result.stderr);
  if (result.status === 0 || workerSucceeded) return 0;
  if (result.status !== null) return result.status;
  return 1;
}
