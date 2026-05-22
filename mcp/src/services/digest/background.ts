import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DIGEST_LOCKFILE_REL_PATH,
  DIGEST_WORKER_FLAG,
  DIGEST_WORKER_LOG_REL_PATH,
  DIGEST_WORKER_STATUS_REL_PATH,
} from './constants.js';
import { digestPendingConversations, summarizePendingConversations } from './processor.js';
import type {
  DigestPendingLauncherResult,
  DigestPendingResult,
  DigestWorkerStatus,
  DigestWorkerState,
  DigestFileOptions,
  ProvisionalDigestResult,
} from './types.js';
import { atomicWriteJsonFile } from '../../utils/files.js';
import { isRecord } from '../../utils/json.js';

export function digestWorkerDirPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, path.dirname(DIGEST_WORKER_STATUS_REL_PATH));
}

export function digestWorkerStatusPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DIGEST_WORKER_STATUS_REL_PATH);
}

export function digestWorkerLogPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DIGEST_WORKER_LOG_REL_PATH);
}

function digestWorkerLockPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DIGEST_LOCKFILE_REL_PATH);
}

function isoNow(): string {
  return new Date().toISOString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyStatus(state: DigestWorkerState, pendingAtStart: number, startedAt = isoNow()): DigestWorkerStatus {
  return {
    state,
    pid: null,
    startedAt,
    updatedAt: startedAt,
    pendingAtStart,
    processed: 0,
    skipped: 0,
    errors: 0,
  };
}

const WORKER_STATES = new Set<DigestWorkerState>([
  'running',
  'complete',
  'failed',
  'not-initialized',
  'no-pending',
  'locked',
  'stale',
]);

function isDigestWorkerStatus(value: unknown): value is DigestWorkerStatus {
  if (!isRecord(value)) return false;

  return (
    typeof value.state === 'string' &&
    WORKER_STATES.has(value.state as DigestWorkerState) &&
    (typeof value.pid === 'number' || value.pid === null) &&
    typeof value.startedAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.pendingAtStart === 'number' &&
    typeof value.processed === 'number' &&
    typeof value.skipped === 'number' &&
    typeof value.errors === 'number' &&
    (value.lastError === undefined || typeof value.lastError === 'string')
  );
}

export function readDigestWorkerStatus(workspaceRoot: string): DigestWorkerStatus | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(digestWorkerStatusPath(workspaceRoot), 'utf8')) as unknown;
    return isDigestWorkerStatus(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeDigestWorkerStatus(workspaceRoot: string, status: DigestWorkerStatus): void {
  atomicWriteJsonFile(digestWorkerStatusPath(workspaceRoot), status);
}

export function appendDigestWorkerLog(workspaceRoot: string, message: string): void {
  try {
    const logPath = digestWorkerLogPath(workspaceRoot);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${isoNow()}] ${message}\n`, 'utf8');
  } catch {
    // Diagnostics must never block hook startup or worker completion.
  }
}

export function isLivePid(pid: number | null): boolean {
  if (pid === null || !Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function readLockPid(workspaceRoot: string): number | null | undefined {
  const lockPath = digestWorkerLockPath(workspaceRoot);
  if (!fs.existsSync(lockPath)) return undefined;

  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as unknown;
    return isRecord(parsed) && typeof parsed.pid === 'number' ? parsed.pid : null;
  } catch {
    return null;
  }
}

export function statusFromPendingResult(
  result: DigestPendingResult,
  startedAt: string,
  pendingAtStart: number,
): DigestWorkerStatus {
  const updatedAt = isoNow();

  if (!result.ok) {
    return {
      ...emptyStatus('failed', pendingAtStart, startedAt),
      updatedAt,
      errors: 1,
      lastError: result.error,
    };
  }

  if (result.action === 'digested') {
    return {
      state: 'complete',
      pid: null,
      startedAt,
      updatedAt,
      pendingAtStart,
      processed: result.count,
      skipped: result.skipped,
      errors: result.errors,
    };
  }

  return {
    ...emptyStatus(result.reason, pendingAtStart, startedAt),
    updatedAt,
  };
}

export async function runDigestPendingWorker(input: {
  workspaceRoot: string;
  pendingAtStart?: number;
  digestFn?: (opts: DigestFileOptions) => Promise<ProvisionalDigestResult>;
}): Promise<DigestWorkerStatus> {
  const startedAt = isoNow();
  let pendingAtStart = input.pendingAtStart ?? 0;

  try {
    const summary = summarizePendingConversations(input.workspaceRoot);
    if (input.pendingAtStart === undefined) {
      pendingAtStart = summary.initialized ? summary.pending : 0;
    }

    const runningStatus: DigestWorkerStatus = {
      ...emptyStatus('running', pendingAtStart, startedAt),
      pid: process.pid,
    };

    writeDigestWorkerStatus(input.workspaceRoot, runningStatus);
    appendDigestWorkerLog(input.workspaceRoot, `worker started pid=${process.pid} pending=${pendingAtStart}`);

    const result = await digestPendingConversations({
      workspaceRoot: input.workspaceRoot,
      digestFn: input.digestFn,
      onProgress: (progress) => {
        const currentStatus: DigestWorkerStatus = {
          ...runningStatus,
          updatedAt: isoNow(),
          processed: progress.processed,
          skipped: progress.skipped,
          errors: progress.errors,
        };
        writeDigestWorkerStatus(input.workspaceRoot, currentStatus);
      },
    });
    const status = statusFromPendingResult(result, startedAt, pendingAtStart);
    writeDigestWorkerStatus(input.workspaceRoot, status);
    appendDigestWorkerLog(
      input.workspaceRoot,
      `worker finished state=${status.state} processed=${status.processed} skipped=${status.skipped} errors=${status.errors}`,
    );
    return status;
  } catch (err) {
    const status: DigestWorkerStatus = {
      ...emptyStatus('failed', pendingAtStart, startedAt),
      updatedAt: isoNow(),
      errors: 1,
      lastError: errorMessage(err),
    };
    writeDigestWorkerStatus(input.workspaceRoot, status);
    appendDigestWorkerLog(input.workspaceRoot, `worker failed error=${status.lastError}`);
    return status;
  }
}

export function launchDigestPendingWorker(input: {
  workspaceRoot: string;
  args: string[];
  entrypoint: string | undefined;
}): DigestPendingLauncherResult {
  const startedAt = isoNow();
  let pendingAtStart = 0;

  try {
    const previousStatus = readDigestWorkerStatus(input.workspaceRoot);
    if (previousStatus?.state === 'running' && isLivePid(previousStatus.pid)) {
      const status: DigestWorkerStatus = {
        ...previousStatus,
        state: 'locked',
        updatedAt: isoNow(),
        lastError: undefined,
      };
      writeDigestWorkerStatus(input.workspaceRoot, status);
      return { ok: true, mode: 'background-launcher', status, spawned: false, reason: 'locked' };
    }

    const lockPid = readLockPid(input.workspaceRoot);
    if (lockPid !== undefined && isLivePid(lockPid)) {
      const status = emptyStatus('locked', 0, startedAt);
      writeDigestWorkerStatus(input.workspaceRoot, status);
      return { ok: true, mode: 'background-launcher', status, spawned: false, reason: 'locked' };
    }

    const summary = summarizePendingConversations(input.workspaceRoot);
    if (!summary.initialized) {
      const status = emptyStatus('not-initialized', 0, startedAt);
      writeDigestWorkerStatus(input.workspaceRoot, status);
      return { ok: true, mode: 'background-launcher', status, spawned: false, reason: 'not-initialized' };
    }

    if (summary.pending === 0) {
      const status = emptyStatus('no-pending', 0, startedAt);
      writeDigestWorkerStatus(input.workspaceRoot, status);
      return { ok: true, mode: 'background-launcher', status, spawned: false, reason: 'no-pending' };
    }

    pendingAtStart = summary.pending;

    if (!input.entrypoint) {
      const status: DigestWorkerStatus = {
        ...emptyStatus('failed', pendingAtStart, startedAt),
        errors: 1,
        lastError: 'CLI entrypoint is unavailable',
      };
      writeDigestWorkerStatus(input.workspaceRoot, status);
      return {
        ok: false,
        mode: 'background-launcher',
        status,
        spawned: false,
        reason: 'spawn-failed',
        error: status.lastError,
      };
    }

    const child = spawn(process.execPath, [input.entrypoint, 'memory', 'digest-pending', ...input.args, `--${DIGEST_WORKER_FLAG}`], {
      cwd: input.workspaceRoot,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    if (!child.pid) {
      throw new Error('worker process did not expose a pid');
    }

    const status: DigestWorkerStatus = {
      ...emptyStatus('running', pendingAtStart, startedAt),
      pid: child.pid,
    };
    writeDigestWorkerStatus(input.workspaceRoot, status);
    appendDigestWorkerLog(input.workspaceRoot, `launcher spawned pid=${child.pid} pending=${pendingAtStart}`);
    return { ok: true, mode: 'background-launcher', status, spawned: true, pid: child.pid };
  } catch (err) {
    const status: DigestWorkerStatus = {
      ...emptyStatus('failed', pendingAtStart, startedAt),
      errors: 1,
      lastError: errorMessage(err),
    };
    writeDigestWorkerStatus(input.workspaceRoot, status);
    appendDigestWorkerLog(input.workspaceRoot, `launcher failed error=${status.lastError}`);
    return {
      ok: false,
      mode: 'background-launcher',
      status,
      spawned: false,
      reason: 'spawn-failed',
      error: status.lastError,
    };
  }
}
