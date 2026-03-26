import { randomUUID } from 'node:crypto';
import type { Database, SqlValue } from 'sql.js';
import type { ExecutionPolicy, LocalMode } from '../policy/index.js';
import { persistDatabaseToDisk } from '../db/persist.js';

/** Persisted job lifecycle values (subset used in this step). */
export type JobState = 'queued' | 'running' | 'completed' | 'failed';

export type { ExecutionPolicy, LocalMode };

const EXECUTION_POLICIES = new Set<ExecutionPolicy>([
  'local_only',
  'cloud_allowed',
  'cloud_preferred',
]);

const LOCAL_MODES = new Set<LocalMode>(['interactive', 'background', 'conservative']);

export interface CreateJobRequest {
  taskType: string;
  payload: unknown;
  /** Legacy field; mapped to executionPolicy + localMode when new fields are absent. */
  policy?: string;
  executionPolicy?: ExecutionPolicy;
  localMode?: LocalMode;
}

export interface JobRecord {
  id: string;
  taskType: string;
  payload: unknown;
  /** Legacy column; kept for backward compatibility. */
  policy: string;
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
  state: JobState;
  createdAt: number;
  updatedAt: number;
}

export interface JobResultRecord {
  jobId: string;
  output: unknown;
  executor: string;
  completedAt: number;
}

export function generateJobId(): string {
  return randomUUID();
}

function parseJobState(raw: string): JobState {
  if (
    raw === 'queued' ||
    raw === 'running' ||
    raw === 'completed' ||
    raw === 'failed'
  ) {
    return raw;
  }
  return 'queued';
}

function isExecutionPolicy(s: string): s is ExecutionPolicy {
  return EXECUTION_POLICIES.has(s as ExecutionPolicy);
}

function isLocalMode(s: string): s is LocalMode {
  return LOCAL_MODES.has(s as LocalMode);
}

/**
 * Legacy `policy` string → execution model (Step 9 backward compatibility).
 */
export function mapLegacyPolicyToExecution(
  policy: string,
): { executionPolicy: ExecutionPolicy; localMode: LocalMode } {
  switch (policy) {
    case 'local':
      return { executionPolicy: 'local_only', localMode: 'interactive' };
    case 'local_preferred':
      return { executionPolicy: 'cloud_allowed', localMode: 'background' };
    case 'cloud':
      return { executionPolicy: 'cloud_preferred', localMode: 'interactive' };
    default:
      return { executionPolicy: 'local_only', localMode: 'interactive' };
  }
}

/** Best-effort legacy `policy` column when persisting from the new model only. */
export function legacyPolicyColumnFromExecution(executionPolicy: ExecutionPolicy): string {
  switch (executionPolicy) {
    case 'local_only':
      return 'local';
    case 'cloud_allowed':
      return 'local_preferred';
    case 'cloud_preferred':
      return 'cloud';
    default:
      return 'local';
  }
}

function normalizeCreateJobInput(body: Record<string, unknown>): CreateJobRequest | null {
  const taskType = body.taskType;
  if (typeof taskType !== 'string' || taskType.trim() === '') {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'payload')) {
    return null;
  }

  const payload = body.payload;
  try {
    JSON.stringify(payload);
  } catch {
    return null;
  }

  const ep = body.executionPolicy;
  const lm = body.localMode;
  const hasEp = typeof ep === 'string' && ep.trim() !== '';
  const hasLm = typeof lm === 'string' && lm.trim() !== '';

  if (hasEp !== hasLm) {
    return null;
  }

  if (hasEp && hasLm) {
    if (!isExecutionPolicy(ep) || !isLocalMode(lm)) {
      return null;
    }
    const policyField = body.policy;
    const legacyPolicy =
      typeof policyField === 'string' && policyField.trim() !== ''
        ? policyField
        : legacyPolicyColumnFromExecution(ep);
    return {
      taskType,
      payload,
      executionPolicy: ep,
      localMode: lm,
      policy: legacyPolicy,
    };
  }

  const policy = body.policy;
  if (typeof policy !== 'string' || policy.trim() === '') {
    return null;
  }

  return { taskType, payload, policy };
}

/**
 * Validates POST /jobs body: taskType + JSON-serializable payload; either legacy `policy`
 * or valid `executionPolicy` + `localMode` (preferred when both present).
 */
export function validateCreateJobRequest(
  body: unknown,
): { ok: true; value: CreateJobRequest } | { ok: false; message: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'body must be a JSON object' };
  }

  const o = body as Record<string, unknown>;

  const taskType = o.taskType;
  if (typeof taskType !== 'string' || taskType.trim() === '') {
    return { ok: false, message: 'taskType must be a non-empty string' };
  }

  if (!Object.prototype.hasOwnProperty.call(o, 'payload')) {
    return { ok: false, message: 'payload is required' };
  }

  try {
    JSON.stringify(o.payload);
  } catch {
    return { ok: false, message: 'payload must be JSON-serializable' };
  }

  const ep = o.executionPolicy;
  const lm = o.localMode;
  const hasEp = typeof ep === 'string' && ep.trim() !== '';
  const hasLm = typeof lm === 'string' && lm.trim() !== '';

  if (hasEp !== hasLm) {
    return {
      ok: false,
      message: 'executionPolicy and localMode must both be provided together',
    };
  }

  if (hasEp && hasLm) {
    if (!isExecutionPolicy(ep)) {
      return {
        ok: false,
        message: 'executionPolicy must be local_only, cloud_allowed, or cloud_preferred',
      };
    }
    if (!isLocalMode(lm)) {
      return {
        ok: false,
        message: 'localMode must be interactive, background, or conservative',
      };
    }
  }

  const normalized = normalizeCreateJobInput(o);
  if (!normalized) {
    return {
      ok: false,
      message:
        'provide policy (legacy) or executionPolicy + localMode; taskType and payload are required',
    };
  }

  return { ok: true, value: normalized };
}

function resolvedExecutionFields(input: CreateJobRequest): {
  policyColumn: string;
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
} {
  if (input.executionPolicy !== undefined && input.localMode !== undefined) {
    return {
      policyColumn: input.policy ?? legacyPolicyColumnFromExecution(input.executionPolicy),
      executionPolicy: input.executionPolicy,
      localMode: input.localMode,
    };
  }
  const legacy = input.policy ?? 'local';
  const mapped = mapLegacyPolicyToExecution(legacy);
  return {
    policyColumn: legacy,
    executionPolicy: mapped.executionPolicy,
    localMode: mapped.localMode,
  };
}

const INSERT_JOB = `
INSERT INTO jobs (id, task_type, payload_json, policy, execution_policy, local_mode, state, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Inserts a job with state `queued` and flushes the database file.
 */
export function createJob(db: Database, dbPath: string, input: CreateJobRequest): JobRecord {
  const { policyColumn, executionPolicy, localMode } = resolvedExecutionFields(input);
  const id = generateJobId();
  const now = Date.now();
  const payloadJson = JSON.stringify(input.payload);

  db.run(INSERT_JOB, [
    id,
    input.taskType,
    payloadJson,
    policyColumn,
    executionPolicy,
    localMode,
    'queued',
    now,
    now,
  ]);

  persistDatabaseToDisk(db, dbPath);

  return {
    id,
    taskType: input.taskType,
    payload: input.payload,
    policy: policyColumn,
    executionPolicy,
    localMode,
    state: 'queued',
    createdAt: now,
    updatedAt: now,
  };
}

const UPDATE_JOB_STATE = `
UPDATE jobs SET state = ?, updated_at = ? WHERE id = ?
`;

/**
 * Sets job state to `running` and persists.
 */
export function markJobRunning(db: Database, dbPath: string, jobId: string): void {
  const now = Date.now();
  db.run(UPDATE_JOB_STATE, ['running', now, jobId]);
  persistDatabaseToDisk(db, dbPath);
}

const INSERT_RESULT = `
INSERT INTO results (job_id, output_json, executor, completed_at)
VALUES (?, ?, ?, ?)
`;

/**
 * Inserts a `results` row and persists.
 */
export function saveJobResult(
  db: Database,
  dbPath: string,
  jobId: string,
  output: unknown,
  executor: string,
): void {
  const completedAt = Date.now();
  const outputJson = JSON.stringify(output);
  db.run(INSERT_RESULT, [jobId, outputJson, executor, completedAt]);
  persistDatabaseToDisk(db, dbPath);
}

/**
 * Sets job state to `completed` and persists.
 */
export function completeJob(db: Database, dbPath: string, jobId: string): void {
  const now = Date.now();
  db.run(UPDATE_JOB_STATE, ['completed', now, jobId]);
  persistDatabaseToDisk(db, dbPath);
}

/**
 * Sets job state to `failed` and persists (no `results` row).
 */
export function failJob(db: Database, dbPath: string, jobId: string): void {
  const now = Date.now();
  db.run(UPDATE_JOB_STATE, ['failed', now, jobId]);
  persistDatabaseToDisk(db, dbPath);
}

function parseExecutionPolicy(raw: string | null | undefined): ExecutionPolicy | null {
  if (raw == null || raw === '') {
    return null;
  }
  return isExecutionPolicy(String(raw)) ? (String(raw) as ExecutionPolicy) : null;
}

function parseLocalMode(raw: string | null | undefined): LocalMode | null {
  if (raw == null || raw === '') {
    return null;
  }
  return isLocalMode(String(raw)) ? (String(raw) as LocalMode) : null;
}

function rowToJobRecord(row: Record<string, SqlValue>): JobRecord | null {
  const id = row.id != null ? String(row.id) : '';
  const task_type = row.task_type != null ? String(row.task_type) : '';
  const payloadRaw = row.payload_json;
  const policy = row.policy != null ? String(row.policy) : '';
  const stateRaw = row.state != null ? String(row.state) : 'queued';
  const created_at = row.created_at;
  const updated_at = row.updated_at;

  let executionPolicy = parseExecutionPolicy(
    row.execution_policy != null ? String(row.execution_policy) : null,
  );
  let localMode = parseLocalMode(row.local_mode != null ? String(row.local_mode) : null);

  if (!id) {
    return null;
  }

  let payload: unknown;
  try {
    payload =
      typeof payloadRaw === 'string' && payloadRaw.length > 0
        ? JSON.parse(payloadRaw)
        : JSON.parse(String(payloadRaw ?? 'null'));
  } catch {
    payload = null;
  }

  if (executionPolicy === null || localMode === null) {
    const mapped = mapLegacyPolicyToExecution(policy || 'local');
    if (executionPolicy === null) {
      executionPolicy = mapped.executionPolicy;
    }
    if (localMode === null) {
      localMode = mapped.localMode;
    }
  }

  return {
    id,
    taskType: task_type,
    payload,
    policy,
    executionPolicy,
    localMode,
    state: parseJobState(stateRaw),
    createdAt:
      typeof created_at === 'number' ? created_at : Number(created_at),
    updatedAt:
      typeof updated_at === 'number' ? updated_at : Number(updated_at),
  };
}

const JOB_SELECT_COLUMNS =
  'id, task_type, payload_json, policy, execution_policy, local_mode, state, created_at, updated_at';

const QUEUED_ORDERED = `SELECT ${JOB_SELECT_COLUMNS} FROM jobs WHERE state = 'queued' ORDER BY created_at ASC`;

/**
 * Lists queued jobs oldest first (for policy-aware scanning without head-of-line blocking).
 */
export function listQueuedJobsOrdered(db: Database): JobRecord[] {
  const stmt = db.prepare(QUEUED_ORDERED);
  const out: JobRecord[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, SqlValue>;
    const rec = rowToJobRecord(row);
    if (rec) {
      out.push(rec);
    }
  }
  stmt.free();
  return out;
}

/**
 * Loads a job by primary key, or null if missing.
 */
export function getJobById(db: Database, id: string): JobRecord | null {
  const stmt = db.prepare(`SELECT ${JOB_SELECT_COLUMNS} FROM jobs WHERE id = ?`);
  stmt.bind([id]);
  const hasRow = stmt.step();
  if (!hasRow) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, SqlValue>;
  stmt.free();
  return rowToJobRecord(row);
}

/**
 * Loads a result row for a job, or null if none.
 */
export function getJobResult(db: Database, jobId: string): JobResultRecord | null {
  const stmt = db.prepare(
    `SELECT job_id, output_json, executor, completed_at FROM results WHERE job_id = ?`,
  );
  stmt.bind([jobId]);
  const hasRow = stmt.step();
  if (!hasRow) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, SqlValue>;
  stmt.free();

  const jid = row.job_id != null ? String(row.job_id) : '';
  const outputRaw = row.output_json;
  const executor = row.executor != null ? String(row.executor) : '';
  const completed_at = row.completed_at;

  let output: unknown;
  try {
    output =
      typeof outputRaw === 'string'
        ? JSON.parse(outputRaw)
        : JSON.parse(String(outputRaw ?? 'null'));
  } catch {
    output = null;
  }

  return {
    jobId: jid,
    output,
    executor,
    completedAt:
      typeof completed_at === 'number'
        ? completed_at
        : Number(completed_at),
  };
}

/** JSON shape for POST /jobs success response. */
export function jobCreatedResponse(job: JobRecord): Record<string, unknown> {
  return {
    id: job.id,
    state: job.state,
    taskType: job.taskType,
    policy: job.policy,
    executionPolicy: job.executionPolicy,
    localMode: job.localMode,
    createdAt: job.createdAt,
  };
}

/** JSON shape for GET /jobs/:id. */
export function jobToJson(job: JobRecord): Record<string, unknown> {
  return {
    id: job.id,
    taskType: job.taskType,
    payload: job.payload,
    policy: job.policy,
    executionPolicy: job.executionPolicy,
    localMode: job.localMode,
    state: job.state,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/** JSON shape for GET /jobs/:id/result. */
export function jobResultToJson(r: JobResultRecord): Record<string, unknown> {
  return {
    jobId: r.jobId,
    output: r.output,
    executor: r.executor,
    completedAt: r.completedAt,
  };
}
