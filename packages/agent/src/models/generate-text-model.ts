import { pipeline } from '@huggingface/transformers';

/** Small local generation model for `generate_text` (ONNX via Transformers.js). */
export const GENERATE_TEXT_MODEL_ID = 'Xenova/distilgpt2';

export type GenerateTextModelState = 'not_loaded' | 'loading' | 'ready' | 'failed';

export interface GenerateTextModelStateSnapshot {
  state: GenerateTextModelState;
  loadedAt: number | null;
  lastUsedAt: number | null;
  lastError: string | null;
}

export type GenerateTextPipeline = (
  prompt: string,
  options?: Record<string, unknown>,
) => Promise<unknown>;

let generateTextState: GenerateTextModelStateSnapshot = {
  state: 'not_loaded',
  loadedAt: null,
  lastUsedAt: null,
  lastError: null,
};

let cachedPipeline: GenerateTextPipeline | null = null;
let inFlight: Promise<GenerateTextPipeline> | null = null;

type GenerateTextPipelineFactory = () => Promise<GenerateTextPipeline>;

async function defaultGenerateTextPipelineFactory(): Promise<GenerateTextPipeline> {
  const p = await pipeline('text-generation', GENERATE_TEXT_MODEL_ID);
  return p as GenerateTextPipeline;
}

let pipelineFactory: GenerateTextPipelineFactory = defaultGenerateTextPipelineFactory;

export function getGenerateTextModelState(): GenerateTextModelStateSnapshot {
  return { ...generateTextState };
}

export function markGenerateTextModelUsed(): void {
  if (generateTextState.state !== 'ready' || !cachedPipeline) {
    return;
  }
  const now = Date.now();
  generateTextState = { ...generateTextState, lastUsedAt: now };
}

export function unloadGenerateTextModel(): void {
  if (inFlight !== null || generateTextState.state === 'loading') {
    return;
  }
  if (cachedPipeline !== null) {
    console.log('[agent] generate_text_model: unloaded (eviction or residency policy)');
  }
  cachedPipeline = null;
  generateTextState = {
    state: 'not_loaded',
    loadedAt: null,
    lastUsedAt: null,
    lastError: null,
  };
}

function ensurePipeline(): Promise<GenerateTextPipeline> {
  if (generateTextState.state === 'ready' && cachedPipeline) {
    return Promise.resolve(cachedPipeline);
  }
  if (!inFlight) {
    inFlight = (async () => {
      generateTextState = { state: 'loading', loadedAt: null, lastUsedAt: null, lastError: null };
      console.log('[agent] generate_text_model: loading...');
      try {
        const p = await pipelineFactory();
        cachedPipeline = p;
        const loadedAt = Date.now();
        generateTextState = { state: 'ready', loadedAt, lastUsedAt: loadedAt, lastError: null };
        console.log('[agent] generate_text_model: ready');
        return cachedPipeline;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        cachedPipeline = null;
        generateTextState = { state: 'failed', loadedAt: null, lastUsedAt: null, lastError: msg };
        console.error('[agent] generate_text_model: failed error=' + msg);
        throw err;
      }
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export async function getGenerateTextPipeline(): Promise<GenerateTextPipeline> {
  const p = await ensurePipeline();
  markGenerateTextModelUsed();
  return p;
}

export async function warmupGenerateTextModel(): Promise<GenerateTextModelStateSnapshot> {
  console.log('[agent] generate_text_model: warmup requested');
  if (generateTextState.state === 'ready' && cachedPipeline) {
    console.log('[agent] generate_text_model: warmup skipped (already ready)');
    markGenerateTextModelUsed();
    return getGenerateTextModelState();
  }
  try {
    await ensurePipeline();
    markGenerateTextModelUsed();
  } catch {
    /* state already reflects failure */
  }
  return getGenerateTextModelState();
}

/** Test hook: inject a deterministic loader and reset runtime state. */
export function __setGenerateTextPipelineFactoryForTests(
  factory: GenerateTextPipelineFactory | null,
): void {
  pipelineFactory = factory ?? defaultGenerateTextPipelineFactory;
  unloadGenerateTextModel();
}

/** Test hook: reset in-memory state to baseline. */
export function __resetGenerateTextModelForTests(): void {
  pipelineFactory = defaultGenerateTextPipelineFactory;
  inFlight = null;
  cachedPipeline = null;
  generateTextState = {
    state: 'not_loaded',
    loadedAt: null,
    lastUsedAt: null,
    lastError: null,
  };
}
