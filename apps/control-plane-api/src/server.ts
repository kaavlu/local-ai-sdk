import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiKeyAuthError, authenticateRequest } from './auth/api-key-auth.js';
import type { AuthenticatedRequestContext } from './auth/api-key-auth.js';
import { executeCloudEmbedding } from './executors/cloud-embedding.js';
import { executeLocalEmbedding, probeLocalReadiness } from './executors/local-embedding.js';
import { normalizeCloudEmbeddingResponse, normalizeLocalEmbeddingResponse } from './normalize/openai-embeddings.js';
import type { OpenAiEmbeddingsRequest, OpenAiErrorResponse, OpenAiModelsResponse } from './openai-types.js';
import { ProjectContextError, resolveProjectContext } from './project-context.js';
import type { ProjectContext } from './project-context.js';
import {
  recordRequestExecutionSafely,
  type RequestExecutionPath,
} from './persistence/request-executions.js';
import { calculateLatencyMs, createRequestMetadata, deriveInputCount, type RequestMetadata } from './request-metadata.js';
import { determineEmbeddingExecution } from './routing/embedding-decision.js';

export const DYNO_EMBEDDINGS_MODEL_ID = 'dyno-embeddings-1';

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
    if (!authContext?.projectId) {
      return;
    }

    const errorMetadata = status === 'error' ? getOpenAiErrorMetadata(result.body) : { errorType: null, errorCode: null };
    await recordRequestExecutionSafely(
      {
        projectId: authContext.projectId,
        apiKeyId: authContext.apiKeyId,
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
    const context = await resolveProjectContext(authContext.projectId);
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
    const decision = determineEmbeddingExecution({
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
      const result = openAiError(error.statusCode, error.message, 'invalid_request_error', error.code);
      await persistEmbeddingsResult(result, 'error', executionPath, error.code);
      return finalize(result);
    }
    const result = openAiError(502, 'Dyno failed to execute embeddings request', 'api_error', 'execution_failed');
    await persistEmbeddingsResult(result, 'error', executionPath, executionReason ?? 'execution_failed');
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
    const result = { status: 200, body: getModelsResponse() };
    void persistModelsResult(result, 'success', 'models_listed');
    return finalize(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      const result = openAiError(error.statusCode, error.message, 'authentication_error', error.code);
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
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(openAiError(404, 'Not found', 'invalid_request_error', 'not_found').body));
  });
}
