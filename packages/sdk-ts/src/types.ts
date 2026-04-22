/** SDK constructor options. */
export interface DynoSdkOptions {
  /**
   * Base URL of the Dyno agent HTTP API (no trailing slash).
   * Advanced override for custom runtime wiring; typical app integrations should
   * rely on `Dyno.init()` managed lifecycle and internal endpoint resolution.
   * @default "http://127.0.0.1:8787"
   */
  baseUrl?: string;
  /**
   * Optional project identifier forwarded with SDK requests.
   * This is a lightweight context hint for future project-scoped routing.
   */
  projectId?: string;
}

/** Where a job may or prefers to run (Step 9). */
export type ExecutionPolicy = 'local_only' | 'cloud_allowed' | 'cloud_preferred';

/** How strict local readiness must be for this job (Step 9). */
export type LocalMode = 'interactive' | 'background' | 'conservative';

/** Payload for `taskType: "embed_text"` (Step 10). */
export interface EmbedTextPayload {
  text: string;
}

/** Payload for `taskType: "generate_text"` (Phase 4). */
export interface GenerateTextPayload {
  text: string;
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
}

/** Persisted local output for `taskType: "generate_text"` jobs. */
export interface GenerateTextOutput {
  message: string;
  taskType: 'generate_text';
  executor: 'local_real';
  model: string;
  output: string;
  usage?: {
    promptChars?: number;
    completionChars?: number;
    totalChars?: number;
  };
  parameters?: {
    maxNewTokens?: number;
    temperature?: number;
    topP?: number;
  };
}

/** Payload for `taskType: "classify_text"` (Step 17). */
export interface ClassifyTextPayload {
  text: string;
}

/**
 * POST /jobs request body.
 * Provide either legacy `policy` or both `executionPolicy` and `localMode` (preferred when set).
 */
export interface CreateJobRequest {
  taskType: string;
  payload: unknown;
  /**
   * Legacy scheduling hint; mapped server-side to `executionPolicy` + `localMode` when the new fields are omitted.
   * @see README for mapping (`local`, `local_preferred`, `cloud`).
   */
  policy?: string;
  executionPolicy?: ExecutionPolicy;
  localMode?: LocalMode;
}

/** POST /jobs success body (201). */
export interface CreateJobResponse {
  id: string;
  state: JobState;
  taskType: string;
  policy: string;
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  attemptCount: number;
  lastError: string | null;
}

/** Job lifecycle states returned by the agent. */
export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** GET /jobs/:id response. */
export interface JobRecord {
  id: string;
  taskType: string;
  payload: unknown;
  policy: string;
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
  state: JobState;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  attemptCount: number;
  lastError: string | null;
}

/** GET /jobs/:id/result response. */
export interface JobResultRecord {
  jobId: string;
  output: unknown;
  executor: string;
  completedAt: number;
}

/** POST /jobs/:id/cancel success (200). */
export interface CancelJobResponse {
  ok: true;
  id: string;
  state: JobState;
  outcome: 'cancelled' | 'already_terminal';
}

/** GET /debug/worker response. */
export interface WorkerDebugInfo {
  isPaused: boolean;
  jobInFlight: boolean;
  currentRunningJobId: string | null;
  pollIntervalMs: number;
}

/** POST /machine-state request body (Step 15 optional signals). Omitted keys keep prior agent values. */
export interface MachineStateInput {
  isSystemIdle: boolean;
  idleSeconds: number;
  isOnAcPower: boolean;
  cpuUtilizationPercent?: number | null;
  memoryAvailableMb?: number | null;
  memoryUsedPercent?: number | null;
  gpuUtilizationPercent?: number | null;
  gpuMemoryFreeMb?: number | null;
  gpuMemoryUsedMb?: number | null;
  batteryPercent?: number | null;
  thermalState?: string | null;
}

/** GET /debug/machine-state response. */
export type MachineStateDebugRecord =
  | { exists: false; message: string }
  | {
      exists: true;
      isSystemIdle: boolean;
      idleSeconds: number;
      isOnAcPower: boolean;
      cpuUtilizationPercent: number | null;
      memoryAvailableMb: number | null;
      memoryUsedPercent: number | null;
      gpuUtilizationPercent: number | null;
      gpuMemoryFreeMb: number | null;
      gpuMemoryUsedMb: number | null;
      batteryPercent: number | null;
      thermalState: string | null;
      updatedAt: number;
    };

/** GET /health response. */
export type RuntimeLifecycleState =
  | 'unreachable'
  | 'healthy_unready'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timed_out';

export interface RuntimeCapabilities {
  readinessDebugV1?: boolean;
  readinessDetailsV1?: boolean;
}

export interface RuntimeContractInfo {
  agentVersion?: string;
  contractVersion?: string;
  lifecycleStates?: RuntimeLifecycleState[];
  capabilities?: RuntimeCapabilities;
}

export interface HealthResponse {
  ok: boolean;
  runtime?: RuntimeContractInfo;
}

/** GET /debug/readiness response (fields used by SDK preflight guardrails). */
export interface ReadinessDebugResponse {
  ok: boolean;
  interactiveLocalReady: boolean;
  backgroundLocalReady: boolean;
  conservativeLocalReady: boolean;
  readinessBypass?: boolean;
  readiness?: {
    modes?: Partial<
      Record<
        LocalMode,
        {
          isReady?: boolean;
          localMode?: string;
          blockingReasons?: string[];
          warnings?: string[];
        }
      >
    >;
  };
}

export type RuntimeManagerState =
  | 'idle'
  | 'starting'
  | 'healthy'
  | 'ready'
  | 'degraded'
  | 'unavailable';

export interface RuntimeManagerStatus {
  state: RuntimeManagerState;
  lastError: string | null;
  lastCheckedAt: number | null;
  startedAt: number | null;
  healthy: boolean;
  ready: boolean;
}

export interface RuntimeManagerStartOptions {
  timeoutMs?: number;
}

export interface RuntimeManagerWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface RuntimeManagerReadyOptions extends RuntimeManagerWaitOptions {
  /**
   * If true, keeps polling readiness until mode is ready or timeout.
   * If false, a single readiness probe is attempted.
   * @default true
   */
  waitForReady?: boolean;
}

export interface RuntimeManager {
  ensureStarted(options?: RuntimeManagerStartOptions): Promise<void>;
  waitUntilHealthy(options?: RuntimeManagerWaitOptions): Promise<HealthResponse>;
  waitUntilReady(
    localMode: LocalMode,
    options?: RuntimeManagerReadyOptions,
  ): Promise<ReadinessDebugResponse | null>;
  getStatus(): RuntimeManagerStatus;
}

/** GET /debug/profile row (same shape as agent `device_profile`). */
export interface DeviceProfileRecord {
  id: 1;
  os: string;
  arch: string;
  cpu_count: number;
  ram_total_mb: number;
  ram_free_mb: number;
  disk_free_mb: number;
  updated_at: number;
}

/** GET /debug/db response. */
export interface DatabaseDebugInfo {
  path: string;
  tables: string[];
  counts: { jobs: number; results: number; runningJobs: number };
  schema_version: string | null;
  device_profile_row: boolean;
  machine_state_row: boolean;
}

/** Options for {@link DynoSdk.waitForJobCompletion}. */
export interface WaitForJobCompletionOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/** In-process embed_text model lifecycle (Step 11). */
export type EmbedTextModelState = 'not_loaded' | 'loading' | 'ready' | 'failed';

/** One row under `GET /debug/models` and `embed_text` in warmup responses. */
export interface EmbedTextModelDebugRow {
  state: EmbedTextModelState;
  loadedAt: number | null;
  /** Step 19: last warmup or pipeline use (ms epoch), null when not loaded. */
  lastUsedAt: number | null;
  lastError: string | null;
}

/** Step 19: effective workload model runtime controls (echoed on `GET /debug/models`). */
export interface WorkloadModelRuntimeDebugInfo {
  idleEvictAfterMs: number;
  maxResidentWorkloadModels: number;
  defaultExecutionTimeoutMs: number;
  perWorkloadExecutionTimeoutMs: Record<string, number>;
}

/** `GET /debug/models` response. */
export interface ModelDebugInfo {
  workloadModelRuntime: WorkloadModelRuntimeDebugInfo;
  embed_text: EmbedTextModelDebugRow;
  classify_text: EmbedTextModelDebugRow;
  generate_text: EmbedTextModelDebugRow;
}

/** Per-status counts (Step 14 metrics). */
export interface MetricsJobStatusCounts {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/** `GET /debug/metrics` response. */
export interface DebugMetricsResponse {
  ok: true;
  metrics: {
    jobs: MetricsJobStatusCounts;
    jobTypes: Record<string, MetricsJobStatusCounts>;
    timingMs: {
      avgQueueMs: number;
      avgRunMs: number;
      avgEndToEndMs: number;
    };
    retries: {
      jobsRetried: number;
      totalAttempts: number;
      maxAttemptsConfigured: number;
    };
    worker: {
      isPaused: boolean;
      currentRunningJobId: string | null;
      jobInFlight: boolean;
    };
    models: {
      embedText: {
        modelId: string;
        state: EmbedTextModelState;
        loadedAt: number | null;
        lastUsedAt: number | null;
      };
      classifyText: {
        modelId: string;
        state: EmbedTextModelState;
        loadedAt: number | null;
        lastUsedAt: number | null;
      };
    };
  };
}
