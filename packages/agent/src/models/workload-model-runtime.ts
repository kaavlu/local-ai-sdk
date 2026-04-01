/**
 * Step 19 — local workload model residency, idle eviction, and pipeline-level execution timeout.
 *
 * Idle eviction and max-resident checks are synchronous and triggered from safe call sites
 * (before/after local jobs, warmup, debug). No background timers.
 *
 * Execution timeout uses Promise.race at the pipeline layer. It does not interrupt ONNX /
 * Transformers.js internals; if inference hangs inside native/WASM code, work may continue until
 * the underlying promise settles even though the job attempt is already failed/requeued.
 */

import {
  getClassifyTextModelState,
  unloadClassifyTextModel,
} from './classify-text-model.js';
import {
  getEmbedTextModelState,
  unloadEmbedTextModel,
} from './embed-text-model.js';

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/**
 * How long a ready model may sit unused before opportunistic eviction (ms).
 * Override locally for verification: `DYNO_WORKLOAD_IDLE_EVICT_MS` (positive integer ms).
 */
export const WORKLOAD_MODEL_IDLE_EVICT_AFTER_MS = readPositiveIntEnv(
  'DYNO_WORKLOAD_IDLE_EVICT_MS',
  15 * 60 * 1000,
);

/**
 * Cap on simultaneously resident real workload models. When an upcoming workload needs a load
 * and this many others are already ready, the least-recently-used ready model is unloaded first
 * (if not active and not loading). Default 2 preserves prior behavior for the two workloads.
 */
export const MAX_RESIDENT_WORKLOAD_MODELS = 2;

/**
 * Default wall-clock budget for one local real workload attempt (load + inference).
 * Override locally for verification: `DYNO_WORKLOAD_EXEC_TIMEOUT_MS` (applies to both workloads).
 */
export const DEFAULT_LOCAL_WORKLOAD_EXECUTION_TIMEOUT_MS = readPositiveIntEnv(
  'DYNO_WORKLOAD_EXEC_TIMEOUT_MS',
  300_000,
);

const PER_WORKLOAD_EXECUTION_TIMEOUT_MS: Partial<Record<string, number>> = {
  embed_text: DEFAULT_LOCAL_WORKLOAD_EXECUTION_TIMEOUT_MS,
  classify_text: DEFAULT_LOCAL_WORKLOAD_EXECUTION_TIMEOUT_MS,
};

const REAL_TASK_ORDER = ['embed_text', 'classify_text'] as const;

type RealTaskType = (typeof REAL_TASK_ORDER)[number];

function isRealTaskType(s: string): s is RealTaskType {
  return (REAL_TASK_ORDER as readonly string[]).includes(s);
}

function unloadForTaskType(taskType: RealTaskType): void {
  if (taskType === 'embed_text') {
    unloadEmbedTextModel();
  } else {
    unloadClassifyTextModel();
  }
}

function getStateFor(taskType: RealTaskType) {
  return taskType === 'embed_text' ? getEmbedTextModelState() : getClassifyTextModelState();
}

function listReadyTaskTypes(): RealTaskType[] {
  const out: RealTaskType[] = [];
  for (const t of REAL_TASK_ORDER) {
    if (getStateFor(t).state === 'ready') {
      out.push(t);
    }
  }
  return out;
}

/** Set between pipeline `executeLocal` entry and finally (single in-flight local job). */
let activeLocalWorkloadTaskType: string | null = null;

export function beginLocalWorkloadExecution(taskType: string): void {
  activeLocalWorkloadTaskType = taskType;
}

export function endLocalWorkloadExecution(): void {
  activeLocalWorkloadTaskType = null;
}

export function getActiveLocalWorkloadTaskType(): string | null {
  return activeLocalWorkloadTaskType;
}

export function getLocalWorkloadExecutionTimeoutMs(taskType: string): number {
  return PER_WORKLOAD_EXECUTION_TIMEOUT_MS[taskType] ?? DEFAULT_LOCAL_WORKLOAD_EXECUTION_TIMEOUT_MS;
}

export function getWorkloadModelRuntimeConfigSnapshot(): {
  idleEvictAfterMs: number;
  maxResidentWorkloadModels: number;
  defaultExecutionTimeoutMs: number;
  perWorkloadExecutionTimeoutMs: Record<string, number>;
} {
  const per: Record<string, number> = {};
  for (const t of REAL_TASK_ORDER) {
    per[t] = getLocalWorkloadExecutionTimeoutMs(t);
  }
  return {
    idleEvictAfterMs: WORKLOAD_MODEL_IDLE_EVICT_AFTER_MS,
    maxResidentWorkloadModels: MAX_RESIDENT_WORKLOAD_MODELS,
    defaultExecutionTimeoutMs: DEFAULT_LOCAL_WORKLOAD_EXECUTION_TIMEOUT_MS,
    perWorkloadExecutionTimeoutMs: per,
  };
}

function canEvictTaskType(taskType: RealTaskType, now: number): boolean {
  if (activeLocalWorkloadTaskType === taskType) {
    return false;
  }
  const s = getStateFor(taskType);
  if (s.state !== 'ready' || s.lastUsedAt == null) {
    return false;
  }
  return now - s.lastUsedAt >= WORKLOAD_MODEL_IDLE_EVICT_AFTER_MS;
}

/**
 * Whether the workload would be evicted by idle rules at `now` (same logic as eviction call sites).
 * Used by focused verification; not part of the public HTTP API.
 */
export function isWorkloadModelIdleEvictionEligible(taskType: string, now: number): boolean {
  if (!isRealTaskType(taskType)) {
    return false;
  }
  return canEvictTaskType(taskType, now);
}

/**
 * Before loading or using a workload model: evict other models that exceeded the idle threshold,
 * then enforce max resident count if the upcoming task still needs a load.
 */
export function prepareWorkloadModelAccessForTask(upcomingTaskType: string): void {
  if (!isRealTaskType(upcomingTaskType)) {
    return;
  }
  const now = Date.now();

  for (const t of REAL_TASK_ORDER) {
    if (t === upcomingTaskType) {
      continue;
    }
    if (canEvictTaskType(t, now)) {
      console.log(
        '[agent] workload_model_runtime: idle eviction taskType=' + t + ' idleMs>=' + WORKLOAD_MODEL_IDLE_EVICT_AFTER_MS,
      );
      unloadForTaskType(t);
    }
  }

  const upcomingReady = getStateFor(upcomingTaskType).state === 'ready';
  if (upcomingReady || MAX_RESIDENT_WORKLOAD_MODELS <= 0) {
    return;
  }

  let ready = listReadyTaskTypes();
  while (ready.length >= MAX_RESIDENT_WORKLOAD_MODELS) {
    const victims = ready
      .filter((t) => t !== upcomingTaskType && activeLocalWorkloadTaskType !== t)
      .sort((a, b) => {
        const ua = getStateFor(a).lastUsedAt ?? 0;
        const ub = getStateFor(b).lastUsedAt ?? 0;
        return ua - ub;
      });
    const victim = victims[0];
    if (!victim) {
      break;
    }
    console.log(
      '[agent] workload_model_runtime: max resident eviction taskType=' +
        victim +
        ' max=' +
        MAX_RESIDENT_WORKLOAD_MODELS,
    );
    unloadForTaskType(victim);
    ready = listReadyTaskTypes();
  }
}

/** After a local job: evict any idle-ready model past threshold (none are active). */
export function runIdleEvictionAfterLocalJob(): void {
  const now = Date.now();
  for (const t of REAL_TASK_ORDER) {
    if (canEvictTaskType(t, now)) {
      console.log(
        '[agent] workload_model_runtime: post-job idle eviction taskType=' + t,
      );
      unloadForTaskType(t);
    }
  }
}

/**
 * Best-effort pipeline timeout: rejects when `ms` elapses first; does not cancel underlying work.
 */
export function runWithLocalWorkloadTimeout<T>(taskType: string, fn: () => Promise<T>): Promise<T> {
  const ms = getLocalWorkloadExecutionTimeoutMs(taskType);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          taskType +
            ' execution timed out after ' +
            ms +
            'ms (pipeline-level guard; underlying Transformers.js inference may continue until its promise settles)',
        ),
      );
    }, ms);
  });
  return Promise.race([fn(), timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}
