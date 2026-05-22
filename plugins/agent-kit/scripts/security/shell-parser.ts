/**
 * Shell command tokenizer and path expander.
 *
 * Documented limitation: does NOT evaluate $(...) or backtick contents.
 * Heredoc bodies are not reliably scoped — tokens between <<EOF and EOF
 * are still scanned, which is sufficient for common attack patterns.
 */
import type { ExpandedToken, SecurityPolicy, ShellCandidate } from '@types';

function tokenizeCommand(cmd: string): string[] {
  const tokenRegex = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
  const tokens = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(cmd)) !== null) {
    const token = match[1] ?? match[2] ?? match[3];
    if (token) tokens.push(token);
  }
  return tokens;
}

function expandToken(
  token: string,
  policy: Pick<SecurityPolicy, 'homeDir' | 'knownEnvVars'>
): ExpandedToken {
  let expanded = token;
  const unresolvedVars: string[] = [];

  // Tilde expansion — only at position 0, no ~user form
  if (expanded === '~') {
    expanded = policy.homeDir;
  } else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = policy.homeDir + expanded.slice(1);
  }

  // Env var expansion — $VAR and ${VAR}, only for known vars
  expanded = expanded.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      const varName = braced ?? bare;
      if (varName in policy.knownEnvVars) {
        return policy.knownEnvVars[varName];
      }
      unresolvedVars.push(match);
      return match;
    }
  );

  return { expanded, unresolvedVars };
}

export function extractCandidates(
  cmd: string,
  policy: Pick<SecurityPolicy, 'homeDir' | 'knownEnvVars'>
): ShellCandidate[] {
  const tokens = tokenizeCommand(cmd);
  const candidates: ShellCandidate[] = [];
  for (const token of tokens) {
    const { expanded, unresolvedVars } = expandToken(token, policy);
    const hasPathSep = /[/\\]/.test(expanded);
    const startsWithTilde = token.startsWith('~');
    const hasUnresolvedWithSep = unresolvedVars.length > 0 && /[/\\]/.test(expanded);

    if (hasPathSep || startsWithTilde || hasUnresolvedWithSep) {
      candidates.push(
        Object.freeze({ raw: token, expanded, unresolvedVars: Object.freeze(unresolvedVars) })
      );
    }
  }
  return candidates;
}
