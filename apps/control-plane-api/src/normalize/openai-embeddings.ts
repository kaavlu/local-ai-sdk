import type { OpenAiEmbeddingsResponse } from '../openai-types.js';

function approximateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function normalizeLocalEmbeddingResponse(input: {
  requestModel: string;
  inputs: string[];
  vectors: number[][];
}): OpenAiEmbeddingsResponse {
  const data = input.vectors.map((embedding, index) => ({
    object: 'embedding' as const,
    embedding,
    index,
  }));
  const promptTokens = input.inputs.reduce((sum, text) => sum + approximateTokenCount(text), 0);
  return {
    object: 'list',
    data,
    model: input.requestModel,
    // Local executor does not expose token accounting yet; use a deterministic approximation.
    usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
  };
}

export function normalizeCloudEmbeddingResponse(input: {
  requestModel: string;
  response: OpenAiEmbeddingsResponse;
}): OpenAiEmbeddingsResponse {
  const data = Array.isArray(input.response.data)
    ? input.response.data.map((item, index) => ({
        object: 'embedding' as const,
        embedding: Array.isArray(item.embedding) ? item.embedding : [],
        index: typeof item.index === 'number' ? item.index : index,
      }))
    : [];
  const usage = input.response.usage ?? { prompt_tokens: 0, total_tokens: 0 };
  return {
    object: 'list',
    data,
    model: input.requestModel,
    usage,
  };
}
