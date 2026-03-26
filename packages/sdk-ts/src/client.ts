import type {
  CreateJobRequest,
  CreateJobResponse,
  DatabaseDebugInfo,
  DeviceProfileRecord,
  HealthResponse,
  JobRecord,
  JobResultRecord,
  LocalAiSdkOptions,
  MachineStateDebugRecord,
  MachineStateInput,
  WaitForJobCompletionOptions,
} from './types.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

/** Thrown when the agent returns a non-2xx HTTP status. */
export class LocalAiSdkError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'LocalAiSdkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

export class LocalAiSdk {
  private readonly baseUrl: string;

  constructor(options?: LocalAiSdkOptions) {
    this.baseUrl = normalizeBaseUrl(options?.baseUrl ?? DEFAULT_BASE_URL);
  }

  async healthCheck(): Promise<HealthResponse> {
    return this.requestJson<HealthResponse>('GET', '/health');
  }

  async createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
    return this.requestJson<CreateJobResponse>('POST', '/jobs', request);
  }

  async getJob(jobId: string): Promise<JobRecord> {
    return this.requestJson<JobRecord>('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  async getJobResult(jobId: string): Promise<JobResultRecord> {
    return this.requestJson<JobResultRecord>(
      'GET',
      `/jobs/${encodeURIComponent(jobId)}/result`,
    );
  }

  async reportMachineState(input: MachineStateInput): Promise<{ ok: boolean; updatedAt: number }> {
    return this.requestJson<{ ok: boolean; updatedAt: number }>(
      'POST',
      '/machine-state',
      input,
    );
  }

  async getMachineState(): Promise<MachineStateDebugRecord> {
    return this.requestJson<MachineStateDebugRecord>('GET', '/debug/machine-state');
  }

  async getDeviceProfile(): Promise<DeviceProfileRecord> {
    return this.requestJson<DeviceProfileRecord>('GET', '/debug/profile');
  }

  async getDbDebugInfo(): Promise<DatabaseDebugInfo> {
    return this.requestJson<DatabaseDebugInfo>('GET', '/debug/db');
  }

  /**
   * Polls GET /jobs/:id until the job is `completed` or `failed`, or the timeout elapses.
   */
  async waitForJobCompletion(
    jobId: string,
    options?: WaitForJobCompletionOptions,
  ): Promise<JobRecord> {
    const pollIntervalMs = options?.pollIntervalMs ?? 300;
    const timeoutMs = options?.timeoutMs ?? 10000;
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `waitForJobCompletion timed out after ${timeoutMs}ms (jobId=${jobId})`,
        );
      }

      const job = await this.getJob(jobId);
      if (job.state === 'completed' || job.state === 'failed') {
        return job;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Local agent request failed (${method} ${path}): ${msg}`);
    }

    const text = await res.text();

    if (!res.ok) {
      const detail = text.length > 0 ? text : '(empty body)';
      throw new LocalAiSdkError(
        `Agent returned ${res.status} for ${method} ${path}: ${detail}`,
        res.status,
        text,
      );
    }

    if (text.length === 0) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Agent returned invalid JSON for ${method} ${path}: ${text.slice(0, 200)}`,
      );
    }
  }
}
