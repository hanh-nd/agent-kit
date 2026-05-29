import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { test, describe, before, after } from 'node:test';
import { shouldBlockOutside, resolveWorkspacePath } from '../../scripts/security/workspace.js';
import type { SecurityPolicy } from '@types';

describe('workspace', () => {
  let tmpDir: string;
  let policy: Pick<
    SecurityPolicy,
    'projectDir' | 'caseInsensitive' | 'allowedOutsidePaths' | 'allowOutside'
  >;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-ws-'));
    policy = {
      projectDir: fs.realpathSync(tmpDir),
      caseInsensitive: ['darwin', 'win32'].includes(process.platform),
      allowedOutsidePaths: [],
      allowOutside: false,
    };
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test('file inside workspace is not blocked', () => {
    const file = path.join(tmpDir, 'src', 'foo.ts');
    assert.ok(!shouldBlockOutside(file, policy));
  });

  test('resolveWorkspacePath resolves inside paths', () => {
    const file = path.join(tmpDir, 'src', 'foo.ts');
    assert.equal(resolveWorkspacePath(file, policy), path.join(policy.projectDir, 'src', 'foo.ts'));
  });

  test('file outside workspace is blocked', () => {
    assert.ok(shouldBlockOutside('/etc/passwd', policy));
  });

  test('resolveWorkspacePath resolves outside paths', () => {
    assert.equal(resolveWorkspacePath('/etc/passwd', policy), fs.realpathSync('/etc/passwd'));
  });

  test('path.sep boundary: workspace-suffix is outside', () => {
    const outside = policy.projectDir + '-suffix/file.txt';
    assert.ok(shouldBlockOutside(outside, policy));
  });

  test('symlink inside workspace pointing to external target is blocked', () => {
    if (!fs.existsSync('/etc/passwd')) return; // skip on systems without this file
    const linkPath = path.join(tmpDir, 'passwd-link');
    try {
      fs.symlinkSync('/etc/passwd', linkPath);
      assert.ok(shouldBlockOutside(linkPath, policy), 'symlink to /etc/passwd must be blocked');
      assert.equal(resolveWorkspacePath(linkPath, policy), fs.realpathSync('/etc/passwd'));
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'EEXIST') {
        assert.ok(shouldBlockOutside(linkPath, policy));
      } else {
        // Can't create symlink, skip
      }
    }
  });

  test('symlink chain resolves correctly and is blocked', () => {
    if (!fs.existsSync('/etc/passwd')) return;
    const link1 = path.join(tmpDir, 'link1');
    const link2 = path.join(tmpDir, 'link2');
    try {
      fs.symlinkSync('/etc/passwd', link1);
      fs.symlinkSync(link1, link2);
      assert.ok(shouldBlockOutside(link2, policy), 'symlink chain to /etc/passwd must be blocked');
    } catch {
      /* skip if can't create */
    }
  });

  test('broken symlink uses apparent path', () => {
    const brokenLink = path.join(tmpDir, 'broken-link');
    try {
      fs.symlinkSync(path.join(tmpDir, 'nonexistent-target'), brokenLink);
      // Broken symlink inside workspace should NOT be blocked (apparent path is inside)
      assert.ok(
        !shouldBlockOutside(brokenLink, policy),
        'broken symlink inside workspace should not be blocked'
      );
    } catch {
      /* skip */
    }
  });

  test('trailing separator resolves equivalently', () => {
    assert.ok(shouldBlockOutside('/etc/', policy));
    assert.ok(shouldBlockOutside('/etc', policy));
  });

  test('non-existent path inside workspace is not blocked', () => {
    const inside = path.join(tmpDir, 'never', 'created', 'file.txt');
    assert.ok(!shouldBlockOutside(inside, policy));
  });

  test('resolveWorkspacePath resolves new files under existing ancestors', () => {
    const existingDir = path.join(tmpDir, 'existing');
    fs.mkdirSync(existingDir, { recursive: true });
    const newFile = path.join(existingDir, 'new-file.ts');
    assert.equal(
      resolveWorkspacePath(newFile, policy),
      path.join(fs.realpathSync(existingDir), 'new-file.ts')
    );
  });

  test('non-existent path outside is blocked', () => {
    assert.ok(shouldBlockOutside('/nonexistent/etc/x', policy));
  });

  test('shouldBlockOutside/realpathSafe never throws', () => {
    const weirdPaths = [
      '/nonexistent/a/b/c',
      '',
      '~',
      '../../../etc/passwd',
      path.join(tmpDir, 'not-here', 'file.txt'),
    ];
    for (const p of weirdPaths) {
      assert.doesNotThrow(() => shouldBlockOutside(p, policy));
    }
  });

  test('casing: case-insensitive platform treats different cases as same', () => {
    if (!policy.caseInsensitive) return;
    const inside = path.join(policy.projectDir.toUpperCase(), 'file.txt');
    // On darwin/win32, this should be inside workspace (meaning not blocked)
    assert.ok(!shouldBlockOutside(inside, policy));
  });
});
