import type { OpenAiChatCompletionsRequest, OpenAiChatCompletionResponse } from '../openai-types.js';
import type { ProjectContext } from '../project-context.js';

export class CloudChatError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'CloudChatError';
  }
}

export async function executeCloudChatCompletion(
  context: ProjectContext,
  request: OpenAiChatCompletionsRequest,
): Promise<OpenAiChatCompletionResponse> {
  const timeoutMs = Number(process.env.DYNO_UPSTREAM_TIMEOUT_MS || '20000');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${context.upstreamBaseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${context.upstreamApiKey}`,
      },
      body: JSON.stringify({
        ...request,
        model: context.upstreamModel,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new CloudChatError(`Upstream chat/completions request failed with ${response.status}: ${text || '(empty body)'}`, 502);
    }
    try {
      return JSON.parse(text) as OpenAiChatCompletionResponse;
    } catch {
      throw new CloudChatError('Upstream returned invalid JSON for chat/completions', 502);
    }
  } catch (error) {
    if (error instanceof CloudChatError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CloudChatError(`Upstream chat/completions request failed: ${message}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}
