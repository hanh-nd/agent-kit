function tokenizeCommand(cmd) {
    const tokenRegex = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
    const tokens = [];
    let match;
    while ((match = tokenRegex.exec(cmd)) !== null) {
        const token = match[1] ?? match[2] ?? match[3];
        if (token)
            tokens.push(token);
    }
    return tokens;
}
export { tokenizeCommand as tokenizeShellCommand };
function expandToken(token, policy) {
    let expanded = token;
    const unresolvedVars = [];
    // Tilde expansion — only at position 0, no ~user form
    if (expanded === '~') {
        expanded = policy.homeDir;
    }
    else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
        expanded = policy.homeDir + expanded.slice(1);
    }
    // Env var expansion — $VAR and ${VAR}, only for known vars
    expanded = expanded.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
        const varName = braced ?? bare;
        if (varName in policy.knownEnvVars) {
            return policy.knownEnvVars[varName];
        }
        unresolvedVars.push(match);
        return match;
    });
    return { expanded, unresolvedVars };
}
export function extractCandidates(cmd, policy) {
    const tokens = tokenizeCommand(cmd);
    const candidates = [];
    for (const token of tokens) {
        const { expanded, unresolvedVars } = expandToken(token, policy);
        const hasPathSep = /[/\\]/.test(expanded);
        const startsWithTilde = token.startsWith('~');
        const hasUnresolvedWithSep = unresolvedVars.length > 0 && /[/\\]/.test(expanded);
        if (hasPathSep || startsWithTilde || hasUnresolvedWithSep) {
            candidates.push(Object.freeze({ raw: token, expanded, unresolvedVars: Object.freeze(unresolvedVars) }));
        }
    }
    return candidates;
}
