import * as fs from 'node:fs';
import * as path from 'node:path';

export function atomicWriteTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function atomicWriteJsonFile(filePath: string, value: unknown): void {
  atomicWriteTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function tryWriteFileExclusive(filePath: string, content: string): boolean {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(filePath, content, { flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

export async function acquireLock(lockPath: string, timeoutMs: number, retryMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (tryWriteFileExclusive(lockPath, String(process.pid))) return true;
    } catch {
      // Preserve fail-open retry behavior for transient lock-file write errors.
    }
    await new Promise((r) => setTimeout(r, retryMs));
  }
  return false;
}

export function releaseLock(lockPath: string, opts: { ignoreErrors?: boolean } = {}): void {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    if (opts.ignoreErrors || (err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

export function tryAcquireProcessLock(lockPath: string): boolean {
  const lockContent = JSON.stringify({ pid: process.pid });

  if (tryWriteFileExclusive(lockPath, lockContent)) return true;

  let pid: number | undefined;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    pid = (JSON.parse(raw) as { pid: number }).pid;
  } catch {
    // Unparseable lockfiles are treated as stale.
  }

  if (pid !== undefined) {
    try {
      process.kill(pid, 0);
      return false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') return false;
    }
  }

  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Ignore if another process already removed the stale lock.
  }

  return tryWriteFileExclusive(lockPath, lockContent);
}
