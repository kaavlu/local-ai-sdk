import type { Tensor } from '@huggingface/transformers';
import type { JobRecord } from '../jobs/index.js';
import { getEmbedTextPipeline } from '../models/embed-text-model.js';
import { parseNonEmptyTextPayload } from '../workloads/payload-validation.js';

const PREVIEW_LEN = 8;

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

  const text = parseNonEmptyTextPayload('embed_text', job.payload);

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
    return await run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] embed_text: execution failed id=' + job.id + ':', err);
    throw new Error(`embed_text failed: ${msg}`);
  }
}
