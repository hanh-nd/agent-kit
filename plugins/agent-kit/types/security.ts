export type EnforcementMode = 'block' | 'audit';
export type SecurityProvider = 'codex' | 'claude' | 'gemini' | 'unknown';
export type SecurityAction = 'read' | 'write' | 'edit' | 'delete' | 'exec' | 'unknown';
export type SecurityTargetType = 'filesystem' | 'shell' | 'unknown';
export type SecurityDecisionKind = 'allow' | 'deny' | 'audit';
export type SecurityReasonCode =
  | 'outside_workspace'
  | 'sensitive_file'
  | 'sensitive_dir'
  | 'destructive_command'
  | 'unsupported_payload';

export interface SecuritySettings {
  allowOutside?: boolean;
  allowedOutsidePaths?: string[];
  enforcementMode?: EnforcementMode;
}

export interface ProjectSettings {
  hasTests?: boolean;
  runTests?: boolean;
}

export interface AgentKitSettings {
  security?: SecuritySettings;
  project?: ProjectSettings;
}

export interface SecurityConfig {
  allowOutside: boolean;
  allowedOutsidePaths: string[];
  enforcementMode: EnforcementMode;
}

export interface SecurityPolicy {
  enforcementMode: EnforcementMode;
  projectDir: string;
  homeDir: string;
  caseInsensitive: boolean;
  forbiddenFiles: readonly string[];
  forbiddenRegexes: readonly RegExp[];
  forbiddenDirs: readonly string[];
  allowedOutsidePaths: readonly string[];
  allowOutside: boolean;
  systemBinPaths: readonly string[];
  knownEnvVars: Readonly<Record<string, string>>;
}

export interface ShellCandidate {
  raw: string;
  expanded: string;
  unresolvedVars: readonly string[];
}

export interface ExpandedToken {
  expanded: string;
  unresolvedVars: string[];
}

export interface SecurityHookCall {
  method?: unknown;
  params?: unknown;
}

export interface SecurityHookPayload {
  prompt?: unknown;
  tool_name?: unknown;
  tool?: unknown;
  action?: unknown;
  name?: unknown;
  call?: SecurityHookCall;
  tool_input?: unknown;
  args?: unknown;
}

export interface NormalizedOperation {
  provider: SecurityProvider;
  action: SecurityAction;
  targetType: SecurityTargetType;
  path?: string;
  command?: string;
  cwd: string;
  toolName?: string;
  rawEvent?: unknown;
}

export interface SecurityDecision {
  decision: SecurityDecisionKind;
  reasonCode?: SecurityReasonCode;
  message: string;
}
