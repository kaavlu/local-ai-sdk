import { pipeline, type TextClassificationPipeline } from '@huggingface/transformers';

/** Small SST-2 sentiment classifier (ONNX via Transformers.js). */
export const CLASSIFY_TEXT_MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

export type ClassifyTextModelState = 'not_loaded' | 'loading' | 'ready' | 'failed';

export interface ClassifyTextModelStateSnapshot {
  state: ClassifyTextModelState;
  loadedAt: number | null;
  lastUsedAt: number | null;
  lastError: string | null;
}

let classifyState: ClassifyTextModelStateSnapshot = {
  state: 'not_loaded',
  loadedAt: null,
  lastUsedAt: null,
  lastError: null,
};

let cachedPipeline: TextClassificationPipeline | null = null;
let inFlight: Promise<TextClassificationPipeline> | null = null;

export function getClassifyTextModelState(): ClassifyTextModelStateSnapshot {
  return { ...classifyState };
}

export function markClassifyTextModelUsed(): void {
  if (classifyState.state !== 'ready' || !cachedPipeline) {
    return;
  }
  const now = Date.now();
  classifyState = { ...classifyState, lastUsedAt: now };
}

export function unloadClassifyTextModel(): void {
  if (inFlight !== null || classifyState.state === 'loading') {
    return;
  }
  if (cachedPipeline !== null) {
    console.log('[agent] classify_text_model: unloaded (eviction or residency policy)');
  }
  cachedPipeline = null;
  classifyState = {
    state: 'not_loaded',
    loadedAt: null,
    lastUsedAt: null,
    lastError: null,
  };
}

function ensurePipeline(): Promise<TextClassificationPipeline> {
  if (classifyState.state === 'ready' && cachedPipeline) {
    return Promise.resolve(cachedPipeline);
  }
  if (!inFlight) {
    inFlight = (async () => {
      classifyState = { state: 'loading', loadedAt: null, lastUsedAt: null, lastError: null };
      console.log('[agent] classify_text_model: loading...');
      try {
        const p = await pipeline('text-classification', CLASSIFY_TEXT_MODEL_ID);
        cachedPipeline = p as TextClassificationPipeline;
        const loadedAt = Date.now();
        classifyState = { state: 'ready', loadedAt, lastUsedAt: loadedAt, lastError: null };
        console.log('[agent] classify_text_model: ready');
        return cachedPipeline;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        cachedPipeline = null;
        classifyState = { state: 'failed', loadedAt: null, lastUsedAt: null, lastError: msg };
        console.error('[agent] classify_text_model: failed error=' + msg);
        throw err;
      }
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export async function getClassifyTextPipeline(): Promise<TextClassificationPipeline> {
  const p = await ensurePipeline();
  markClassifyTextModelUsed();
  return p;
}

export async function warmupClassifyTextModel(): Promise<ClassifyTextModelStateSnapshot> {
  console.log('[agent] classify_text_model: warmup requested');
  if (classifyState.state === 'ready' && cachedPipeline) {
    console.log('[agent] classify_text_model: warmup skipped (already ready)');
    markClassifyTextModelUsed();
    return getClassifyTextModelState();
  }
  try {
    await ensurePipeline();
    markClassifyTextModelUsed();
  } catch {
    /* state already reflects failure */
  }
  return getClassifyTextModelState();
}
