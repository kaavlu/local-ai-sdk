import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type RequestExecutionPath = 'local' | 'cloud' | 'unknown';
export type RequestExecutionStatus = 'success' | 'error';

export interface RequestExecutionRecordInput {
  projectId: string;
  apiKeyId?: string | null;
  endpoint: string;
  useCase?: string | null;
  logicalModel?: string | null;
  executionPath?: RequestExecutionPath | null;
  executionReason?: string | null;
  status: RequestExecutionStatus;
  httpStatus?: number | null;
  latencyMs?: number | null;
  inputCount?: number | null;
  errorType?: string | null;
  errorCode?: string | null;
  requestId?: string | null;
  upstreamModel?: string | null;
  localJobId?: string | null;
}

type RequestExecutionInsertRow = {
  project_id: string;
  api_key_id: string | null;
  endpoint: string;
  use_case: string | null;
  logical_model: string | null;
  execution_path: RequestExecutionPath | null;
  execution_reason: string | null;
  status: RequestExecutionStatus;
  http_status: number | null;
  latency_ms: number | null;
  input_count: number | null;
  error_type: string | null;
  error_code: string | null;
  request_id: string | null;
  upstream_model: string | null;
  local_job_id: string | null;
};

type TestRecorder = (record: RequestExecutionRecordInput) => Promise<void> | void;

let cachedSupabaseClient: SupabaseClient | null | undefined;
let testRecorder: TestRecorder | null = null;

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeExecutionPath(path: RequestExecutionPath | null | undefined): RequestExecutionPath | null {
  if (!path) {
    return null;
  }
  return path === 'local' || path === 'cloud' || path === 'unknown' ? path : null;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNullableNonNegativeNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value < 0 ? 0 : Math.round(value);
}

function getSupabaseClient(): SupabaseClient | null {
  if (cachedSupabaseClient !== undefined) {
    return cachedSupabaseClient;
  }

  const supabaseUrl =
    nonEmptyString(process.env.DYNO_SUPABASE_URL) ??
    nonEmptyString(process.env.SUPABASE_URL) ??
    nonEmptyString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey =
    nonEmptyString(process.env.DYNO_SUPABASE_SERVICE_ROLE_KEY) ??
    nonEmptyString(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    nonEmptyString(process.env.DYNO_DEMO_SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    cachedSupabaseClient = null;
    return cachedSupabaseClient;
  }

  cachedSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedSupabaseClient;
}

function toInsertRow(record: RequestExecutionRecordInput): RequestExecutionInsertRow {
  return {
    project_id: record.projectId,
    api_key_id: nonEmptyString(record.apiKeyId) ?? null,
    endpoint: record.endpoint,
    use_case: nonEmptyString(record.useCase) ?? null,
    logical_model: nonEmptyString(record.logicalModel) ?? null,
    execution_path: normalizeExecutionPath(record.executionPath),
    execution_reason: nonEmptyString(record.executionReason) ?? null,
    status: record.status,
    http_status: normalizeNullableNumber(record.httpStatus),
    latency_ms: normalizeNullableNonNegativeNumber(record.latencyMs),
    input_count: normalizeNullableNonNegativeNumber(record.inputCount),
    error_type: nonEmptyString(record.errorType) ?? null,
    error_code: nonEmptyString(record.errorCode) ?? null,
    request_id: nonEmptyString(record.requestId) ?? null,
    upstream_model: nonEmptyString(record.upstreamModel) ?? null,
    local_job_id: nonEmptyString(record.localJobId) ?? null,
  };
}

export function setRequestExecutionRecorderForTests(recorder: TestRecorder | null): void {
  testRecorder = recorder;
}

export async function recordRequestExecution(record: RequestExecutionRecordInput): Promise<void> {
  if (!nonEmptyString(record.projectId)) {
    return;
  }

  if (testRecorder) {
    await testRecorder(record);
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const row = toInsertRow(record);
  const { error } = await supabase.from('request_executions').insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

export async function recordRequestExecutionSafely(
  record: RequestExecutionRecordInput,
  context: string,
): Promise<void> {
  try {
    await recordRequestExecution(record);
  } catch (error) {
    console.error('[control-plane-api] failed to persist request execution', {
      context,
      requestId: record.requestId ?? null,
      projectId: record.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
