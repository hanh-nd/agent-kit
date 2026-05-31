import * as fs from 'fs';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createMemorySubsystem,
  type MemorySubsystem,
  type MemorySubsystemOverrides,
} from '../services/memory/subsystem.js';
import type { SourceType } from '../services/memory/types.js';
import { SOURCE_TYPES } from '../services/memory/types.js';
import { initializeConversationDigestModel } from '../services/digest/processor.js';
import { DEFAULT_DIGEST_MODEL_ID } from '../services/digest/constants.js';
import { formatError, mcpJson, mcpText } from '../utils/utils.js';
import { loadGlobalSettings, resolveConversationDigestConfig, type ProjectSettings } from '../core/config/index.js';

/**
 * Registers tool handlers against the current memory subsystem state.
 */
function registerMemoryToolHandlers(
  server: McpServer,
  subsystem: MemorySubsystem,
  workspaceRoot: string = process.cwd(),
): void {
  const { config } = subsystem;

  server.registerTool(
    'kit_memory_search',
    {
      title: 'Search Memory',
      description:
        'Search persistent memory for factual or semantic matches (decisions, concepts, entities). Extract concise keywords only, removing stopwords and filler words from the user request before querying. Use kit_memory_recent for temporal or recency questions.',
      inputSchema: {
        query: z.string().min(1).describe('Keyword-only search query with stopwords removed'),
        top_k: z.number().int().positive().optional().describe('Number of results to return'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, top_k }) => {
      try {
        if (!subsystem.indexer || !subsystem.store) {
          return mcpText(formatInitializationFailure(subsystem));
        }

        const { indexer, store } = subsystem;
        const results = await indexer.search(query, top_k ?? config.topK);
        const lifecycleNote = formatLifecycleNote(subsystem);
        const degradedNote = !store.vecAvailable
          ? '⚠️ Vector search unavailable — showing keyword-only results.\n\n'
          : '';

        if (results.length === 0) {
          return mcpText(`${lifecycleNote}${degradedNote}No memories found for query: "${query}"`);
        }

        const formatted = results
          .map((r) => {
            const displaySource = r.chunk.source.replace(/^compiled\//, '');
            const content =
              r.contentSource === 'fallback'
                ? `⚠️ Source file unavailable — showing matched chunk only:\n${r.chunk.content}`
                : r.chunk.content;
            return `### ${displaySource} (score: ${r.score.toFixed(3)})\n${content}`;
          })
          .join('\n\n---\n\n');

        return mcpText(`${lifecycleNote}${degradedNote}${formatted}`);
      } catch (err) {
        return mcpText(`kit_memory_search failed: ${formatError(err)}`);
      }
    },
  );

  server.registerTool(
    'kit_memory_recent',
    {
      title: 'Recent Memory Sources',
      description:
        'Return the N most recently updated memory sources. Optionally filter by source type. Use for temporal questions like "what did we do last session" or "recent".',
      inputSchema: {
        n: z.number().int().positive().max(50).optional().describe('How many recent sources to return (default 5)'),
        source_type: z.enum(SOURCE_TYPES).optional().describe('Optional source type filter'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ n, source_type }) => {
      try {
        if (!subsystem.store) {
          return mcpText(formatInitializationFailure(subsystem));
        }

        const store = subsystem.store;
        const rows = store.getRecentSources({ limit: n ?? 5, sourceType: source_type as SourceType });
        if (rows.length === 0) return mcpText('No recent sources found.');

        const blocks: string[] = [];
        for (const row of rows) {
          try {
            const content = await fs.promises.readFile(path.join(config.wikiDir, row.source), 'utf8');
            const displaySource = row.source.replace(/^compiled\//, '');
            blocks.push(`### ${displaySource}\n${content}`);
          } catch (err) {
            console.warn(`[memory] Skipping unavailable recent source ${row.source}:`, err);
          }
        }

        if (blocks.length === 0) return mcpText('No recent sources found.');
        return mcpText(blocks.join('\n\n---\n\n'));
      } catch (err) {
        return mcpText(`kit_memory_recent failed: ${formatError(err)}`);
      }
    },
  );

  server.registerTool(
    'kit_memory_save',
    {
      title: 'Save to Memory',
      description: 'Save content to wiki/raw for inclusion after the next /wiki compile.',
      inputSchema: {
        content: z.string().min(1).describe('Content to save to memory'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ content }) => {
      try {
        if (!subsystem.indexer) {
          return mcpJson({
            saved: false,
            error: formatInitializationFailure(subsystem),
          });
        }

        const indexer = subsystem.indexer;
        await indexer.save(content);
        return mcpJson({
          saved: true,
          queued_for_compile: true,
          message: 'Saved to wiki/raw — will be indexed after next /wiki compile',
        });
      } catch (err) {
        return mcpJson({
          saved: false,
          error: formatError(err),
        });
      }
    },
  );

  server.registerTool(
    'kit_memory_digest_init',
    {
      title: 'Initialize Conversation Digest',
      description:
        'Initialize or toggle local conversation digesting. Downloads/cache-loads the pinned local model only when explicitly invoked.',
      inputSchema: {
        model_id: z.string().optional().describe('Digest model id'),
        enabled: z.boolean().optional().describe('Enable or disable conversation digesting'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ model_id, enabled }) => {
      try {
        const existingConfig = resolveConversationDigestConfig(loadGlobalSettings());
        const result = await initializeConversationDigestModel({
          workspaceRoot,
          modelId: model_id ?? existingConfig?.modelId ?? DEFAULT_DIGEST_MODEL_ID,
          allowDownload: true,
          enabled,
        });
        return mcpJson({
          initialized: result.initialized,
          model_id: result.modelId,
          initialized_at: result.initializedAt,
          error: result.error,
        });
      } catch (err) {
        return mcpJson({ initialized: false, error: formatError(err) });
      }
    },
  );
}

function formatLifecycleNote(subsystem: MemorySubsystem): string {
  if (subsystem.status.state === 'warming' || subsystem.status.state === 'initializing') {
    return '⚠️ Memory index is warming — results may be stale until startup indexing completes.\n\n';
  }
  if (subsystem.status.state === 'degraded') {
    return `⚠️ Memory index is degraded${subsystem.status.error ? `: ${subsystem.status.error}` : ''}.\n\n`;
  }
  return '';
}

function formatInitializationFailure(subsystem: MemorySubsystem): string {
  const detail = subsystem.status.error ? `: ${subsystem.status.error}` : '';
  return `Memory initialization failed${detail}`;
}

/**
 * Initializes the memory subsystem and registers all memory tools.
 * Returns the MemorySubsystem so the caller can fire startWarmup() after server.connect().
 * Returns null when memory is disabled (settings.memory.enabled !== true).
 */
export function registerMemoryTools(
  server: McpServer,
  workspaceRoot: string,
  overrides?: MemorySubsystemOverrides & {
    settings?: ProjectSettings; // For testing
  },
): MemorySubsystem | null {
  const settings = overrides?.settings ?? loadGlobalSettings();
  if (settings.memory?.enabled !== true) return null;

  const subsystem = createMemorySubsystem(workspaceRoot, { ...overrides, settings });
  if (!subsystem) return null;

  registerMemoryToolHandlers(server, subsystem, workspaceRoot);

  return subsystem;
}
