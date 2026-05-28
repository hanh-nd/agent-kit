import * as path from 'path';
import { resolveMemoryConfig, type ProjectSettings } from '../../core/config/index.js';
import { Embedder } from './embedder.js';
import { MemoryIndexer } from './indexer.js';
import { MemoryStore } from './store.js';
import type { MemoryConfig, MemoryLifecycleState, MemoryLifecycleStatus } from './types.js';

export interface MemorySubsystemOverrides {
  indexer?: MemoryIndexer;
  store?: MemoryStore;
  config?: MemoryConfig;
  settings?: ProjectSettings;
}

export interface MemorySubsystem {
  readonly config: MemoryConfig;
  readonly status: MemoryLifecycleStatus;
  readonly indexer: MemoryIndexer | null;
  readonly store: MemoryStore | null;
  startWarmup(): Promise<void>;
  close(): void;
}

class DefaultMemorySubsystem implements MemorySubsystem {
  private lifecycleStatus: MemoryLifecycleStatus;

  constructor(
    readonly config: MemoryConfig,
    readonly indexer: MemoryIndexer | null,
    readonly store: MemoryStore | null,
    initialState: MemoryLifecycleState,
    initialError?: string,
  ) {
    this.lifecycleStatus = makeStatus(initialState, initialError);
  }

  get status(): MemoryLifecycleStatus {
    return this.lifecycleStatus;
  }

  async startWarmup(): Promise<void> {
    if (!this.indexer) {
      this.lifecycleStatus = makeStatus('failed', this.lifecycleStatus.error ?? 'Memory indexer is unavailable');
      return;
    }

    this.lifecycleStatus = makeStatus('warming');
    try {
      await this.indexer.startupIndex();
      this.lifecycleStatus = makeStatus('ready');
    } catch (err) {
      this.lifecycleStatus = makeStatus(this.store ? 'degraded' : 'failed', formatError(err));
    }
  }

  close(): void {
    this.store?.close();
  }
}

function makeStatus(state: MemoryLifecycleState, error?: string): MemoryLifecycleStatus {
  return {
    state,
    ready: state === 'ready',
    warming: state === 'initializing' || state === 'warming',
    degraded: state === 'degraded' || state === 'failed',
    error,
  };
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createMemorySubsystem(
  workspaceRoot: string,
  overrides: MemorySubsystemOverrides = {},
): MemorySubsystem | null {
  const config = overrides.config ?? resolveMemoryConfig(overrides.settings ?? {}, workspaceRoot);
  if (config.enabled !== true) return null;

  let store = overrides.store ?? null;
  let indexer = overrides.indexer ?? null;

  try {
    store = store ?? new MemoryStore(path.join(config.wikiDir, 'index.db'), config);
    if (!indexer) {
      const embedder = new Embedder(config.embeddingModel);
      indexer = new MemoryIndexer(store, embedder, config);
    }
    return new DefaultMemorySubsystem(config, indexer, store, 'initializing');
  } catch (err) {
    return new DefaultMemorySubsystem(config, indexer, store, 'failed', formatError(err));
  }
}
