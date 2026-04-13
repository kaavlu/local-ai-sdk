import type { LocalMode } from '../project-context.js';

interface AgentCreateJobResponse {
  id: string;
  state: string;
}

interface AgentJobResponse {
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

interface AgentJobResultResponse {
  output?: {
    embedding?: number[];
  };
}

export interface ProbeLocalReadinessResult {
  agentReachable: boolean;
  localReady: boolean;
}

export class LocalEmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalEmbeddingError';
  }
}

function normalizeAgentBaseUrl(): string {
  const base = process.env.DYNO_AGENT_BASE_URL?.trim() || 'http://127.0.0.1:8787';
  return base.replace(/\/+$/, '');
}

export async function probeLocalReadiness(localMode: LocalMode): Promise<ProbeLocalReadinessResult> {
  const baseUrl = normalizeAgentBaseUrl();
  try {
    const health = await fetch(`${baseUrl}/health`, { method: 'GET' });
    if (!health.ok) {
      return { agentReachable: false, localReady: false };
    }
  } catch {
    return { agentReachable: false, localReady: false };
  }

  try {
    const readiness = await fetch(`${baseUrl}/debug/readiness`, { method: 'GET' });
    if (!readiness.ok) {
      return { agentReachable: true, localReady: false };
    }
    const body = (await readiness.json()) as Record<string, unknown>;
    if (localMode === 'background') {
      return { agentReachable: true, localReady: body.backgroundLocalReady === true };
    }
    return { agentReachable: true, localReady: body.interactiveLocalReady === true };
  } catch {
    return { agentReachable: true, localReady: false };
  }
}

async function waitForJobCompletion(baseUrl: string, jobId: string): Promise<void> {
  const timeoutMs = Number(process.env.DYNO_LOCAL_JOB_TIMEOUT_MS || '20000');
  const pollIntervalMs = Number(process.env.DYNO_LOCAL_JOB_POLL_MS || '250');
  const start = Date.now();
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new LocalEmbeddingError(`Local embedding job timed out for id=${jobId}`);
    }
    const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
    if (!response.ok) {
      throw new LocalEmbeddingError(`Agent returned ${response.status} while polling local job`);
    }
    const body = (await response.json()) as AgentJobResponse;
    if (body.state === 'completed') {
      return;
    }
    if (body.state === 'failed' || body.state === 'cancelled') {
      throw new LocalEmbeddingError(`Local embedding job ended in state "${body.state}"`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

async function runSingleLocalEmbedding(text: string): Promise<number[]> {
  const baseUrl = normalizeAgentBaseUrl();
  const createResponse = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      taskType: 'embed_text',
      payload: { text },
      executionPolicy: 'local_only',
      localMode: 'interactive',
    }),
  });
  if (!createResponse.ok) {
    throw new LocalEmbeddingError(`Agent returned ${createResponse.status} for POST /jobs`);
  }
  const createBody = (await createResponse.json()) as AgentCreateJobResponse;
  if (!createBody.id) {
    throw new LocalEmbeddingError('Agent did not return a job id for local embedding request');
  }
  await waitForJobCompletion(baseUrl, createBody.id);
  const resultResponse = await fetch(`${baseUrl}/jobs/${encodeURIComponent(createBody.id)}/result`, {
    method: 'GET',
  });
  if (!resultResponse.ok) {
    throw new LocalEmbeddingError(
      `Agent returned ${resultResponse.status} for GET /jobs/${createBody.id}/result`,
    );
  }
  const resultBody = (await resultResponse.json()) as AgentJobResultResponse;
  const embedding = resultBody.output?.embedding;
  if (!Array.isArray(embedding) || embedding.some((item) => typeof item !== 'number')) {
    throw new LocalEmbeddingError('Local embedding result shape is invalid');
  }
  return embedding;
}

export async function executeLocalEmbedding(inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const input of inputs) {
    vectors.push(await runSingleLocalEmbedding(input));
  }
  return vectors;
}
