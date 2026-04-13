export type OpenAiEmbeddingsInput = string | string[];

export interface OpenAiEmbeddingsRequest {
  input: OpenAiEmbeddingsInput;
  model: string;
  user?: string;
}

export interface OpenAiEmbeddingDataItem {
  object: 'embedding';
  embedding: number[];
  index: number;
}

export interface OpenAiUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface OpenAiEmbeddingsResponse {
  object: 'list';
  data: OpenAiEmbeddingDataItem[];
  model: string;
  usage: OpenAiUsage;
}

export interface OpenAiModelsResponse {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }>;
}

export interface OpenAiErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}
