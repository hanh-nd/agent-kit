import type { DigestModelSpec } from './types.js';

export class DigestModelRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigestModelRegistryError';
  }
}

export const DIGEST_MODEL_REGISTRY: Record<string, DigestModelSpec> = {
  'qwen2.5-0.5b-instruct-q4': {
    id: 'qwen2.5-0.5b-instruct-q4',
    ggufUri: 'hf:bartowski/Qwen2.5-0.5B-Instruct-GGUF/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',

    approxSizeBytes: 400_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF',
    enabled: true,
  },
  'qwen2.5-1.5b-instruct-q4': {
    id: 'qwen2.5-1.5b-instruct-q4',
    ggufUri: 'hf:bartowski/Qwen2.5-1.5B-Instruct-GGUF/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',

    approxSizeBytes: 1_000_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    enabled: true,
  },
  'qwen2.5-3b-instruct-q4': {
    id: 'qwen2.5-3b-instruct-q4',
    ggufUri: 'hf:bartowski/Qwen2.5-3B-Instruct-GGUF/Qwen2.5-3B-Instruct-Q4_K_M.gguf',

    approxSizeBytes: 1_900_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF',
    enabled: true,
  },
};

export function getDigestModelSpec(modelId: string): DigestModelSpec {
  if (!modelId.trim()) {
    throw new DigestModelRegistryError('Digest model id is required');
  }

  const spec = DIGEST_MODEL_REGISTRY[modelId];
  if (!spec) {
    throw new DigestModelRegistryError(`Unknown digest model: ${modelId}`);
  }
  if (spec.enabled !== true) {
    throw new DigestModelRegistryError(`Digest model is disabled: ${modelId}`);
  }
  if (!spec.ggufUri || !spec.sourceUrl) {
    throw new DigestModelRegistryError(`Digest model spec is incomplete: ${modelId}`);
  }

  return spec;
}
