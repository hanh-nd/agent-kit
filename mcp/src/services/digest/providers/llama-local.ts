import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLlama, LlamaChatSession, createModelDownloader } from 'node-llama-cpp';
import { LLAMA_CONTEXT_SIZE, LLAMA_MAX_GENERATED_TOKENS, LLAMA_TEMPERATURE } from '../constants.js';
import { getDigestModelSpec } from '../model-registry.js';
import type { ConversationDigestProvider } from '../types.js';
import type { ConversationDigestInput } from '../types.js';
import { withTimeout } from '../../../utils/async.js';
import { MODEL_CACHE_DIR } from '../../../utils/paths.js';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

class LlamaLocalDigestProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlamaLocalDigestProviderError';
  }
}

function titleFromSource(sourcePath: string): string {
  return path
    .basename(sourcePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ');
}

function trimConversationExport(content: string, maxInputChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxInputChars) return trimmed;

  return [
    '[Earlier conversation content omitted to fit the local digest context window.]',
    trimmed.slice(-maxInputChars),
  ].join('\n\n');
}

function buildPrompt(input: ConversationDigestInput, maxInputChars: number): ChatMessage[] {
  const conversationExport = trimConversationExport(input.content, maxInputChars);

  return [
    {
      role: 'system',
      content: [
        '# ROLE',
        'You write short project-memory wiki pages from developer transcripts.',
        'Your output is temporary recall to prevent blind steps.',
        '',
        '# RULES',
        '1. Read the end of the export FIRST to discover the ultimate resolution.',
        '2. What the user says LAST ALWAYS overrides earlier agreements.',
        '3. Capture absolute engineering conclusions, never conversational pleasantries.',
        '4. Return Markdown only. Do not wrap output in code blocks (```markdown ... ```).',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Generate a high-level project memory page. STRICTLY adhere to this architectural layout:',
        '',
        '<layout>',
        '# Digest: ' + titleFromSource(input.sourcePath),
        '- **Ultimate Core Resolution**: [Describe the final working state of the feature and what problem it solves in 1-2 sentences. No conversational filler.]',
        '- **Architectural Changes**: [List 3-4 high-level engineering decisions made (e.g., shifts in hook timing, data isolation, atomic locks). Focus on systemic changes, NOT individual files.]',
        '- **Component State**: [Briefly state how the Plugin side and the MCP/CLI side now interact based on the final decision.]',
        '- **Considered & Rejected**: [List concepts proposed but discarded (e.g., initial hooks location, mocking strategies). Omit if empty.]',
        '</layout>',
        '',
        '# CRITICAL RULES:',
        '- DO NOT list individual file paths, line numbers, or specific test cases (EXCLUDE lists of files).',
        '- Focus entirely on the SYSTEM DESIGN and ARCHITECTURE that the next engineer needs to know.',
        '- Keep output under 300 tokens. Stop immediately after the last valid section.',
        '',
        'Source path: ' + input.sourcePath,
        '<conversation_export format="memory-kit">',
        conversationExport,
        '</conversation_export>',
      ].join('\n'),
    },
  ];
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

function sanitizeConversationDigestMarkdown(generatedText: string): string {
  return stripCodeFence(generatedText).trim() + '\n';
}

export async function createLlamaLocalDigestProvider(modelId: string): Promise<ConversationDigestProvider> {
  const spec = getDigestModelSpec(modelId);

  const modelCacheDir = path.join(MODEL_CACHE_DIR, 'llama');
  fs.mkdirSync(modelCacheDir, { recursive: true });

  let modelFilePath: string;
  try {
    const downloader = await createModelDownloader({
      modelUri: spec.ggufUri,
      dirPath: modelCacheDir,
    });
    modelFilePath = downloader.entrypointFilePath;
    if (!fs.existsSync(modelFilePath)) {
      await downloader.download();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlamaLocalDigestProviderError(`Failed to download model: ${message}`);
  }

  type LlamaInstance = Awaited<ReturnType<typeof getLlama>>;
  type LlamaModel = Awaited<ReturnType<LlamaInstance['loadModel']>>;

  let llama: LlamaInstance;
  let model: LlamaModel;

  try {
    llama = await getLlama();
    model = await llama.loadModel({ modelPath: modelFilePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlamaLocalDigestProviderError(`Failed to load model: ${message}`);
  }

  return {
    id: 'llama-local',
    async dispose() {
      await model.dispose();
    },
    async generateDigestMarkdown(input, options) {
      const messages = buildPrompt(input, options.maxInputChars);
      const systemContent = messages[0].content;
      const userContent = messages[1].content;

      const context = await model.createContext({ contextSize: LLAMA_CONTEXT_SIZE });
      try {
        const session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt: systemContent,
        });

        const response = await withTimeout(
          session.prompt(userContent, {
            maxTokens: LLAMA_MAX_GENERATED_TOKENS,
            temperature: LLAMA_TEMPERATURE,
          }),
          options.timeoutMs,
          () => new LlamaLocalDigestProviderError(`Llama provider timed out after ${options.timeoutMs}ms`),
        );

        return sanitizeConversationDigestMarkdown(response);
      } finally {
        await context.dispose();
      }
    },
  };
}
