import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Embedder } from '../services/memory/embedder.js';
import { MemoryIndexer } from '../services/memory/indexer.js';
import { MemoryStore } from '../services/memory/store.js';
import type { MemoryConfig } from '../services/memory/types.js';
import { initializeConversationDigestModel } from '../services/digest/processor.js';
import { DEFAULT_DIGEST_MODEL_ID } from '../services/digest/constants.js';
import { mcpJson, mcpText } from '../utils/utils.js';
import {
  loadProjectSettings,
  resolveConversationDigestConfig,
  resolveMemoryConfig,
  type ProjectSettings,
} from '../core/config/index.js';

/**
 * Registers tool handlers onto an already-constructed indexer/store pair.
 * Exported for unit testing with mocks.
 */
export function registerMemoryToolHandlers(
  server: McpServer,
  indexer: MemoryIndexer,
  store: MemoryStore,
  config: MemoryConfig,
  workspaceRoot: string = process.cwd(),
): void {
  server.tool(
    'kit_memory_search',
    'Search persistent memory for context relevant to the current question. Returns semantically relevant results using hybrid dense+BM25+RRF search.',
    {
      query: z.string().min(1).describe('Search query'),
      top_k: z.number().int().positive().optional().describe('Number of results to return'),
    },
    async ({ query, top_k }) => {
      try {
        const results = await indexer.search(query, top_k ?? config.topK);

        if (results.length === 0) {
          const degradedNote = !store.vecAvailable
            ? '⚠️ Vector search unavailable — showing keyword-only results.\n\n'
            : '';
          return mcpText(`${degradedNote}No memories found for query: "${query}"`);
        }

        const degradedNote = !store.vecAvailable
          ? '⚠️ Vector search unavailable — showing keyword-only results.\n\n'
          : '';

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
        const message = err instanceof Error ? err.message : String(err);
        return mcpText(`kit_memory_search failed: ${message}`);
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
        const message = err instanceof Error ? err.message : String(err);
        return mcpJson({ saved: false, error: message });
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
        const message = err instanceof Error ? err.message : String(err);
        return mcpJson({ initialized: false, error: message });
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
): MemoryIndexer | null {
  if (settings.memory?.enabled !== true) return null;

  const config = resolveMemoryConfig(settings, workspaceRoot);
  const store = new MemoryStore(path.join(config.wikiDir, 'index.db'), config);
  const embedder = new Embedder(config.embeddingModel);
  const indexer = new MemoryIndexer(store, embedder, config);

  registerMemoryToolHandlers(server, indexer, store, config, workspaceRoot);

  return indexer;
}
