import * as fs from 'fs';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Embedder } from '../services/memory/embedder.js';
import { MemoryIndexer } from '../services/memory/indexer.js';
import { MemoryStore } from '../services/memory/store.js';
import type { MemoryConfig, SourceType } from '../services/memory/types.js';
import { SOURCE_TYPES } from '../services/memory/types.js';
import { initializeConversationDigestModel } from '../services/digest/processor.js';
import { DEFAULT_DIGEST_MODEL_ID } from '../services/digest/constants.js';
import { formatError, mcpJson, mcpText } from '../utils/utils.js';
import {
  loadProjectSettings,
  resolveConversationDigestConfig,
  resolveMemoryConfig,
  type ProjectSettings,
} from '../core/config/index.js';

/**
 * Registers tool handlers onto an already-constructed indexer/store pair.
 */
function registerMemoryToolHandlers(
  server: McpServer,
  indexer: MemoryIndexer,
  store: MemoryStore,
  config: MemoryConfig,
  workspaceRoot: string = process.cwd(),
): void {
  server.tool(
    'kit_memory_search',
    'Search persistent memory for factual or semantic matches (decisions, concepts, entities). Extract concise keywords only, removing stopwords and filler words from the user request before querying. Use kit_memory_recent for temporal or recency questions.',
    {
      query: z.string().min(1).describe('Keyword-only search query with stopwords removed'),
      top_k: z.number().int().positive().optional().describe('Number of results to return'),
    },
    async ({ query, top_k }) => {
      try {
        const results = await indexer.search(query, top_k ?? config.topK);
        const degradedNote = !store.vecAvailable
          ? '⚠️ Vector search unavailable — showing keyword-only results.\n\n'
          : '';

        if (results.length === 0) {
          return mcpText(`${degradedNote}No memories found for query: "${query}"`);
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

        return mcpText(`${degradedNote}${formatted}`);
      } catch (err) {
        return mcpText(`kit_memory_search failed: ${formatError(err)}`);
      }
    },
  );

  server.tool(
    'kit_memory_recent',
    'Return the N most recently updated memory sources. Optionally filter by source type. Use for temporal questions like "what did we do last session" or "recent".',
    {
      n: z.number().int().positive().max(50).optional().describe('How many recent sources to return (default 5)'),
      source_type: z.enum(SOURCE_TYPES).optional().describe('Optional source type filter'),
    },
    async ({ n, source_type }) => {
      try {
        const rows = store.getRecentSources({ limit: n ?? 5, sourceType: source_type as SourceType });
        if (rows.length === 0) return mcpText('No recent sources found.');

        const blocks: string[] = [];
        for (const row of rows) {
          try {
            const content = fs.readFileSync(path.join(config.wikiDir, row.source), 'utf8');
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

  server.tool(
    'kit_memory_save',
    'Save content to wiki/raw for inclusion after the next /wiki compile.',
    {
      content: z.string().min(1).describe('Content to save to memory'),
    },
    async ({ content }) => {
      try {
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

  server.tool(
    'kit_memory_digest_init',
    'Initialize or toggle local conversation digesting. Downloads/cache-loads the pinned local model only when explicitly invoked.',
    {
      model_id: z.string().optional().describe('Digest model id'),
      enabled: z.boolean().optional().describe('Enable or disable conversation digesting'),
    },
    async ({ model_id, enabled }) => {
      try {
        const existingConfig = resolveConversationDigestConfig(loadProjectSettings(workspaceRoot));
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

/**
 * Initializes the memory subsystem and registers all memory tools.
 * Returns the MemoryIndexer so the caller can fire startupIndex() after server.connect().
 * Returns null when memory is disabled (settings.memory.enabled !== true).
 */
export function registerMemoryTools(
  server: McpServer,
  settings: ProjectSettings,
  workspaceRoot: string,
  overrides?: {
    indexer?: MemoryIndexer;
    store?: MemoryStore;
    config?: MemoryConfig;
  },
): MemoryIndexer | null {
  if (settings.memory?.enabled !== true) return null;

  const config = overrides?.config ?? resolveMemoryConfig(settings, workspaceRoot);
  const store = overrides?.store ?? new MemoryStore(path.join(config.wikiDir, 'index.db'), config);
  const indexer =
    overrides?.indexer ??
    (() => {
      const embedder = new Embedder(config.embeddingModel);
      return new MemoryIndexer(store, embedder, config);
    })();

  registerMemoryToolHandlers(server, indexer, store, config, workspaceRoot);

  return indexer;
}
