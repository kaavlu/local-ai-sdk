/** SDK constructor options. */
export interface LocalAiSdkOptions {
  /**
   * Base URL of the local agent HTTP API (no trailing slash).
   * @default "http://127.0.0.1:8787"
   */
  baseUrl?: string;
}

/** Where a job may or prefers to run (Step 9). */
export type ExecutionPolicy = 'local_only' | 'cloud_allowed' | 'cloud_preferred';

/** How strict local readiness must be for this job (Step 9). */
export type LocalMode = 'interactive' | 'background' | 'conservative';

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
}

/** Job lifecycle states returned by the agent. */
export type JobState = 'queued' | 'running' | 'completed' | 'failed';

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
}

/** GET /jobs/:id/result response. */
export interface JobResultRecord {
  jobId: string;
  output: unknown;
  executor: string;
  completedAt: number;
}

/** POST /machine-state request body. */
export interface MachineStateInput {
  isSystemIdle: boolean;
  idleSeconds: number;
  isOnAcPower: boolean;
}

/** GET /debug/machine-state response. */
export type MachineStateDebugRecord =
  | { exists: false; message: string }
  | {
      exists: true;
      isSystemIdle: boolean;
      idleSeconds: number;
      isOnAcPower: boolean;
      updatedAt: number;
    };

/** GET /health response. */
export interface HealthResponse {
  ok: boolean;
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
  counts: { jobs: number; results: number };
  schema_version: string | null;
  device_profile_row: boolean;
  machine_state_row: boolean;
}

/** Options for {@link LocalAiSdk.waitForJobCompletion}. */
export interface WaitForJobCompletionOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}
