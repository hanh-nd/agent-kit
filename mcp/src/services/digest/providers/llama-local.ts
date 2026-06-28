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

export function titleFromSource(sourcePath: string): string {
  return path
    .basename(sourcePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ');
}

export function trimConversationExport(content: string, maxInputChars: number): string {
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
        'You are a technical summarizer.',
        'Focus ONLY on the final decisions made at the end of the transcript.',
        'Never invent or guess details.',
        'Keep the output concise and strictly factual.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Transcript:',
        conversationExport,
        '',
        'Task: Write a brief summary paragraph of the final agreed-upon decisions in the transcript above. Then, provide a simple bulleted list of the specific technical changes or outcomes.',
      ].join('\n'),
    },
  ];
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export function sanitizeConversationDigestMarkdown(generatedText: string): string {
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
            budgets: { thoughtTokens: 0 },
          }),
          options.timeoutMs,
          () => new LlamaLocalDigestProviderError(`Llama provider timed out after ${options.timeoutMs}ms`),
        );

        const metadata = `## Digest: ${titleFromSource(input.sourcePath)}

| Key | Value |
| ------ | ----- |
| **Source** | ${input.sourcePath} |
| **Generated** | ${new Date().toISOString().split('T')[0]} |
| **Model** | ${modelId} |
`;
        const sanitized = sanitizeConversationDigestMarkdown(response);
        return `${metadata}\n\n${sanitized}`;
      } finally {
        await context.dispose();
      }
    },
  };
}
