import type { OpenAiEmbeddingsRequest, OpenAiEmbeddingsResponse } from '../openai-types.js';
import type { ProjectContext } from '../project-context.js';

export class CloudEmbeddingError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'CloudEmbeddingError';
  }
}

export async function executeCloudEmbedding(
  context: ProjectContext,
  request: OpenAiEmbeddingsRequest,
): Promise<OpenAiEmbeddingsResponse> {
  const timeoutMs = Number(process.env.DYNO_UPSTREAM_TIMEOUT_MS || '20000');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${context.upstreamBaseUrl.replace(/\/+$/, '')}/v1/embeddings`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${context.upstreamApiKey}`,
      },
      body: JSON.stringify({
        input: request.input,
        model: context.upstreamModel,
        user: request.user,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new CloudEmbeddingError(
        `Upstream embeddings request failed with ${response.status}: ${text || '(empty body)'}`,
        502,
      );
    }
    try {
      return JSON.parse(text) as OpenAiEmbeddingsResponse;
    } catch {
      throw new CloudEmbeddingError('Upstream returned invalid JSON for embeddings', 502);
    }
  } catch (error) {
    if (error instanceof CloudEmbeddingError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CloudEmbeddingError(`Upstream embeddings request failed: ${message}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}
