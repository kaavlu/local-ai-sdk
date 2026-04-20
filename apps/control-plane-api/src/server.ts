import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiKeyAuthError, authenticateRequest } from './auth/api-key-auth.js';
import type { AuthenticatedRequestContext } from './auth/api-key-auth.js';
import { executeCloudChatCompletion } from './executors/cloud-chat.js';
import { executeCloudEmbedding } from './executors/cloud-embedding.js';
import { executeLocalEmbedding, probeLocalReadiness } from './executors/local-embedding.js';
import { normalizeCloudEmbeddingResponse, normalizeLocalEmbeddingResponse } from './normalize/openai-embeddings.js';
import type {
  OpenAiChatCompletionsRequest,
  OpenAiChatMessage,
  OpenAiEmbeddingsRequest,
  OpenAiErrorResponse,
  OpenAiModelsResponse,
} from './openai-types.js';
import { ProjectContextError, resolveProjectContext } from './project-context.js';
import type { ProjectContext } from './project-context.js';
import {
  recordRequestExecutionSafely,
  type RequestExecutionRecordInput,
  type RequestExecutionPath,
} from './persistence/request-executions.js';
import { calculateLatencyMs, createRequestMetadata, deriveInputCount, type RequestMetadata } from './request-metadata.js';
import { determineExecution } from './routing/execution-decision.js';

export const DYNO_EMBEDDINGS_MODEL_ID = 'dyno-embeddings-1';
export const DYNO_CHAT_MODEL_ID = 'dyno-chat-1';

interface JsonResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

interface OpenAiErrorBodyShape {
  error?: {
    type?: unknown;
    code?: unknown;
  };
}

function json(res: ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(headers ?? {}),
  });
  res.end(JSON.stringify(body));
}

function openAiError(
  status: number,
  message: string,
  type: string,
  code: string | null,
  param: string | null = null,
): JsonResponse {
  const body: OpenAiErrorResponse = { error: { message, type, code, param } };
  return { status, body };
}

function withRequestIdHeader(result: JsonResponse, requestId: string): JsonResponse {
  return {
    ...result,
    headers: {
      ...(result.headers ?? {}),
      'X-Dyno-Request-Id': requestId,
    },
  };
}

function getOpenAiErrorMetadata(body: unknown): { errorType: string | null; errorCode: string | null } {
  const maybeError = body as OpenAiErrorBodyShape;
  return {
    errorType: typeof maybeError.error?.type === 'string' ? maybeError.error.type : null,
    errorCode: typeof maybeError.error?.code === 'string' ? maybeError.error.code : null,
  };
}

function normalizeInputs(input: unknown): string[] | null {
  if (typeof input === 'string') {
    return [input];
  }
  if (Array.isArray(input) && input.every((item) => typeof item === 'string')) {
    return input as string[];
  }
  return null;
}

function normalizeChatMessages(messages: unknown): OpenAiChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  const normalized: OpenAiChatMessage[] = [];
  for (const message of messages) {
    if (typeof message !== 'object' || message == null || Array.isArray(message)) {
      return null;
    }
    const maybeMessage = message as { role?: unknown; content?: unknown };
    if (
      maybeMessage.role !== 'system' &&
      maybeMessage.role !== 'user' &&
      maybeMessage.role !== 'assistant'
    ) {
      return null;
    }
    if (typeof maybeMessage.content !== 'string') {
      return null;
    }
    normalized.push({
      role: maybeMessage.role,
      content: maybeMessage.content,
    });
  }
  return normalized;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function mapTelemetryDecisionToExecutionPath(decision: unknown): RequestExecutionPath {
  if (decision === 'local' || decision === 'cloud') {
    return decision;
  }
  return 'unknown';
}

function normalizeTelemetryRecord(raw: unknown): RequestExecutionRecordInput | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const projectId = nonEmptyString(body.projectId);
  if (!projectId) {
    return null;
  }
  return {
    projectId,
    apiKeyId: nonEmptyString(body.apiKeyId),
    endpoint: nonEmptyString(body.endpoint) ?? '/sdk/embeddings',
    useCase: nonEmptyString(body.useCase),
    logicalModel: nonEmptyString(body.logicalModel),
    executionPath: mapTelemetryDecisionToExecutionPath(body.decision),
    executionReason: nonEmptyString(body.reason),
    status: body.status === 'error' ? 'error' : 'success',
    httpStatus: nullableFiniteNumber(body.httpStatus),
    latencyMs: nullableFiniteNumber(body.durationMs ?? body.latencyMs),
    inputCount: nullableFiniteNumber(body.inputCount),
    errorType: nonEmptyString(body.errorType),
    errorCode: nonEmptyString(body.errorCode),
    requestId: nonEmptyString(body.requestId),
    upstreamModel: nonEmptyString(body.upstreamModel),
    localJobId: nonEmptyString(body.localJobId),
  };
}

function extractTelemetryEventsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.events)) {
      return body.events;
    }
    return [body];
  }
  return [];
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? (JSON.parse(raw) as unknown) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getModelsResponse(): OpenAiModelsResponse {
  return {
    object: 'list',
    data: [
      {
        id: DYNO_EMBEDDINGS_MODEL_ID,
        object: 'model',
        created: 0,
        owned_by: 'dyno',
      },
      {
        id: DYNO_CHAT_MODEL_ID,
        object: 'model',
        created: 0,
        owned_by: 'dyno',
      },
    ],
  };
}

function ensureCloudFallbackConfigured(context: Awaited<ReturnType<typeof resolveProjectContext>>): JsonResponse | null {
  if (!context.fallbackEnabled) {
    return openAiError(
      503,
      'Project fallback is disabled and local execution is unavailable',
      'invalid_request_error',
      'fallback_disabled',
    );
  }
  if (!context.upstreamBaseUrl || !context.upstreamApiKey || !context.upstreamModel) {
    return openAiError(
      502,
      'Resolved project is missing upstream cloud configuration',
      'invalid_request_error',
      'upstream_not_configured',
    );
  }
  return null;
}

function ensureCloudChatConfigured(context: Awaited<ReturnType<typeof resolveProjectContext>>): JsonResponse | null {
  if (!context.upstreamBaseUrl || !context.upstreamApiKey || !context.upstreamModel) {
    return openAiError(
      502,
      'Resolved project is missing upstream cloud configuration',
      'invalid_request_error',
      'upstream_not_configured',
    );
  }
  return null;
}

export async function handleEmbeddingsRequest(
  body: unknown,
  headers: IncomingMessage['headers'],
  metadata?: RequestMetadata,
): Promise<JsonResponse> {
  const requestMetadata = metadata ?? createRequestMetadata();
  const finalize = (result: JsonResponse): JsonResponse => withRequestIdHeader(result, requestMetadata.requestId);
  const inputCount = deriveInputCount((body as Partial<OpenAiEmbeddingsRequest>)?.input);

  let authContext: AuthenticatedRequestContext | null = null;
  let projectContext: ProjectContext | null = null;
  let requestModel: string | null = null;
  let executionPath: RequestExecutionPath | null = null;
  let executionReason: string | null = null;

  const persistEmbeddingsResult = async (
    result: JsonResponse,
    status: 'success' | 'error',
    path: RequestExecutionPath | null,
    reason: string | null,
  ) => {
    const resolvedProjectId = authContext?.projectId ?? projectContext?.projectId ?? null;
    if (!resolvedProjectId) {
      return;
    }

    const errorMetadata = status === 'error' ? getOpenAiErrorMetadata(result.body) : { errorType: null, errorCode: null };
    await recordRequestExecutionSafely(
      {
        projectId: resolvedProjectId,
        apiKeyId: authContext?.apiKeyId ?? null,
        endpoint: '/v1/embeddings',
        useCase: projectContext?.useCaseType ?? null,
        logicalModel: requestModel ?? projectContext?.logicalModel ?? null,
        executionPath: path ?? executionPath ?? null,
        executionReason: reason ?? executionReason ?? null,
        status,
        httpStatus: result.status,
        latencyMs: calculateLatencyMs(requestMetadata.startedAtMs),
        inputCount,
        errorType: errorMetadata.errorType,
        errorCode: errorMetadata.errorCode,
        requestId: requestMetadata.requestId,
        upstreamModel: projectContext?.upstreamModel ?? null,
      },
      'embeddings',
    );
  };

  const request = body as Partial<OpenAiEmbeddingsRequest>;
  if (typeof request !== 'object' || request == null || Array.isArray(request)) {
    return finalize(openAiError(400, 'Request body must be a JSON object', 'invalid_request_error', 'invalid_body'));
  }
  const inputs = normalizeInputs(request.input);
  if (!inputs) {
    return finalize(
      openAiError(400, '"input" must be a string or an array of strings', 'invalid_request_error', 'invalid_input', 'input'),
    );
  }
  if (typeof request.model !== 'string' || !request.model.trim()) {
    return finalize(openAiError(400, '"model" is required', 'invalid_request_error', 'invalid_model', 'model'));
  }
  requestModel = request.model.trim();
  if (requestModel !== DYNO_EMBEDDINGS_MODEL_ID) {
    return finalize(
      openAiError(
      400,
      `Model "${requestModel}" is not supported by Dyno Phase 1 embeddings`,
      'invalid_request_error',
      'model_not_supported',
      'model',
      ),
    );
  }

  try {
    authContext = await authenticateRequest(headers);
    const context = await resolveProjectContext(authContext.projectApiKey, { requireCloudConfig: false });
    authContext.projectId = context.projectId;
    projectContext = context;
    if (context.useCaseType !== 'embeddings') {
      const result = openAiError(
        400,
        `Project use case "${context.useCaseType}" is not supported for embeddings`,
        'invalid_request_error',
        'unsupported_use_case',
      );
      await persistEmbeddingsResult(result, 'error', 'unknown', 'unsupported_use_case');
      return finalize(result);
    }

    const readiness = await probeLocalReadiness(context.localMode);
    const decision = determineExecution({
      useCase: 'embeddings',
      strategyPreset: context.strategyPreset,
      agentReachable: readiness.agentReachable,
      localReady: readiness.localReady,
    });
    executionPath = decision.execution;
    executionReason = decision.reason;

    if (decision.execution === 'local') {
      try {
        const vectors = await executeLocalEmbedding(inputs);
        const result = {
          status: 200,
          headers: {
            'X-Dyno-Execution': 'local',
            'X-Dyno-Reason': decision.reason,
          },
          body: normalizeLocalEmbeddingResponse({
            requestModel,
            inputs,
            vectors,
          }),
        };
        void persistEmbeddingsResult(result, 'success', 'local', decision.reason);
        return finalize(result);
      } catch {
        // If local execution fails, perform a single cloud fallback for Phase 1.
        executionPath = 'cloud';
        executionReason = 'cloud_fallback';
        const cloudConfigError = ensureCloudFallbackConfigured(context);
        if (cloudConfigError) {
          await persistEmbeddingsResult(cloudConfigError, 'error', 'cloud', 'cloud_fallback');
          return finalize(cloudConfigError);
        }
        const cloud = await executeCloudEmbedding(context, {
          input: inputs.length === 1 ? inputs[0] : inputs,
          model: requestModel,
          user: typeof request.user === 'string' ? request.user : undefined,
        });
        const result = {
          status: 200,
          headers: {
            'X-Dyno-Execution': 'cloud',
            'X-Dyno-Reason': 'cloud_fallback',
          },
          body: normalizeCloudEmbeddingResponse({
            requestModel,
            response: cloud,
          }),
        };
        void persistEmbeddingsResult(result, 'success', 'cloud', 'cloud_fallback');
        return finalize(result);
      }
    }

    const cloudConfigError = ensureCloudFallbackConfigured(context);
    if (cloudConfigError) {
      await persistEmbeddingsResult(cloudConfigError, 'error', 'cloud', decision.reason);
      return finalize(cloudConfigError);
    }
    const cloud = await executeCloudEmbedding(context, {
      input: inputs.length === 1 ? inputs[0] : inputs,
      model: requestModel,
      user: typeof request.user === 'string' ? request.user : undefined,
    });
    const result = {
      status: 200,
      headers: {
        'X-Dyno-Execution': 'cloud',
        'X-Dyno-Reason': decision.reason,
      },
      body: normalizeCloudEmbeddingResponse({
        requestModel,
        response: cloud,
      }),
    };
    void persistEmbeddingsResult(result, 'success', 'cloud', decision.reason);
    return finalize(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      const result = openAiError(error.statusCode, error.message, 'authentication_error', error.code);
      await persistEmbeddingsResult(result, 'error', executionPath, error.code);
      return finalize(result);
    }
    if (error instanceof ProjectContextError) {
      if (authContext && !authContext.projectId && error.projectId) {
        authContext.projectId = error.projectId;
      }
      const isAuthError = error.code === 'invalid_api_key' || error.code === 'revoked_api_key';
      const result = openAiError(
        error.statusCode,
        error.message,
        isAuthError ? 'authentication_error' : 'invalid_request_error',
        error.code,
      );
      await persistEmbeddingsResult(result, 'error', executionPath, error.code);
      return finalize(result);
    }
    const result = openAiError(502, 'Dyno failed to execute embeddings request', 'api_error', 'execution_failed');
    await persistEmbeddingsResult(result, 'error', executionPath, executionReason ?? 'execution_failed');
    return finalize(result);
  }
}

export async function handleChatCompletionsRequest(
  body: unknown,
  headers: IncomingMessage['headers'],
  metadata?: RequestMetadata,
): Promise<JsonResponse> {
  const requestMetadata = metadata ?? createRequestMetadata();
  const finalize = (result: JsonResponse): JsonResponse => withRequestIdHeader(result, requestMetadata.requestId);

  let authContext: AuthenticatedRequestContext | null = null;
  let projectContext: ProjectContext | null = null;
  let requestModel: string | null = null;
  let messages: OpenAiChatMessage[] = [];
  let executionPath: RequestExecutionPath | null = 'cloud';
  let executionReason: string | null = 'local_not_supported';

  const persistChatResult = async (result: JsonResponse, status: 'success' | 'error', reason: string | null) => {
    const resolvedProjectId = authContext?.projectId ?? projectContext?.projectId ?? null;
    if (!resolvedProjectId) {
      return;
    }

    const errorMetadata = status === 'error' ? getOpenAiErrorMetadata(result.body) : { errorType: null, errorCode: null };
    await recordRequestExecutionSafely(
      {
        projectId: resolvedProjectId,
        apiKeyId: authContext?.apiKeyId ?? null,
        endpoint: '/v1/chat/completions',
        useCase: projectContext?.useCaseType ?? null,
        logicalModel: requestModel ?? DYNO_CHAT_MODEL_ID,
        executionPath,
        executionReason: reason ?? executionReason,
        status,
        httpStatus: result.status,
        latencyMs: calculateLatencyMs(requestMetadata.startedAtMs),
        inputCount: messages.length,
        errorType: errorMetadata.errorType,
        errorCode: errorMetadata.errorCode,
        requestId: requestMetadata.requestId,
        upstreamModel: projectContext?.upstreamModel ?? null,
      },
      'chat',
    );
  };

  const request = body as Partial<OpenAiChatCompletionsRequest>;
  if (typeof request !== 'object' || request == null || Array.isArray(request)) {
    return finalize(openAiError(400, 'Request body must be a JSON object', 'invalid_request_error', 'invalid_body'));
  }
  if (typeof request.model !== 'string' || !request.model.trim()) {
    return finalize(openAiError(400, '"model" is required', 'invalid_request_error', 'invalid_model', 'model'));
  }
  requestModel = request.model.trim();
  if (requestModel !== DYNO_CHAT_MODEL_ID) {
    return finalize(
      openAiError(
        400,
        `Model "${requestModel}" is not supported by Dyno Phase 3B chat`,
        'invalid_request_error',
        'model_not_supported',
        'model',
      ),
    );
  }
  messages = normalizeChatMessages(request.messages) ?? [];
  if (messages.length === 0) {
    return finalize(
      openAiError(
        400,
        '"messages" must be a non-empty array of { role, content } entries',
        'invalid_request_error',
        'invalid_messages',
        'messages',
      ),
    );
  }
  if (request.stream === true) {
    return finalize(
      openAiError(400, 'Streaming chat completions are not supported yet', 'invalid_request_error', 'streaming_not_supported'),
    );
  }
  if (request.temperature !== undefined && (typeof request.temperature !== 'number' || !Number.isFinite(request.temperature))) {
    return finalize(openAiError(400, '"temperature" must be a number', 'invalid_request_error', 'invalid_temperature', 'temperature'));
  }
  if (
    request.max_tokens !== undefined &&
    (typeof request.max_tokens !== 'number' || !Number.isInteger(request.max_tokens) || request.max_tokens <= 0)
  ) {
    return finalize(openAiError(400, '"max_tokens" must be a positive integer', 'invalid_request_error', 'invalid_max_tokens', 'max_tokens'));
  }
  if (request.user !== undefined && typeof request.user !== 'string') {
    return finalize(openAiError(400, '"user" must be a string', 'invalid_request_error', 'invalid_user', 'user'));
  }

  const upstreamRequest: OpenAiChatCompletionsRequest = {
    ...(request as Record<string, unknown>),
    model: requestModel,
    messages,
  };

  try {
    authContext = await authenticateRequest(headers);
    const context = await resolveProjectContext(authContext.projectApiKey);
    authContext.projectId = context.projectId;
    projectContext = context;
    const decision = determineExecution({
      useCase: 'chat',
      strategyPreset: context.strategyPreset,
      agentReachable: false,
      localReady: false,
    });
    executionPath = decision.execution;
    executionReason = decision.reason;

    const cloudConfigError = ensureCloudChatConfigured(context);
    if (cloudConfigError) {
      await persistChatResult(cloudConfigError, 'error', decision.reason);
      return finalize(cloudConfigError);
    }

    const cloud = await executeCloudChatCompletion(context, upstreamRequest);
    const result = {
      status: 200,
      headers: {
        'X-Dyno-Execution': 'cloud',
        'X-Dyno-Reason': decision.reason,
      },
      body: cloud,
    };
    void persistChatResult(result, 'success', decision.reason);
    return finalize(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      const result = openAiError(error.statusCode, error.message, 'authentication_error', error.code);
      await persistChatResult(result, 'error', error.code);
      return finalize(result);
    }
    if (error instanceof ProjectContextError) {
      if (authContext && !authContext.projectId && error.projectId) {
        authContext.projectId = error.projectId;
      }
      const isAuthError = error.code === 'invalid_api_key' || error.code === 'revoked_api_key';
      const result = openAiError(
        error.statusCode,
        error.message,
        isAuthError ? 'authentication_error' : 'invalid_request_error',
        error.code,
      );
      await persistChatResult(result, 'error', error.code);
      return finalize(result);
    }
    const result = openAiError(502, 'Dyno failed to execute chat completion request', 'api_error', 'execution_failed');
    await persistChatResult(result, 'error', executionReason ?? 'execution_failed');
    return finalize(result);
  }
}

async function handleModelsRequest(
  headers: IncomingMessage['headers'],
  metadata?: RequestMetadata,
): Promise<JsonResponse> {
  const requestMetadata = metadata ?? createRequestMetadata();
  const finalize = (result: JsonResponse): JsonResponse => withRequestIdHeader(result, requestMetadata.requestId);
  let authContext: AuthenticatedRequestContext | null = null;

  const persistModelsResult = async (result: JsonResponse, status: 'success' | 'error', reason: string | null) => {
    if (!authContext?.projectId) {
      return;
    }
    const errorMetadata = status === 'error' ? getOpenAiErrorMetadata(result.body) : { errorType: null, errorCode: null };
    await recordRequestExecutionSafely(
      {
        projectId: authContext.projectId,
        apiKeyId: authContext.apiKeyId,
        endpoint: '/v1/models',
        useCase: null,
        logicalModel: null,
        executionPath: 'unknown',
        executionReason: reason,
        status,
        httpStatus: result.status,
        latencyMs: calculateLatencyMs(requestMetadata.startedAtMs),
        inputCount: null,
        errorType: errorMetadata.errorType,
        errorCode: errorMetadata.errorCode,
        requestId: requestMetadata.requestId,
      },
      'models',
    );
  };

  try {
    authContext = await authenticateRequest(headers);
    const context = await resolveProjectContext(authContext.projectApiKey);
    authContext.projectId = context.projectId;
    const result = { status: 200, body: getModelsResponse() };
    void persistModelsResult(result, 'success', 'models_listed');
    return finalize(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      const result = openAiError(error.statusCode, error.message, 'authentication_error', error.code);
      await persistModelsResult(result, 'error', error.code);
      return finalize(result);
    }
    if (error instanceof ProjectContextError) {
      if (authContext && !authContext.projectId && error.projectId) {
        authContext.projectId = error.projectId;
      }
      const isAuthError = error.code === 'invalid_api_key' || error.code === 'revoked_api_key';
      const result = openAiError(
        error.statusCode,
        error.message,
        isAuthError ? 'authentication_error' : 'invalid_request_error',
        error.code,
      );
      await persistModelsResult(result, 'error', error.code);
      return finalize(result);
    }
    const result = openAiError(502, 'Dyno failed to authenticate request', 'api_error', 'auth_failed');
    await persistModelsResult(result, 'error', 'auth_failed');
    return finalize(result);
  }
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const pathname = (req.url?.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && pathname === '/v1/models') {
      void (async () => {
        const requestMetadata = createRequestMetadata();
        const result = await handleModelsRequest(req.headers, requestMetadata);
        json(res, result.status, result.body, result.headers);
      })();
      return;
    }
    if (req.method === 'POST' && pathname === '/v1/embeddings') {
      void (async () => {
        const requestMetadata = createRequestMetadata();
        try {
          const body = await readJsonBody(req);
          const result = await handleEmbeddingsRequest(body, req.headers, requestMetadata);
          json(res, result.status, result.body, result.headers);
        } catch (error) {
          if (error instanceof SyntaxError) {
            const result = withRequestIdHeader(
              openAiError(400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json'),
              requestMetadata.requestId,
            );
            json(res, result.status, result.body, result.headers);
            return;
          }
          const result = withRequestIdHeader(
            openAiError(500, 'Internal server error', 'api_error', 'internal_error'),
            requestMetadata.requestId,
          );
          json(res, result.status, result.body, result.headers);
        }
      })();
      return;
    }
    if (req.method === 'POST' && pathname === '/v1/chat/completions') {
      void (async () => {
        const requestMetadata = createRequestMetadata();
        try {
          const body = await readJsonBody(req);
          const result = await handleChatCompletionsRequest(body, req.headers, requestMetadata);
          json(res, result.status, result.body, result.headers);
        } catch (error) {
          if (error instanceof SyntaxError) {
            const result = withRequestIdHeader(
              openAiError(400, 'Invalid JSON body', 'invalid_request_error', 'invalid_json'),
              requestMetadata.requestId,
            );
            json(res, result.status, result.body, result.headers);
            return;
          }
          const result = withRequestIdHeader(
            openAiError(500, 'Internal server error', 'api_error', 'internal_error'),
            requestMetadata.requestId,
          );
          json(res, result.status, result.body, result.headers);
        }
      })();
      return;
    }
    if (req.method === 'POST' && pathname === '/telemetry/events') {
      void (async () => {
        try {
          const payload = await readJsonBody(req);
          const rawEvents = extractTelemetryEventsPayload(payload);
          if (rawEvents.length === 0) {
            json(res, 400, {
              error: {
                message: 'Request must include at least one telemetry event',
                type: 'invalid_request_error',
                code: 'invalid_telemetry_payload',
                param: 'events',
              },
            });
            return;
          }

          const normalizedEvents = rawEvents
            .map((event) => normalizeTelemetryRecord(event))
            .filter((event): event is RequestExecutionRecordInput => event !== null);
          if (normalizedEvents.length === 0) {
            json(res, 400, {
              error: {
                message: 'No valid telemetry events were provided',
                type: 'invalid_request_error',
                code: 'invalid_telemetry_events',
                param: 'events',
              },
            });
            return;
          }

          await Promise.all(
            normalizedEvents.map(async (event) => {
              await recordRequestExecutionSafely(event, 'sdk-telemetry');
            }),
          );

          json(res, 202, {
            accepted: normalizedEvents.length,
            dropped: rawEvents.length - normalizedEvents.length,
          });
        } catch (error) {
          if (error instanceof SyntaxError) {
            json(res, 400, {
              error: {
                message: 'Invalid JSON body',
                type: 'invalid_request_error',
                code: 'invalid_json',
                param: null,
              },
            });
            return;
          }
          json(res, 500, {
            error: {
              message: 'Internal server error',
              type: 'api_error',
              code: 'internal_error',
              param: null,
            },
          });
        }
      })();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(openAiError(404, 'Not found', 'invalid_request_error', 'not_found').body));
  });
}
