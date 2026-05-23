export enum DigestModelId {
  TINY = 'tiny',
  BASE = 'base',
  LARGE = 'large',
}

export interface ConversationDigestSettings {
  enabled?: boolean;
  initialized: boolean;
  modelId: string;
  initializedAt: string;
}

export interface DigestModelSpec {
  id: DigestModelId;
  ggufUri: string;
  approxSizeBytes: number;
  license: string;
  sourceUrl: string;
  enabled: boolean;
}

export interface ConversationDigestInput {
  sourcePath: string;
  content: string;
  contentHash: string;
}

interface ConversationDigestOptions {
  modelId: string;
  maxInputChars: number;
  timeoutMs: number;
}

export interface ConversationDigestInitResult {
  initialized: boolean;
  modelId: string;
  initializedAt?: string;
  error?: string;
}

export interface ConversationDigestProvider {
  readonly id: string;
  dispose?(): Promise<void>;
  generateDigestMarkdown(input: ConversationDigestInput, options: ConversationDigestOptions): Promise<string>;
}

export interface DigestFileOptions {
  workspaceRoot: string;
  inputPath: string;
  modelId: string;
  outDir?: string;
  maxInputChars?: number;
  timeoutMs?: number;
}

export interface ProvisionalDigestResult {
  markdown: string;
  status: 'provisional';
  contentHash: string;
  indexed: boolean;
  skipped: boolean;
  error?: string;
}

export interface InitializeConversationDigestInput {
  workspaceRoot: string;
  modelId: string;
  allowDownload: boolean;
  enabled?: boolean;
}

export type DigestPendingResult =
  | { ok: true; initialized: false; action: 'noop'; reason: 'not-initialized' }
  | { ok: true; initialized: true; action: 'noop'; reason: 'locked' }
  | { ok: true; initialized: true; action: 'noop'; reason: 'no-pending' }
  | {
      ok: true;
      initialized: true;
      action: 'digested';
      count: number;
      skipped: number;
      errors: number;
    }
  | { ok: false; initialized: true; action: 'error'; error: string };

export type DigestWorkerState =
  | 'running'
  | 'complete'
  | 'failed'
  | 'not-initialized'
  | 'no-pending'
  | 'locked'
  | 'stale';

export interface DigestWorkerStatus {
  state: DigestWorkerState;
  pid: number | null;
  startedAt: string;
  updatedAt: string;
  pendingAtStart: number;
  processed: number;
  skipped: number;
  errors: number;
  lastError?: string;
}

export interface DigestPendingCandidateSummary {
  initialized: boolean;
  pending: number;
  reason?: 'not-initialized' | 'no-pending';
}

export interface DigestPendingLauncherResult {
  ok: boolean;
  mode: 'background-launcher';
  status: DigestWorkerStatus;
  spawned: boolean;
  pid?: number;
  reason?: string;
  error?: string;
}
