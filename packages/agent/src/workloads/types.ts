import type { JobRecord } from '../jobs/index.js';

export type PayloadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Internal executor outcome: pipeline always persists `persistedOutput` to `results.output_json`.
 * Shape must match existing API contracts per workload.
 */
export interface LocalRealExecutionOutcome {
  persistedOutput: unknown;
}

export interface WorkloadModelHooks {
  /** Key in `GET /debug/models` JSON */
  modelsDebugKey: string;
  /** Key merged into `GET /debug/readiness` for model rows */
  readinessJsonKey: string;
  getState: () => {
    state: string;
    loadedAt: number | null;
    lastUsedAt: number | null;
    lastError: string | null;
  };
  warmup: () => Promise<unknown>;
  /** `POST` path for warmup (stable public route) */
  warmupHttpPath: string;
  /** Top-level field in successful warmup JSON body, e.g. `embed_text` */
  warmupResponseField: string;
  /** Human-readable label for warmup failure messages / logs */
  warmupFailureLabel: string;
}

export interface RealWorkloadDefinition {
  taskType: string;
  validatePayload: (payload: unknown) => PayloadValidationResult;
  executeLocal: (job: JobRecord) => Promise<LocalRealExecutionOutcome>;
  /** When set, model warmup + debug/readiness rows are wired automatically. */
  modelHooks?: WorkloadModelHooks;
}
