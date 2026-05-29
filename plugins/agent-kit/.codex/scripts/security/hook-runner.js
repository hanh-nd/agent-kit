import { normalizeHookPayload } from './adapters.js';
import { evaluateOperation, enforceDecision } from './evaluator.js';
import { loadPolicy } from './policy.js';
import { isRecord } from '../utils.js';
function parsePayload(raw) {
    try {
        const parsed = JSON.parse(raw);
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
export function runSecurityPrivacyHook(raw) {
    const input = parsePayload(raw);
    if (!input)
        return;
    const pol = loadPolicy();
    const operations = normalizeHookPayload(input, pol);
    for (const operation of operations) {
        const decision = evaluateOperation(operation, pol);
        enforceDecision(decision, pol);
    }
}
