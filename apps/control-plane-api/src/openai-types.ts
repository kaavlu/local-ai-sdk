export type OpenAiEmbeddingsInput = string | string[];

export interface OpenAiEmbeddingsRequest {
  input: OpenAiEmbeddingsInput;
  model: string;
  user?: string;
}

export type OpenAiChatRole = 'system' | 'user' | 'assistant';

export interface OpenAiChatMessage {
  role: OpenAiChatRole;
  content: string;
}

export interface OpenAiChatCompletionsRequest {
  model: string;
  messages: OpenAiChatMessage[];
  temperature?: number;
  max_tokens?: number;
  user?: string;
  stream?: boolean;
  [key: string]: unknown;
}

export interface OpenAiChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      [key: string]: unknown;
    };
    finish_reason: string | null;
    [key: string]: unknown;
  }>;
  usage?: OpenAiUsage;
  [key: string]: unknown;
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
