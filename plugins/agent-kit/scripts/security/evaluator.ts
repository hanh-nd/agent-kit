import * as path from 'node:path';
import { enforce, isBlockedFilename, isInForbiddenDir } from './utils.js';
import { shouldBlockOutside, resolveWorkspacePath } from './workspace.js';
import type { NormalizedOperation, SecurityDecision, SecurityPolicy } from '@types';

function violationDecision(
  policy: Readonly<SecurityPolicy>,
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
  if (operation.targetType === 'shell' && operation.action === 'delete') {
    return violationDecision(
      policy,
      'destructive_command',
      `Destructive shell command targets '${operation.path ?? operation.command ?? 'unknown'}'.`
    );
  }

  if (operation.targetType !== 'filesystem')
    return allow('unsupported_payload: no filesystem target');
  if (!operation.path) return allow('unsupported_payload: filesystem operation has no path');

  const resolvedPath = resolveWorkspacePath(operation.path, policy);
  if (shouldBlockOutside(operation.path, policy)) {
    return violationDecision(
      policy,
      'outside_workspace',
      `Access to '${operation.path}' resolves outside the workspace at '${resolvedPath}'.`
    );
  }

  const forbiddenDir = isInForbiddenDir(resolvedPath, policy);
  if (forbiddenDir) {
    return violationDecision(
      policy,
      'sensitive_dir',
      `Access to sensitive directory '${forbiddenDir}' via '${operation.path}' is forbidden.`
    );
  }

  const fileName = path.basename(resolvedPath);
  if (isBlockedFilename(fileName, policy)) {
    return violationDecision(
      policy,
      'sensitive_file',
      `Access to sensitive file '${fileName}' via '${operation.path}' is forbidden.`
    );
  }

  return allow(`filesystem target '${operation.path}' is allowed`);
}

export function enforceDecision(
  decision: SecurityDecision,
  policy: Pick<SecurityPolicy, 'enforcementMode'>
): void {
  if (decision.decision === 'allow') return;
  enforce(decision.message, policy);
}
