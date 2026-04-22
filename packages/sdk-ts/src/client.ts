import type {
  CancelJobResponse,
  CreateJobRequest,
  CreateJobResponse,
  DatabaseDebugInfo,
  DebugMetricsResponse,
  DeviceProfileRecord,
  EmbedTextModelDebugRow,
  HealthResponse,
  JobRecord,
  JobResultRecord,
  DynoSdkOptions,
  MachineStateDebugRecord,
  MachineStateInput,
  ModelDebugInfo,
  ReadinessDebugResponse,
  WaitForJobCompletionOptions,
  WorkerDebugInfo,
} from './types.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

/** Thrown when the agent returns a non-2xx HTTP status. */
export class DynoSdkError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'DynoSdkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

export class DynoSdk {
  private readonly baseUrl: string;
  private readonly projectId?: string;

  constructor(options?: DynoSdkOptions) {
    this.baseUrl = normalizeBaseUrl(options?.baseUrl ?? DEFAULT_BASE_URL);
    const normalizedProjectId = options?.projectId?.trim();
    this.projectId = normalizedProjectId ? normalizedProjectId : undefined;
  }

  async healthCheck(): Promise<HealthResponse> {
    return this.requestJson<HealthResponse>('GET', '/health');
  }

  /** `GET /debug/readiness` — machine readiness gates used by SDK preflight probes. */
  async getReadinessDebug(): Promise<ReadinessDebugResponse> {
    return this.requestJson<ReadinessDebugResponse>('GET', '/debug/readiness');
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

  /** POST /jobs/:id/cancel — throws {@link DynoSdkError} with 409 if the job is running. */
  async cancelJob(jobId: string): Promise<CancelJobResponse> {
    return this.requestJson<CancelJobResponse>(
      'POST',
      `/jobs/${encodeURIComponent(jobId)}/cancel`,
    );
  }

  async pauseWorker(): Promise<{ ok: boolean; isPaused: boolean }> {
    return this.requestJson<{ ok: boolean; isPaused: boolean }>('POST', '/worker/pause');
  }

  async resumeWorker(): Promise<{ ok: boolean; isPaused: boolean }> {
    return this.requestJson<{ ok: boolean; isPaused: boolean }>('POST', '/worker/resume');
  }

  async getWorkerDebugInfo(): Promise<WorkerDebugInfo> {
    return this.requestJson<WorkerDebugInfo>('GET', '/debug/worker');
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

  /** `GET /debug/metrics` — job aggregates, timing averages, retries, worker/model snapshot (Step 14). */
  async getDebugMetrics(): Promise<DebugMetricsResponse> {
    return this.requestJson<DebugMetricsResponse>('GET', '/debug/metrics');
  }

  /** `GET /debug/models` — in-process model lifecycle (embed + classify). */
  async getModelDebugInfo(): Promise<ModelDebugInfo> {
    return this.requestJson<ModelDebugInfo>('GET', '/debug/models');
  }

  /**
   * `POST /models/embed-text/warmup` — load the embed_text model ahead of jobs.
   * Throws {@link DynoSdkError} with status 503 if warmup completes in a failed state.
   */
  async warmupEmbedTextModel(): Promise<EmbedTextModelDebugRow> {
    const body = await this.requestJson<{ embed_text: EmbedTextModelDebugRow }>(
      'POST',
      '/models/embed-text/warmup',
    );
    return body.embed_text;
  }

  /**
   * `POST /models/classify-text/warmup` — load the classify_text model ahead of jobs.
   * Throws {@link DynoSdkError} with status 503 if warmup completes in a failed state.
   */
  async warmupClassifyTextModel(): Promise<EmbedTextModelDebugRow> {
    const body = await this.requestJson<{ classify_text: EmbedTextModelDebugRow }>(
      'POST',
      '/models/classify-text/warmup',
    );
    return body.classify_text;
  }

  /**
   * `POST /models/generate-text/warmup` — load the generate_text model ahead of jobs.
   * Throws {@link DynoSdkError} with status 503 if warmup completes in a failed state.
   */
  async warmupGenerateTextModel(): Promise<EmbedTextModelDebugRow> {
    const body = await this.requestJson<{ generate_text: EmbedTextModelDebugRow }>(
      'POST',
      '/models/generate-text/warmup',
    );
    return body.generate_text;
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
      if (
        job.state === 'completed' ||
        job.state === 'failed' ||
        job.state === 'cancelled'
      ) {
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
    if (this.projectId) {
      headers['X-Project-Id'] = this.projectId;
    }
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
      throw new Error(`Dyno agent request failed (${method} ${path}): ${msg}`);
    }

    const text = await res.text();

    if (!res.ok) {
      const detail = text.length > 0 ? text : '(empty body)';
      throw new DynoSdkError(
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
