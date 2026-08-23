import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { evaluateOperation } from '../../scripts/security/evaluator.js';
import type { NormalizedOperation, SecurityPolicy } from '@types';

describe('evaluateOperation', () => {
  let tmpDir: string;
  let policy: SecurityPolicy;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-eval-'));
    policy = {
      enforcementMode: 'block',
      projectDir: fs.realpathSync(tmpDir),
      homeDir: os.homedir(),
      caseInsensitive: ['darwin', 'win32'].includes(process.platform),
      forbiddenFiles: ['.env', 'credentials'],
      forbiddenRegexes: [
        /^\.env$/i,
        /^\.env[^a-z]/i,
        /^id_rsa/i,
        /^id_ed25519/i,
        /^id_ecdsa/i,
        /\.pem$/i,
        /credentials\.json$/i,
      ],
      forbiddenDirs: ['.git', '.ssh', '.aws'],
      allowedOutsidePaths: [],
      allowOutside: false,
      knownEnvVars: { HOME: os.homedir() },
    };
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  function op(filePath: string): NormalizedOperation {
    return {
      provider: 'unknown',
      action: 'read',
      targetType: 'filesystem',
      path: filePath,
      cwd: policy.projectDir,
    };
  }

  test('allows ordinary workspace file targets', () => {
    const decision = evaluateOperation(op('src/app.ts'), policy);
    assert.equal(decision.decision, 'allow');
  });

  test('audits outside-workspace reads', () => {
    const decision = evaluateOperation(op('/etc/passwd'), policy);
    assert.equal(decision.decision, 'audit');
    assert.equal(decision.reasonCode, 'outside_workspace');
    assert.match(decision.message, /logged, allowed/);
  });

  test('denies outside-workspace writes', () => {
    const decision = evaluateOperation({ ...op('/etc/passwd'), action: 'write' }, policy);
    assert.equal(decision.decision, 'deny');
    assert.equal(decision.reasonCode, 'outside_workspace');
  });

  test('audits violations in audit mode', () => {
    const decision = evaluateOperation(op('/etc/passwd'), {
      ...policy,
      enforcementMode: 'audit',
    });
    assert.equal(decision.decision, 'audit');
    assert.equal(decision.reasonCode, 'outside_workspace');
  });

  test('denies sensitive filenames', () => {
    for (const fileName of ['.env', '.env.local', 'credentials.json', 'id_rsa', 'server.pem']) {
      const decision = evaluateOperation(op(path.join(policy.projectDir, fileName)), policy);
      assert.equal(decision.decision, 'deny', `${fileName} should be denied`);
      assert.equal(decision.reasonCode, 'sensitive_file');
    }
  });

  test('denies sensitive directories', () => {
    for (const target of ['.ssh/id_rsa', '.aws/credentials', '.git/config']) {
      const decision = evaluateOperation(op(path.join(policy.projectDir, target)), policy);
      assert.equal(decision.decision, 'deny', `${target} should be denied`);
      assert.equal(decision.reasonCode, 'sensitive_dir');
    }
  });

  test('audits authoring sensitive files inside the workspace, denies elsewhere', () => {
    const inside = path.join(policy.projectDir, '.env.local');
    assert.equal(evaluateOperation({ ...op(inside), action: 'write' }, policy).decision, 'audit');
    assert.equal(
      evaluateOperation({ ...op(path.join(os.homedir(), 'secrets/.env')), action: 'write' }, policy)
        .decision,
      'deny'
    );
    // Reads stay denied everywhere — the exfiltration guard.
    assert.equal(evaluateOperation(op(inside), policy).decision, 'deny');
  });

  test('uses canonical paths for symlinks', () => {
    if (!fs.existsSync('/etc/passwd')) return;
    const linkPath = path.join(policy.projectDir, 'passwd-link');
    try {
      fs.symlinkSync('/etc/passwd', linkPath);
    } catch {
      return;
    }
    const decision = evaluateOperation(op(linkPath), policy);
    assert.equal(decision.decision, 'audit');
    assert.equal(decision.reasonCode, 'outside_workspace');
  });

  test('denies shell destructive operations with stable reason code', () => {
    const decision = evaluateOperation(
      {
        provider: 'unknown',
        action: 'delete',
        targetType: 'shell',
        path: '.git',
        command: 'rm -rf .git',
        cwd: policy.projectDir,
      },
      policy
    );
    assert.equal(decision.decision, 'deny');
    assert.equal(decision.reasonCode, 'destructive_command');
  });
});
