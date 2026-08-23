import * as path from 'node:path';
import { enforce, isBlockedFilename, isInForbiddenDir } from './utils.js';
import { shouldBlockOutside, resolveWorkspacePath } from './workspace.js';
import type { NormalizedOperation, SecurityDecision, SecurityPolicy } from '@types';

export function decideForPolicy(
  policy: Readonly<Pick<SecurityPolicy, 'enforcementMode'>>,
  reasonCode: NonNullable<SecurityDecision['reasonCode']>,
  message: string
): SecurityDecision {
  return {
    decision: policy.enforcementMode === 'audit' ? 'audit' : 'deny',
    reasonCode,
    message: `${reasonCode}: ${message}`,
  };
}

function allow(message: string): SecurityDecision {
  return { decision: 'allow', message };
}

export function evaluateOperation(
  operation: NormalizedOperation,
  policy: Readonly<SecurityPolicy>
): SecurityDecision {
  if (operation.targetType === 'shell') {
    if (operation.action === 'delete') {
      return decideForPolicy(
        policy,
        'destructive_command',
        `Destructive shell command targets '${operation.path ?? operation.command ?? 'unknown'}'.`
      );
    }
    if (operation.action === 'exec') {
      // Interpreter invocations are program text: opaque to path analysis.
      // Audit-only so the attempt is attributed in the decision log without
      // blocking legitimate developer workflows.
      return {
        decision: 'audit',
        reasonCode: 'opaque_shell_code',
        message: `opaque_shell_code: interpreter command not path-analyzed: '${operation.command ?? 'unknown'}'`,
      };
    }
  }

  if (operation.targetType !== 'filesystem')
    return allow('unsupported_payload: no filesystem target');
  if (!operation.path) return allow('unsupported_payload: filesystem operation has no path');

  const resolvedPath = resolveWorkspacePath(operation.path, policy);
  const outside = shouldBlockOutside(operation.path, policy);
  const writeLike = operation.action === 'write' || operation.action === 'edit';

  // Sensitive-content lens first: reading secrets is the exfiltration guard
  // and blocks everywhere. Authoring them inside the own workspace is a
  // normal task — audited, not blocked.
  const forbiddenDir = isInForbiddenDir(resolvedPath, policy);
  const fileName = path.basename(resolvedPath);
  const sensitiveCode = forbiddenDir
    ? 'sensitive_dir'
    : isBlockedFilename(fileName, policy)
      ? 'sensitive_file'
      : null;
  if (sensitiveCode) {
    if (writeLike && !outside) {
      return {
        decision: 'audit',
        reasonCode: sensitiveCode,
        message: `${sensitiveCode}: authoring sensitive path '${operation.path}' in workspace (logged, allowed)`,
      };
    }
    return decideForPolicy(
      policy,
      sensitiveCode,
      forbiddenDir
        ? `Access to sensitive directory '${forbiddenDir}' via '${operation.path}' is forbidden.`
        : `Access to sensitive file '${fileName}' via '${operation.path}' is forbidden.`
    );
  }

  // Location lens: reads are safe by default; writes must stay in-workspace.
  if (outside) {
    if (writeLike) {
      return decideForPolicy(
        policy,
        'outside_workspace',
        `Write access to '${operation.path}' resolves outside the workspace at '${resolvedPath}'.`
      );
    }
    return {
      decision: 'audit',
      reasonCode: 'outside_workspace',
      message: `outside_workspace: read of '${operation.path}' resolves outside the workspace at '${resolvedPath}' (logged, allowed)`,
    };
  }

  return allow(`filesystem target '${operation.path}' is allowed`);
}

export function enforceDecision(
  decision: SecurityDecision,
  policy: Pick<SecurityPolicy, 'enforcementMode'>
): void {
  if (decision.decision === 'allow') return;
  if (decision.decision === 'audit') return;
  enforce(decision.message, policy);
}
