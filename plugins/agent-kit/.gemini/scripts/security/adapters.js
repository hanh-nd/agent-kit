import { CLAUDE_TOOL_ACTIONS, CODEX_TOOL_ACTIONS, GEMINI_TOOL_ACTIONS, SHELL_OPAQUE_INTERPRETERS, SHELL_PATTERN_TOOLS, SHELL_READER_VERBS, SHELL_WRITER_VERBS, } from './constants.js';
import { extractCandidates, tokenizeShellCommand } from './shell-parser.js';
import { PATH_ARG_KEYS } from './policy.js';
import { isRecord } from '../utils.js';
const COMMAND_ARG_KEYS = new Set(['command', 'cmd', 'script']);
// Redirect operators: > >> < 2> &> …
const REDIRECT_OPERATOR = /^\d*<?&?[<>]{1,2}$/;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
function normalizeToolName(toolName) {
    return toolName.trim().toLowerCase();
}
function providerFromToolName(toolName) {
    const normalized = normalizeToolName(toolName);
    if (GEMINI_TOOL_ACTIONS.has(normalized))
        return 'gemini';
    if (CODEX_TOOL_ACTIONS.has(normalized))
        return 'codex';
    return null;
}
function inferProvider(input) {
    const toolName = stringValue(input.tool_name) ??
        stringValue(input.tool) ??
        stringValue(input.action) ??
        stringValue(input.name) ??
        stringValue(input.call?.method);
    if (input.tool_name)
        return 'claude';
    if (input.call)
        return 'codex';
    if (toolName) {
        const toolProvider = providerFromToolName(toolName);
        if (toolProvider)
            return toolProvider;
    }
    if (process.env.CLAUDE_PROJECT_DIR)
        return 'claude';
    if (process.env.CODEX_PROJECT_DIR)
        return 'codex';
    if (process.env.GEMINI_PROJECT_DIR)
        return 'gemini';
    return 'unknown';
}
function stringValue(value) {
    return typeof value === 'string' ? value : null;
}
function inferAction(provider, toolName) {
    const normalized = normalizeToolName(toolName);
    if (provider === 'claude')
        return CLAUDE_TOOL_ACTIONS.get(normalized) ?? 'unknown';
    if (provider === 'codex')
        return CODEX_TOOL_ACTIONS.get(normalized) ?? 'unknown';
    if (provider === 'gemini')
        return GEMINI_TOOL_ACTIONS.get(normalized) ?? 'unknown';
    return (CLAUDE_TOOL_ACTIONS.get(normalized) ??
        CODEX_TOOL_ACTIONS.get(normalized) ??
        GEMINI_TOOL_ACTIONS.get(normalized) ??
        'unknown');
}
function getPayloadShape(input) {
    const toolName = stringValue(input.tool_name) ??
        stringValue(input.tool) ??
        stringValue(input.action) ??
        stringValue(input.name) ??
        stringValue(input.call?.method) ??
        'unknown';
    const argsValue = input.tool_input ?? input.args ?? input.call?.params;
    if (!isRecord(argsValue))
        return null;
    return { toolName, args: argsValue };
}
function basename(token) {
    return token.split(/[\\/]/).pop() ?? token;
}
function isOptionToken(token) {
    return token.startsWith('-') && token.length > 1;
}
/**
 * Analyze an exec tool's command string into path-bearing operations.
 *
 * Semantics (tokenizer limitations preserved):
 * - Interpreter invocations stay OPAQUE: one audit-only shell operation.
 * - Reader/writer verbs have every non-flag operand path-checked, separator
 *   or not (`cat .env`).
 * - Pattern tools (grep/sed/awk…) skip their FIRST positional operand;
 *   later operands are still checked under the default shape filter.
 * - Redirect operators force their target to be checked with write semantics.
 * - Compound commands (`&&`, `|`, heredoc bodies) are flattened; every token
 *   is seen, which over-includes but never under-reports.
 */
function analyzeShellCommand(command, provider, toolName, policy) {
    const tokens = tokenizeShellCommand(command);
    if (tokens.length === 0)
        return [];
    const verb = basename(tokens[0]).toLowerCase();
    if (SHELL_OPAQUE_INTERPRETERS.has(verb)) {
        return [
            { provider, action: 'exec', targetType: 'shell', cwd: policy.projectDir, toolName, command },
        ];
    }
    // Reader/writer operands are paths by definition; other verbs only yield
    // candidates that already look path-shaped.
    const force = SHELL_READER_VERBS.has(verb) || SHELL_WRITER_VERBS.has(verb);
    const writes = SHELL_WRITER_VERBS.has(verb);
    const isPatternTool = SHELL_PATTERN_TOOLS.has(verb);
    const operations = [];
    let patternSkipped = false;
    let redirectPending = false;
    for (let i = 1; i < tokens.length; i++) {
        const raw = tokens[i];
        if (REDIRECT_OPERATOR.test(raw)) {
            redirectPending = true;
            continue;
        }
        if (isOptionToken(raw))
            continue;
        let action = null;
        if (redirectPending) {
            redirectPending = false;
            action = 'write';
        }
        else if (force) {
            action = writes ? 'write' : 'read';
        }
        else if (isPatternTool && !patternSkipped) {
            patternSkipped = true;
            continue;
        }
        const [candidate] = extractCandidates(raw, policy);
        if (!action) {
            // Default verbs: only path-shaped tokens denote operands here.
            if (!candidate || URL_LIKE.test(candidate.expanded))
                continue;
            action = 'read';
        }
        operations.push({
            provider,
            action,
            targetType: 'filesystem',
            path: candidate?.expanded ?? raw,
            cwd: policy.projectDir,
            toolName,
        });
    }
    return operations;
}
export function normalizeHookPayload(input, policy) {
    const shape = getPayloadShape(input);
    if (!shape)
        return [];
    const provider = inferProvider(input);
    const operations = [];
    for (const [key, value] of Object.entries(shape.args)) {
        if (typeof value !== 'string')
            continue;
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
            continue;
        }
        if (COMMAND_ARG_KEYS.has(key) &&
            inferAction(provider, shape.toolName) === 'exec' &&
            value.trim()) {
            operations.push(...analyzeShellCommand(value, provider, shape.toolName, policy));
        }
    }
    return operations;
}
