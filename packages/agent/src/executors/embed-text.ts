import type { Tensor } from '@huggingface/transformers';
import type { JobRecord } from '../jobs/index.js';
import { getEmbedTextPipeline } from '../models/embed-text-model.js';

/** Wall-clock limit for model load + inference (first run may download weights). */
const EMBED_TEXT_TIMEOUT_MS = 300_000;

const PREVIEW_LEN = 8;

function parseEmbedTextPayload(payload: unknown): string {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('embed_text payload must be an object with a non-empty string field "text"');
  }
  const text = (payload as Record<string, unknown>).text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('embed_text payload must include a non-empty string field "text"');
  }
  return text;
}

function tensorToEmbeddingVector(tensor: Tensor): number[] {
  const raw = tensor.data;
  if (raw instanceof Float32Array) {
    return Array.from(raw);
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((x) => (typeof x === 'number' ? [x] : Array.from(x as Iterable<number>)));
  }
  throw new Error('Unexpected embedding tensor data layout');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

export interface EmbedTextJobResult {
  message: string;
  taskType: 'embed_text';
  executor: 'local_real';
  dimensions: number;
  embeddingPreview: number[];
  embedding: number[];
}

/**
 * Local ONNX embedding via Transformers.js (Xenova/all-MiniLM-L6-v2).
 * Loading is owned by `models/embed-text-model.ts` and reused across jobs.
 */
export async function executeLocalEmbedText(job: JobRecord): Promise<EmbedTextJobResult> {
  if (job.taskType !== 'embed_text') {
    throw new Error('executeLocalEmbedText requires taskType "embed_text"');
  }

  const text = parseEmbedTextPayload(job.payload);

  const run = async (): Promise<EmbedTextJobResult> => {
    const pipe = await getEmbedTextPipeline();
    const tensor = await pipe(text, { pooling: 'mean', normalize: true });
    const embedding = tensorToEmbeddingVector(tensor);
    const dimensions = embedding.length;
    if (dimensions === 0) {
      throw new Error('embedding model returned an empty vector');
    }
    const embeddingPreview = embedding.slice(0, PREVIEW_LEN);
    return {
      message: 'Embedding generated',
      taskType: 'embed_text',
      executor: 'local_real',
      dimensions,
      embeddingPreview,
      embedding,
    };
  };

  try {
    return await withTimeout(run(), EMBED_TEXT_TIMEOUT_MS, 'embed_text (load or inference)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] embed_text: execution failed id=' + job.id + ':', err);
    throw new Error(`embed_text failed: ${msg}`);
  }
}
