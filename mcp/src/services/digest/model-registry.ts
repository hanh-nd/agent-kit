import { DigestModelId, type DigestModelSpec } from './types.js';

class DigestModelRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigestModelRegistryError';
  }
}

const DIGEST_MODEL_REGISTRY: Record<string, DigestModelSpec> = {
  [DigestModelId.TINY]: {
    id: DigestModelId.TINY,
    ggufUri: 'hf:lmstudio-community/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q4_K_M.gguf',

    approxSizeBytes: 528_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF',
    enabled: true,
  },
  [DigestModelId.BASE]: {
    id: DigestModelId.BASE,
    ggufUri: 'hf:lmstudio-community/Qwen3.5-2B-GGUF/Qwen3.5-2B-Q4_K_M.gguf',

    approxSizeBytes: 1_270_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-2B-GGUF',
    enabled: true,
  },
  [DigestModelId.LARGE]: {
    id: DigestModelId.LARGE,
    ggufUri: 'hf:lmstudio-community/Qwen3.5-4B-GGUF/Qwen3.5-4B-Q4_K_M.gguf',

    approxSizeBytes: 2_710_000_000,
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF',
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
