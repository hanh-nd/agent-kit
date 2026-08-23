import { normalizeHookPayload } from './adapters.js';
import { decideForPolicy, enforceDecision, evaluateOperation } from './evaluator.js';
import { loadPolicy } from './policy.js';
import { isRecord } from '../utils.js';
import { recordDecision, type DecisionLogEntry } from './utils.js';
import type {
  NormalizedOperation,
  SecurityDecision,
  SecurityHookPayload,
  SecurityPolicy,
} from '@types';

function parsePayload(raw: string): SecurityHookPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const TOOL_IDENTITY_KEYS = ['tool_name', 'tool', 'action', 'name', 'call'] as const;

function hasToolIdentity(input: SecurityHookPayload): boolean {
  return TOOL_IDENTITY_KEYS.some((key) => input[key] !== undefined);
}

function targetOf(operation: NormalizedOperation): string | undefined {
  if (operation.targetType === 'shell') return operation.command;
  return operation.path;
}

function logEntry(
  decision: SecurityDecision,
  policy: Readonly<SecurityPolicy>,
  operation?: NormalizedOperation
): DecisionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    mode: policy.enforcementMode,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    provider: operation?.provider,
    tool: operation?.toolName,
    action: operation?.action,
    target: operation ? targetOf(operation) : undefined,
    message: decision.message,
  };
}

/**
 * Fold all operations to the most restrictive outcome (deny > audit > allow),
 * record every decision, then enforce once — so a deny never hides later
 * findings and no ordering can re-allow a denied call.
 */
export function runSecurityPrivacyHook(raw: string): void {
  // Empty stdin: nothing was delivered to verify; stay a silent no-op.
  if (!raw.trim()) return;

  const policy = loadPolicy();

  const input = parsePayload(raw);
  if (!input) {
    // Fail closed: an unparseable payload cannot be verified.
    const malformed = decideForPolicy(
      policy,
      'malformed_payload',
      'stdin was non-empty but not a JSON object'
    );
    recordDecision(logEntry(malformed, policy));
    enforceDecision(malformed, policy);
    return;
  }

  const operations = normalizeHookPayload(input, policy);

  if (operations.length === 0) {
    const detail = hasToolIdentity(input)
      ? 'tool event carried no verifiable path or command'
      : 'prompt text is not path-scanned';
    recordDecision({
      timestamp: new Date().toISOString(),
      mode: policy.enforcementMode,
      decision: 'allow',
      reasonCode: 'no_verifiable_target',
      message: `no_verifiable_target: ${detail}`,
    });
    return;
  }

  // Fold to the most restrictive outcome (deny > audit > allow), record every
  // decision, then enforce once — a deny never hides later findings.
  const RANK = { allow: 0, audit: 1, deny: 2 } as const;
  let worst: SecurityDecision | null = null;
  for (const operation of operations) {
    const decision = evaluateOperation(operation, policy);
    recordDecision(logEntry(decision, policy, operation));
    if (!worst || RANK[decision.decision] > RANK[worst.decision]) worst = decision;
  }
  if (worst && worst.decision === 'deny') enforceDecision(worst, policy);
}
