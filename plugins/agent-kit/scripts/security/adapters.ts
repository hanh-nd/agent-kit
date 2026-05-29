import { CLAUDE_TOOL_ACTIONS, CODEX_TOOL_ACTIONS, GEMINI_TOOL_ACTIONS } from './constants.js';
import { PATH_ARG_KEYS } from './policy.js';
import { isRecord } from '../utils.js';
import type {
  NormalizedOperation,
  SecurityAction,
  SecurityHookPayload,
  SecurityPolicy,
  SecurityProvider,
} from '@types';

interface PayloadShape {
  toolName: string;
  args: Record<string, unknown>;
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

function providerFromToolName(toolName: string): SecurityProvider | null {
  const normalized = normalizeToolName(toolName);
  if (GEMINI_TOOL_ACTIONS.has(normalized)) return 'gemini';
  if (CODEX_TOOL_ACTIONS.has(normalized)) return 'codex';
  return null;
}

function inferProvider(input: SecurityHookPayload): SecurityProvider {
  const toolName =
    stringValue(input.tool_name) ??
    stringValue(input.tool) ??
    stringValue(input.action) ??
    stringValue(input.name) ??
    stringValue(input.call?.method);

  if (input.tool_name) return 'claude';
  if (input.call) return 'codex';
  if (toolName) {
    const toolProvider = providerFromToolName(toolName);
    if (toolProvider) return toolProvider;
  }
  if (process.env.CLAUDE_PROJECT_DIR) return 'claude';
  if (process.env.CODEX_PROJECT_DIR) return 'codex';
  if (process.env.GEMINI_PROJECT_DIR) return 'gemini';
  return 'unknown';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function inferAction(provider: SecurityProvider, toolName: string): SecurityAction {
  const normalized = normalizeToolName(toolName);
  if (provider === 'claude') return CLAUDE_TOOL_ACTIONS.get(normalized) ?? 'unknown';
  if (provider === 'codex') return CODEX_TOOL_ACTIONS.get(normalized) ?? 'unknown';
  if (provider === 'gemini') return GEMINI_TOOL_ACTIONS.get(normalized) ?? 'unknown';

  return (
    CLAUDE_TOOL_ACTIONS.get(normalized) ??
    CODEX_TOOL_ACTIONS.get(normalized) ??
    GEMINI_TOOL_ACTIONS.get(normalized) ??
    'unknown'
  );
}

function getPayloadShape(input: SecurityHookPayload): PayloadShape | null {
  const toolName =
    stringValue(input.tool_name) ??
    stringValue(input.tool) ??
    stringValue(input.action) ??
    stringValue(input.name) ??
    stringValue(input.call?.method) ??
    'unknown';

  const argsValue = input.tool_input ?? input.args ?? input.call?.params;
  if (!isRecord(argsValue)) return null;

  return { toolName, args: argsValue };
}

export function normalizeHookPayload(
  input: SecurityHookPayload,
  policy: Readonly<SecurityPolicy>
): NormalizedOperation[] {
  const shape = getPayloadShape(input);
  if (!shape) return [];

  const provider = inferProvider(input);
  const operations: NormalizedOperation[] = [];

  for (const [key, value] of Object.entries(shape.args)) {
    if (typeof value !== 'string') continue;

    if (PATH_ARG_KEYS.has(key)) {
      operations.push({
        provider,
        action: inferAction(provider, shape.toolName),
        targetType: 'filesystem',
        path: value,
        cwd: policy.projectDir,
        toolName: shape.toolName,
        rawEvent: input,
      });
    }
  }

  return operations;
}
