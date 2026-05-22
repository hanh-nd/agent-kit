import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createTempDirTracker } from '../../__tests__/temp-dir.js';
import { DIGEST_LOCKFILE_REL_PATH } from '../digest/constants.js';
import { releaseLock, tryAcquireProcessLock } from '../../utils/files.js';

const tempDirs = createTempDirTracker();

afterEach(() => {
  tempDirs.cleanup();
});

function lockPath(workspace: string): string {
  return path.join(workspace, DIGEST_LOCKFILE_REL_PATH);
}

describe('tryAcquireProcessLock', () => {
  test('C1: no lockfile → creates it with current PID and returns true', () => {
    const workspace = tempDirs.makeTempDir('lockfile-c1-');
    const acquired = tryAcquireProcessLock(lockPath(workspace));
    assert.equal(acquired, true);
    const lockFile = path.join(workspace, '.agent-kit', 'digest-worker.lock');
    const content = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { pid: number };
    assert.equal(content.pid, process.pid);
  });

  test('C2: lockfile with live foreign PID → returns false without modifying file', () => {
    const workspace = tempDirs.makeTempDir('lockfile-c2-');
    const lockDir = path.join(workspace, '.agent-kit');
    const lockFile = path.join(lockDir, 'digest-worker.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    // Use process.pid as "live" pid (current process is definitely alive)
    const livePid = process.pid;
    fs.writeFileSync(lockFile, JSON.stringify({ pid: livePid }), 'utf8');
    const originalContent = fs.readFileSync(lockFile, 'utf8');

    const acquired = tryAcquireProcessLock(lockPath(workspace));
    assert.equal(acquired, false);
    // File must be unchanged
    assert.equal(fs.readFileSync(lockFile, 'utf8'), originalContent);
  });

  test('C3: lockfile with dead PID (ESRCH) → deletes stale lock, creates new one, returns true', () => {
    const workspace = tempDirs.makeTempDir('lockfile-c3-');
    const lockDir = path.join(workspace, '.agent-kit');
    const lockFile = path.join(lockDir, 'digest-worker.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    // PID 999999999 is virtually guaranteed to be dead
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 999999999 }), 'utf8');

    const acquired = tryAcquireProcessLock(lockPath(workspace));
    assert.equal(acquired, true);
    const content = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { pid: number };
    assert.equal(content.pid, process.pid);
  });

  test('C4: concurrent callers — only one returns true (wx atomicity)', async () => {
    const workspace = tempDirs.makeTempDir('lockfile-c4-');
    // Call twice in the same tick; first wins, second sees EEXIST with live PID.
    const r1 = tryAcquireProcessLock(lockPath(workspace));
    const r2 = tryAcquireProcessLock(lockPath(workspace));
    assert.equal(r1, true);
    assert.equal(r2, false);
  });

  test('stale unparseable lockfile → treated as stale, returns true', () => {
    const workspace = tempDirs.makeTempDir('lockfile-stale-');
    const lockDir = path.join(workspace, '.agent-kit');
    const lockFile = path.join(lockDir, 'digest-worker.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(lockFile, 'not-json', 'utf8');

    const acquired = tryAcquireProcessLock(lockPath(workspace));
    assert.equal(acquired, true);
  });
});

describe('releaseLock', () => {
  test('C5: lockfile exists → deletes it', () => {
    const workspace = tempDirs.makeTempDir('lockfile-c5-');
    assert.equal(tryAcquireProcessLock(lockPath(workspace)), true);
    const lockFile = path.join(workspace, '.agent-kit', 'digest-worker.lock');
    assert.equal(fs.existsSync(lockFile), true);
    releaseLock(lockPath(workspace));
    assert.equal(fs.existsSync(lockFile), false);
  });

  test('C6: no lockfile → does not throw', () => {
    const workspace = tempDirs.makeTempDir('lockfile-c6-');
    assert.doesNotThrow(() => releaseLock(lockPath(workspace)));
  });
});
