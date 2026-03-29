import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

export const EMBED_TEXT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** Lifecycle state for the in-process embed_text pipeline. */
export type ModelState = 'not_loaded' | 'loading' | 'ready' | 'failed';

export interface EmbedTextModelStateSnapshot {
  state: ModelState;
  loadedAt: number | null;
  lastError: string | null;
}

let embedState: EmbedTextModelStateSnapshot = {
  state: 'not_loaded',
  loadedAt: null,
  lastError: null,
};

let cachedPipeline: FeatureExtractionPipeline | null = null;
let inFlight: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedTextModelState(): EmbedTextModelStateSnapshot {
  return { ...embedState };
}

/** JSON for `GET /debug/models`. */
export function getModelsDebugJson(): { embed_text: EmbedTextModelStateSnapshot } {
  return { embed_text: getEmbedTextModelState() };
}

function ensurePipeline(): Promise<FeatureExtractionPipeline> {
  if (embedState.state === 'ready' && cachedPipeline) {
    return Promise.resolve(cachedPipeline);
  }
  if (!inFlight) {
    inFlight = (async () => {
      embedState = { state: 'loading', loadedAt: null, lastError: null };
      console.log('[agent] embed_text_model: loading...');
      try {
        const p = await pipeline('feature-extraction', EMBED_TEXT_MODEL_ID);
        cachedPipeline = p as FeatureExtractionPipeline;
        const loadedAt = Date.now();
        embedState = { state: 'ready', loadedAt, lastError: null };
        console.log('[agent] embed_text_model: ready');
        return cachedPipeline;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        cachedPipeline = null;
        embedState = { state: 'failed', loadedAt: null, lastError: msg };
        console.error('[agent] embed_text_model: failed error=' + msg);
        throw err;
      }
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Loads the embed_text pipeline if needed. Reuses an in-flight load.
 * After a failure, the next call starts a new load attempt.
 */
export async function getEmbedTextPipeline(): Promise<FeatureExtractionPipeline> {
  return ensurePipeline();
}

/**
 * Ensures the model is loaded. Idempotent when already ready.
 * Awaits an in-flight load. Retries after a previous failure.
 */
export async function warmupEmbedTextModel(): Promise<EmbedTextModelStateSnapshot> {
  console.log('[agent] embed_text_model: warmup requested');
  if (embedState.state === 'ready' && cachedPipeline) {
    console.log('[agent] embed_text_model: warmup skipped (already ready)');
    return getEmbedTextModelState();
  }
  try {
    await ensurePipeline();
  } catch {
    /* state already reflects failure */
  }
  return getEmbedTextModelState();
}
