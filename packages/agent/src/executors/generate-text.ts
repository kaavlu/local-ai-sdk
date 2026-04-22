import type { JobRecord } from '../jobs/index.js';
import { GENERATE_TEXT_MODEL_ID, getGenerateTextPipeline } from '../models/generate-text-model.js';
import { parseGenerateTextPayload } from '../workloads/payload-validation.js';

function extractGeneratedText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    const head = raw[0];
    if (head && typeof head === 'object' && 'generated_text' in head) {
      const text = (head as Record<string, unknown>).generated_text;
      if (typeof text === 'string') {
        return text;
      }
    }
  }
  if (raw && typeof raw === 'object' && 'generated_text' in raw) {
    const text = (raw as Record<string, unknown>).generated_text;
    if (typeof text === 'string') {
      return text;
    }
  }
  throw new Error('unexpected generate_text output shape');
}

export interface GenerateTextJobResult {
  message: string;
  taskType: 'generate_text';
  executor: 'local_real';
  model: string;
  output: string;
  usage: {
    promptChars: number;
    completionChars: number;
    totalChars: number;
  };
  parameters: {
    maxNewTokens: number;
    temperature: number;
    topP: number;
  };
}

/**
 * Local generation via Transformers.js (`Xenova/distilgpt2`) with bounded decode controls.
 */
export async function executeLocalGenerateText(job: JobRecord): Promise<GenerateTextJobResult> {
  if (job.taskType !== 'generate_text') {
    throw new Error('executeLocalGenerateText requires taskType "generate_text"');
  }

  const payload = parseGenerateTextPayload(job.payload);

  const run = async (): Promise<GenerateTextJobResult> => {
    const pipe = await getGenerateTextPipeline();
    const raw = await pipe(payload.text, {
      max_new_tokens: payload.maxNewTokens,
      temperature: payload.temperature,
      top_p: payload.topP,
      do_sample: true,
      return_full_text: false,
    });
    const output = extractGeneratedText(raw).trim();
    if (output.length === 0) {
      throw new Error('generation model returned empty text');
    }
    const promptChars = payload.text.length;
    const completionChars = output.length;
    return {
      message: 'Text generated',
      taskType: 'generate_text',
      executor: 'local_real',
      model: GENERATE_TEXT_MODEL_ID,
      output,
      usage: {
        promptChars,
        completionChars,
        totalChars: promptChars + completionChars,
      },
      parameters: {
        maxNewTokens: payload.maxNewTokens,
        temperature: payload.temperature,
        topP: payload.topP,
      },
    };
  };

  try {
    return await run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] generate_text: execution failed id=' + job.id + ':', err);
    throw new Error(`generate_text failed: ${msg}`);
  }
}
