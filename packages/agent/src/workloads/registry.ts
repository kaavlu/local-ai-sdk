import type { JobRecord } from '../jobs/index.js';
import { executeLocalClassifyText } from '../executors/classify-text.js';
import { executeLocalEmbedText } from '../executors/embed-text.js';
import { executeLocalGenerateText } from '../executors/generate-text.js';
import {
  getClassifyTextModelState,
  warmupClassifyTextModel,
} from '../models/classify-text-model.js';
import {
  getEmbedTextModelState,
  warmupEmbedTextModel,
} from '../models/embed-text-model.js';
import {
  getGenerateTextModelState,
  warmupGenerateTextModel,
} from '../models/generate-text-model.js';
import { validateGenerateTextPayload, validateTextObjectPayload } from './payload-validation.js';
import type {
  PayloadValidationResult,
  RealWorkloadDefinition,
  WorkloadModelHooks,
} from './types.js';

const embedTextModelHooks: WorkloadModelHooks = {
  modelsDebugKey: 'embed_text',
  readinessJsonKey: 'embedTextModel',
  getState: getEmbedTextModelState,
  warmup: warmupEmbedTextModel,
  warmupHttpPath: '/models/embed-text/warmup',
  warmupResponseField: 'embed_text',
  warmupFailureLabel: 'embed_text model failed to load',
};

const classifyTextModelHooks: WorkloadModelHooks = {
  modelsDebugKey: 'classify_text',
  readinessJsonKey: 'classifyTextModel',
  getState: getClassifyTextModelState,
  warmup: warmupClassifyTextModel,
  warmupHttpPath: '/models/classify-text/warmup',
  warmupResponseField: 'classify_text',
  warmupFailureLabel: 'classify_text model failed to load',
};

const generateTextModelHooks: WorkloadModelHooks = {
  modelsDebugKey: 'generate_text',
  readinessJsonKey: 'generateTextModel',
  getState: getGenerateTextModelState,
  warmup: warmupGenerateTextModel,
  warmupHttpPath: '/models/generate-text/warmup',
  warmupResponseField: 'generate_text',
  warmupFailureLabel: 'generate_text model failed to load',
};

export const REAL_WORKLOADS: Record<string, RealWorkloadDefinition> = {
  embed_text: {
    taskType: 'embed_text',
    validatePayload: (payload) => validateTextObjectPayload('embed_text', payload),
    executeLocal: async (job: JobRecord) => {
      const persistedOutput = await executeLocalEmbedText(job);
      return { persistedOutput };
    },
    modelHooks: embedTextModelHooks,
  } satisfies RealWorkloadDefinition,
  classify_text: {
    taskType: 'classify_text',
    validatePayload: (payload) => validateTextObjectPayload('classify_text', payload),
    executeLocal: async (job: JobRecord) => {
      const persistedOutput = await executeLocalClassifyText(job);
      return { persistedOutput };
    },
    modelHooks: classifyTextModelHooks,
  } satisfies RealWorkloadDefinition,
  generate_text: {
    taskType: 'generate_text',
    validatePayload: (payload) => validateGenerateTextPayload(payload),
    executeLocal: async (job: JobRecord) => {
      const persistedOutput = await executeLocalGenerateText(job);
      return { persistedOutput };
    },
    modelHooks: generateTextModelHooks,
  } satisfies RealWorkloadDefinition,
};

export function getRealWorkloadDefinition(taskType: string): RealWorkloadDefinition | undefined {
  return REAL_WORKLOADS[taskType];
}

export function isLocalRealWorkloadTaskType(taskType: string): boolean {
  return taskType in REAL_WORKLOADS;
}

/** Stable combined shape for `GET /debug/models`. */
export function getModelsDebugFromWorkloads(): Record<string, ReturnType<WorkloadModelHooks['getState']>> {
  const out: Record<string, ReturnType<WorkloadModelHooks['getState']>> = {};
  for (const def of Object.values(REAL_WORKLOADS)) {
    const h = def.modelHooks;
    if (!h) {
      continue;
    }
    out[h.modelsDebugKey] = h.getState();
  }
  return out;
}

/** Extra fields merged into `GET /debug/readiness` (model lifecycle rows). */
export function getReadinessModelFieldsFromWorkloads(): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const def of Object.values(REAL_WORKLOADS)) {
    const h = def.modelHooks;
    if (!h) {
      continue;
    }
    const s = h.getState();
    extra[h.readinessJsonKey] = {
      state: s.state,
      loadedAt: s.loadedAt,
      lastUsedAt: s.lastUsedAt,
      lastError: s.lastError,
    };
  }
  return extra;
}

export interface WarmupRouteDescriptor {
  taskType: string;
  path: string;
  warmup: () => Promise<unknown>;
  getState: WorkloadModelHooks['getState'];
  responseField: string;
  failureLabel: string;
  logTag: string;
}

export function listWarmupRoutes(): WarmupRouteDescriptor[] {
  const routes: WarmupRouteDescriptor[] = [];
  for (const def of Object.values(REAL_WORKLOADS)) {
    const h = def.modelHooks;
    if (!h) {
      continue;
    }
    routes.push({
      taskType: def.taskType,
      path: h.warmupHttpPath,
      warmup: h.warmup,
      getState: h.getState,
      responseField: h.warmupResponseField,
      failureLabel: h.warmupFailureLabel,
      logTag: def.taskType + '_model',
    });
  }
  return routes;
}

/** POST /jobs payload checks for registered real workloads; other task types unchanged. */
export function validatePayloadForKnownTask(
  taskType: string,
  payload: unknown,
): PayloadValidationResult {
  const def = REAL_WORKLOADS[taskType];
  if (def) {
    return def.validatePayload(payload);
  }
  return { ok: true };
}
