import { normalizeHookPayload } from './adapters.js';
import { decideForPolicy, enforceDecision, evaluateOperation } from './evaluator.js';
import { loadPolicy } from './policy.js';
import { isRecord } from '../utils.js';
import type { SecurityDecision, SecurityHookPayload, SecurityPolicy } from '@types';

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

/**
 * Fold all operations to the most restrictive outcome (deny > audit > allow),
 * then enforce once — so a deny never hides later findings and no ordering
 * can re-allow a denied call.
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
    enforceDecision(malformed, policy);
    return;
  }

  const operations = normalizeHookPayload(input, policy);

  if (operations.length === 0) {
    const detail = hasToolIdentity(input)
      ? 'tool event carried no verifiable path or command'
      : 'prompt text is not path-scanned';
    const allowNoTarget: SecurityDecision = {
      decision: 'allow',
      reasonCode: 'no_verifiable_target',
      message: `no_verifiable_target: ${detail}`,
    };
    enforceDecision(allowNoTarget, policy);
    return;
  }

  // Fold to the most restrictive outcome (deny > audit > allow), then enforce
  // once — a deny never hides later findings.
  const RANK = { allow: 0, audit: 1, deny: 2 } as const;
  let worst: SecurityDecision | null = null;
  for (const operation of operations) {
    const decision = evaluateOperation(operation, policy);
    if (!worst || RANK[decision.decision] > RANK[worst.decision]) worst = decision;
  }
  if (worst && worst.decision === 'deny') enforceDecision(worst, policy);
}
