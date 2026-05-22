import { FASTEMBED_CACHE_DIR } from '../../utils/paths.js';

export { FASTEMBED_CACHE_DIR, MODEL_CACHE_DIR as DEFAULT_MODEL_CACHE_DIR } from '../../utils/paths.js';

export class EmbedderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EmbedderError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class Embedder {
  private readonly modelName: string;
  private pipeline: ((texts: string[]) => Promise<number[][]>) | null = null;
  private _dimension: number | undefined;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    if (!this.pipeline) {
      await this.loadModel();
    }

    try {
      const results = await this.pipeline!(texts);
      return results.map((vec) => {
        const arr = new Float32Array(vec);
        if (!this._dimension) this._dimension = arr.length;
        return arr;
      });
    } catch (cause) {
      throw new EmbedderError(`Embedding failed for batch of ${texts.length} texts`, cause);
    }
  }

  get dimension(): number | undefined {
    return this._dimension;
  }

  isReady(): boolean {
    return this.pipeline !== null;
  }

  async initialize(): Promise<void> {
    if (!this.pipeline) {
      await this.loadModel();
    }
  }

  private async loadModel(): Promise<void> {
    try {
      const { EmbeddingModel, FlagEmbedding } = await import('fastembed');

      const modelMap: Record<string, unknown> = {
        'Xenova/bge-small-en-v1.5': EmbeddingModel.BGESmallENV15,
        'Xenova/bge-base-en-v1.5': EmbeddingModel.BGEBaseENV15,
        'Xenova/all-MiniLM-L6-v2': EmbeddingModel.AllMiniLML6V2,
      };

      const model = modelMap[this.modelName] ?? EmbeddingModel.BGESmallENV15;

      const embedder = await FlagEmbedding.init({
        model: model as never,
        cacheDir: FASTEMBED_CACHE_DIR,
        showDownloadProgress: false,
      });

      this.pipeline = async (texts: string[]) => {
        const result: number[][] = [];
        for await (const batch of embedder.embed(texts, texts.length)) {
          for (const vec of batch) {
            result.push(Array.from(vec));
          }
        }
        return result;
      };
    } catch (cause) {
      throw new EmbedderError(`Failed to load embedding model: ${this.modelName}`, cause);
    }
  }
}
