import type { IncomingHttpHeaders } from 'node:http';
import { getResolverAuthHeaders } from '../project-context.js';

const BEARER_SCHEME = 'bearer ';

export interface AuthenticatedRequestContext {
  projectId: string;
  apiKeyId: string | null;
}

export class ApiKeyAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiKeyAuthError';
  }
}

function getHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function allowProjectIdFallback(): boolean {
  return process.env.DYNO_ENABLE_X_PROJECT_ID_FALLBACK?.toLowerCase() === 'true';
}

function extractBearerToken(headers: IncomingHttpHeaders): string {
  const authorization = getHeader(headers, 'authorization');
  if (!authorization) {
    throw new ApiKeyAuthError('Missing Authorization header', 401, 'missing_api_key');
  }
  const normalized = authorization.trim();
  if (!normalized.toLowerCase().startsWith(BEARER_SCHEME)) {
    throw new ApiKeyAuthError('Malformed Authorization header', 401, 'invalid_api_key');
  }
  const token = normalized.slice(BEARER_SCHEME.length).trim();
  if (!token) {
    throw new ApiKeyAuthError('Malformed Authorization header', 401, 'invalid_api_key');
  }
  return token;
}

export async function authenticateRequest(headers: IncomingHttpHeaders): Promise<AuthenticatedRequestContext> {
  let apiKey: string;
  try {
    apiKey = extractBearerToken(headers);
  } catch (error) {
    if (error instanceof ApiKeyAuthError && error.code === 'missing_api_key' && allowProjectIdFallback()) {
      const fallbackProjectId = nonEmptyString(getHeader(headers, 'x-project-id'));
      if (fallbackProjectId) {
        return { projectId: fallbackProjectId, apiKeyId: null };
      }
    }
    throw error;
  }

  const resolverBaseUrl = nonEmptyString(process.env.DYNO_CONFIG_RESOLVER_URL);
  if (!resolverBaseUrl) {
    throw new ApiKeyAuthError(
      'DYNO_CONFIG_RESOLVER_URL is required for API key authentication',
      500,
      'auth_not_configured',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${resolverBaseUrl.replace(/\/+$/, '')}/api/demo/auth/resolve-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...getResolverAuthHeaders(),
      },
      body: JSON.stringify({ apiKey }),
    });
  } catch {
    throw new ApiKeyAuthError('Dyno authentication service is unavailable', 502, 'auth_unreachable');
  }

  if (!response.ok) {
    if (response.status === 401) {
      let resolverCode = '';
      try {
        const body = (await response.json()) as { code?: unknown };
        resolverCode = typeof body.code === 'string' ? body.code : '';
      } catch {
        resolverCode = '';
      }
      if (resolverCode === 'revoked_api_key') {
        throw new ApiKeyAuthError('API key has been revoked', 401, 'revoked_api_key');
      }
      throw new ApiKeyAuthError('Invalid API key provided', 401, 'invalid_api_key');
    }
    throw new ApiKeyAuthError('Dyno failed to authenticate API key', 502, 'auth_failed');
  }

  const body = (await response.json()) as { projectId?: unknown; keyId?: unknown };
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const keyId = typeof body.keyId === 'string' ? body.keyId.trim() : '';
  if (!projectId) {
    throw new ApiKeyAuthError('Dyno authentication response was invalid', 502, 'auth_invalid_response');
  }
  return { projectId, apiKeyId: keyId || null };
}
