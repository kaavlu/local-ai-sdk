import type { IncomingHttpHeaders } from 'node:http';

const BEARER_SCHEME = 'bearer ';

export interface AuthenticatedRequestContext {
  projectId: string | null;
  apiKeyId: string | null;
  projectApiKey: string;
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
  const projectApiKey = extractBearerToken(headers);
  return {
    projectId: null,
    apiKeyId: null,
    projectApiKey,
  };
}
