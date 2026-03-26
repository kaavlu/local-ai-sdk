import { randomUUID } from 'node:crypto';
import type { Database, SqlValue } from 'sql.js';
import { persistDatabaseToDisk } from '../db/persist.js';

/** Persisted job lifecycle values (subset used in this step). */
export type JobState = 'queued' | 'running' | 'completed' | 'failed';

export interface CreateJobRequest {
  taskType: string;
  payload: unknown;
  policy: string;
}

export interface JobRecord {
  id: string;
  taskType: string;
  payload: unknown;
  policy: string;
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

/**
 * Validates POST /jobs body: taskType and policy non-empty strings; payload present and JSON-serializable.
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

  const policy = o.policy;
  if (typeof policy !== 'string' || policy.trim() === '') {
    return { ok: false, message: 'policy must be a non-empty string' };
  }

  if (!Object.prototype.hasOwnProperty.call(o, 'payload')) {
    return { ok: false, message: 'payload is required' };
  }

  const payload = o.payload;
  try {
    JSON.stringify(payload);
  } catch {
    return { ok: false, message: 'payload must be JSON-serializable' };
  }

  return { ok: true, value: { taskType, policy, payload } };
}

const INSERT_JOB = `
INSERT INTO jobs (id, task_type, payload_json, policy, state, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Inserts a job with state `queued` and flushes the database file.
 */
export function createJob(db: Database, dbPath: string, input: CreateJobRequest): JobRecord {
  const id = generateJobId();
  const now = Date.now();
  const payloadJson = JSON.stringify(input.payload);

  db.run(INSERT_JOB, [
    id,
    input.taskType,
    payloadJson,
    input.policy,
    'queued',
    now,
    now,
  ]);

  persistDatabaseToDisk(db, dbPath);

  return {
    id,
    taskType: input.taskType,
    payload: input.payload,
    policy: input.policy,
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

function rowToJobRecord(row: Record<string, SqlValue>): JobRecord | null {
  const id = row.id != null ? String(row.id) : '';
  const task_type = row.task_type != null ? String(row.task_type) : '';
  const payloadRaw = row.payload_json;
  const policy = row.policy != null ? String(row.policy) : '';
  const stateRaw = row.state != null ? String(row.state) : 'queued';
  const created_at = row.created_at;
  const updated_at = row.updated_at;

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

  return {
    id,
    taskType: task_type,
    payload,
    policy,
    state: parseJobState(stateRaw),
    createdAt:
      typeof created_at === 'number' ? created_at : Number(created_at),
    updatedAt:
      typeof updated_at === 'number' ? updated_at : Number(updated_at),
  };
}

const NEXT_QUEUED = `
SELECT id, task_type, payload_json, policy, state, created_at, updated_at
FROM jobs
WHERE state = 'queued'
ORDER BY created_at ASC
LIMIT 1
`;

/**
 * Returns the oldest queued job, or null if none.
 */
export function getNextQueuedJob(db: Database): JobRecord | null {
  const stmt = db.prepare(NEXT_QUEUED);
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
 * Loads a job by primary key, or null if missing.
 */
export function getJobById(db: Database, id: string): JobRecord | null {
  const stmt = db.prepare(
    `SELECT id, task_type, payload_json, policy, state, created_at, updated_at
     FROM jobs WHERE id = ?`,
  );
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
