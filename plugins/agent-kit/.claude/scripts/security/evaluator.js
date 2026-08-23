import * as path from 'node:path';
import { enforce, isBlockedFilename, isInForbiddenDir } from './utils.js';
import { shouldBlockOutside, resolveWorkspacePath } from './workspace.js';
export function decideForPolicy(policy, reasonCode, message) {
    return {
        decision: policy.enforcementMode === 'audit' ? 'audit' : 'deny',
        reasonCode,
        message: `${reasonCode}: ${message}`,
    };
}
function allow(message) {
    return { decision: 'allow', message };
}
export function evaluateOperation(operation, policy) {
    if (operation.targetType === 'shell') {
        if (operation.action === 'delete') {
            return decideForPolicy(policy, 'destructive_command', `Destructive shell command targets '${operation.path ?? operation.command ?? 'unknown'}'.`);
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
    if (!operation.path)
        return allow('unsupported_payload: filesystem operation has no path');
    const resolvedPath = resolveWorkspacePath(operation.path, policy);
    if (shouldBlockOutside(operation.path, policy)) {
        return decideForPolicy(policy, 'outside_workspace', `Access to '${operation.path}' resolves outside the workspace at '${resolvedPath}'.`);
    }
    const forbiddenDir = isInForbiddenDir(resolvedPath, policy);
    if (forbiddenDir) {
        return decideForPolicy(policy, 'sensitive_dir', `Access to sensitive directory '${forbiddenDir}' via '${operation.path}' is forbidden.`);
    }
    const fileName = path.basename(resolvedPath);
    if (isBlockedFilename(fileName, policy)) {
        return decideForPolicy(policy, 'sensitive_file', `Access to sensitive file '${fileName}' via '${operation.path}' is forbidden.`);
    }
    return allow(`filesystem target '${operation.path}' is allowed`);
}
export function enforceDecision(decision, policy) {
    if (decision.decision === 'allow')
        return;
    if (decision.decision === 'audit')
        return;
    enforce(decision.message, policy);
}
