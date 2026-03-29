import type {
  TextClassificationOutput,
  TextClassificationSingle,
} from '@huggingface/transformers';
import type { JobRecord } from '../jobs/index.js';
import { getClassifyTextPipeline } from '../models/classify-text-model.js';
import { parseNonEmptyTextPayload } from '../workloads/payload-validation.js';

function firstClassificationResult(
  out: TextClassificationOutput | TextClassificationOutput[],
): TextClassificationSingle {
  if (!Array.isArray(out) || out.length === 0) {
    throw new Error('classifier returned no predictions');
  }
  const head = out[0] as TextClassificationSingle | TextClassificationOutput;
  if (
    head &&
    typeof head === 'object' &&
    'label' in head &&
    typeof (head as TextClassificationSingle).score === 'number'
  ) {
    return head as TextClassificationSingle;
  }
  if (Array.isArray(head)) {
    const inner = head as TextClassificationOutput;
    if (inner.length === 0) {
      throw new Error('classifier returned empty inner batch');
    }
    return inner[0];
  }
  throw new Error('unexpected classifier output shape');
}

export interface ClassifyTextJobResult {
  message: string;
  taskType: 'classify_text';
  executor: 'local_real';
  label: string;
  score: number;
}

/**
 * Local text classification via Transformers.js (DistilBERT SST-2 ONNX).
 * Model lifecycle: `models/classify-text-model.ts`.
 */
export async function executeLocalClassifyText(job: JobRecord): Promise<ClassifyTextJobResult> {
  if (job.taskType !== 'classify_text') {
    throw new Error('executeLocalClassifyText requires taskType "classify_text"');
  }

  const text = parseNonEmptyTextPayload('classify_text', job.payload);

  const run = async (): Promise<ClassifyTextJobResult> => {
    const pipe = await getClassifyTextPipeline();
    const raw = await pipe(text);
    const best = firstClassificationResult(raw);
    return {
      message: 'Classification complete',
      taskType: 'classify_text',
      executor: 'local_real',
      label: best.label,
      score: best.score,
    };
  };

  try {
    return await run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] classify_text: execution failed id=' + job.id + ':', err);
    throw new Error(`classify_text failed: ${msg}`);
  }
}
