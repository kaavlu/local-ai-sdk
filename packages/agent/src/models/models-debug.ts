import { getModelsDebugFromWorkloads } from '../workloads/registry.js';
import type { ClassifyTextModelStateSnapshot } from './classify-text-model.js';
import type { EmbedTextModelStateSnapshot } from './embed-text-model.js';
import {
  getWorkloadModelRuntimeConfigSnapshot,
  runIdleEvictionAfterLocalJob,
} from './workload-model-runtime.js';

/** Combined lifecycle rows for `GET /debug/models`. */
export function getModelsDebugJson(): {
  workloadModelRuntime: ReturnType<typeof getWorkloadModelRuntimeConfigSnapshot>;
  embed_text: EmbedTextModelStateSnapshot;
  classify_text: ClassifyTextModelStateSnapshot;
} {
  runIdleEvictionAfterLocalJob();
  return {
    workloadModelRuntime: getWorkloadModelRuntimeConfigSnapshot(),
    ...(getModelsDebugFromWorkloads() as {
      embed_text: EmbedTextModelStateSnapshot;
      classify_text: ClassifyTextModelStateSnapshot;
    }),
  };
}
