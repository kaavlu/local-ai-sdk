import assert from 'node:assert/strict';
import http from 'node:http';
import test, { afterEach } from 'node:test';
import {
  setRequestExecutionRecorderForTests,
  type RequestExecutionRecordInput,
} from '../persistence/request-executions.js';
import { createServer, DYNO_EMBEDDINGS_MODEL_ID, handleEmbeddingsRequest } from '../server.js';

const originalFetch = global.fetch;
const originalEnv = {
  DYNO_CONFIG_RESOLVER_URL: process.env.DYNO_CONFIG_RESOLVER_URL,
  DYNO_CONFIG_RESOLVER_SECRET: process.env.DYNO_CONFIG_RESOLVER_SECRET,
  DYNO_CONFIG_RESOLVER_SECRET_HEADER: process.env.DYNO_CONFIG_RESOLVER_SECRET_HEADER,
  DYNO_UPSTREAM_BASE_URL: process.env.DYNO_UPSTREAM_BASE_URL,
  DYNO_UPSTREAM_API_KEY: process.env.DYNO_UPSTREAM_API_KEY,
  DYNO_AGENT_BASE_URL: process.env.DYNO_AGENT_BASE_URL,
  DYNO_ENABLE_X_PROJECT_ID_FALLBACK: process.env.DYNO_ENABLE_X_PROJECT_ID_FALLBACK,
};

afterEach(() => {
  global.fetch = originalFetch;
  setRequestExecutionRecorderForTests(null);
  process.env.DYNO_CONFIG_RESOLVER_URL = originalEnv.DYNO_CONFIG_RESOLVER_URL;
  process.env.DYNO_CONFIG_RESOLVER_SECRET = originalEnv.DYNO_CONFIG_RESOLVER_SECRET;
  process.env.DYNO_CONFIG_RESOLVER_SECRET_HEADER = originalEnv.DYNO_CONFIG_RESOLVER_SECRET_HEADER;
  process.env.DYNO_UPSTREAM_BASE_URL = originalEnv.DYNO_UPSTREAM_BASE_URL;
  process.env.DYNO_UPSTREAM_API_KEY = originalEnv.DYNO_UPSTREAM_API_KEY;
  process.env.DYNO_AGENT_BASE_URL = originalEnv.DYNO_AGENT_BASE_URL;
  process.env.DYNO_ENABLE_X_PROJECT_ID_FALLBACK = originalEnv.DYNO_ENABLE_X_PROJECT_ID_FALLBACK;
});

function captureRecordedExecutions(): RequestExecutionRecordInput[] {
  const rows: RequestExecutionRecordInput[] = [];
  setRequestExecutionRecorderForTests((record) => {
    rows.push(record);
  });
  return rows;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

test('POST /v1/embeddings local success path returns OpenAI shape with headers', async () => {
  const executions = captureRecordedExecutions();
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_CONFIG_RESOLVER_SECRET = 'secret';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'up-key';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key' && init?.method === 'POST') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'local_first',
        local_model: 'Xenova/all-MiniLM-L6-v2',
        cloud_model: 'text-embedding-3-small',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://agent.test/health') {
      return jsonResponse({ ok: true });
    }
    if (url === 'http://agent.test/debug/readiness') {
      return jsonResponse({ interactiveLocalReady: true, backgroundLocalReady: true });
    }
    if (url === 'http://agent.test/jobs' && init?.method === 'POST') {
      return jsonResponse({ id: 'job-1', state: 'queued' }, 201);
    }
    if (url === 'http://agent.test/jobs/job-1') {
      return jsonResponse({ state: 'completed' });
    }
    if (url === 'http://agent.test/jobs/job-1/result') {
      return jsonResponse({ output: { embedding: [0.1, 0.2, 0.3] } });
    }
    throw new Error(`Unexpected fetch URL in local test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello world', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_test_key' },
  );
  const responseBody = result.body as {
    object: string;
    data: unknown[];
    model: string;
  };

  assert.equal(result.status, 200);
  assert.equal(result.headers?.['X-Dyno-Execution'], 'local');
  assert.equal(result.headers?.['X-Dyno-Reason'], 'local_ready');
  assert.equal(typeof result.headers?.['X-Dyno-Request-Id'], 'string');
  assert.equal(responseBody.object, 'list');
  assert.equal(Array.isArray(responseBody.data), true);
  assert.equal(responseBody.model, DYNO_EMBEDDINGS_MODEL_ID);
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.endpoint, '/v1/embeddings');
  assert.equal(executions[0]?.status, 'success');
  assert.equal(executions[0]?.executionPath, 'local');
  assert.equal(executions[0]?.executionReason, 'local_ready');
  assert.equal(executions[0]?.inputCount, 1);
  assert.equal(typeof executions[0]?.requestId, 'string');
  assert.equal('input' in executions[0], false);
});

test('POST /v1/embeddings falls back to cloud when local is not ready', async () => {
  const executions = captureRecordedExecutions();
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'up-key';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'balanced',
        local_model: 'Xenova/all-MiniLM-L6-v2',
        cloud_model: 'text-embedding-3-small',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://agent.test/health') {
      return jsonResponse({ ok: true });
    }
    if (url === 'http://agent.test/debug/readiness') {
      return jsonResponse({ interactiveLocalReady: true, backgroundLocalReady: false });
    }
    if (url === 'http://upstream.test/v1/embeddings') {
      return jsonResponse({
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.5, 0.7], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 3, total_tokens: 3 },
      });
    }
    throw new Error(`Unexpected fetch URL in cloud fallback test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: ['alpha'], model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_test_key' },
  );
  const responseBody = result.body as {
    object: string;
    model: string;
  };

  assert.equal(result.status, 200);
  assert.equal(result.headers?.['X-Dyno-Execution'], 'cloud');
  assert.equal(result.headers?.['X-Dyno-Reason'], 'not_ready');
  assert.equal(responseBody.object, 'list');
  assert.equal(responseBody.model, DYNO_EMBEDDINGS_MODEL_ID);
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.executionPath, 'cloud');
  assert.equal(executions[0]?.executionReason, 'not_ready');
  assert.equal(executions[0]?.status, 'success');
});

test('POST /v1/embeddings returns clean OpenAI error when cloud fails', async () => {
  const executions = captureRecordedExecutions();
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'up-key';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'cloud_first',
        local_model: null,
        cloud_model: 'text-embedding-3-small',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://upstream.test/v1/embeddings') {
      return jsonResponse({ error: { message: 'upstream down' } }, 500);
    }
    throw new Error(`Unexpected fetch URL in clean-error test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_test_key' },
  );
  const responseBody = result.body as { error?: unknown };

  assert.equal(result.status, 502);
  assert.equal(typeof responseBody.error, 'object');
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.status, 'error');
  assert.equal(executions[0]?.httpStatus, 502);
  assert.equal(executions[0]?.errorCode, 'execution_failed');
  assert.equal(executions[0]?.executionPath, 'cloud');
});

test('POST /v1/embeddings prefers project-backed upstream config over env vars', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://env-upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'env-up-key';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';

  let receivedAuthHeader = '';
  let receivedModel = '';

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key' && init?.method === 'POST') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'cloud_first',
        fallback_enabled: true,
        upstream_base_url: 'http://project-upstream.test',
        upstream_model: 'text-embedding-3-small',
        upstream_api_key: 'project-up-key',
        local_model: null,
        cloud_model: 'legacy-cloud-model',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://project-upstream.test/v1/embeddings') {
      receivedAuthHeader = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      receivedModel = body.model ?? '';
      return jsonResponse({
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.3, 0.4], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 2, total_tokens: 2 },
      });
    }
    throw new Error(`Unexpected fetch URL in project-backed precedence test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_test_key' },
  );
  assert.equal(result.status, 200);
  assert.equal(receivedAuthHeader, 'Bearer project-up-key');
  assert.equal(receivedModel, 'text-embedding-3-small');
});

test('POST /v1/embeddings returns fallback_disabled when fallback is disabled', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';
  delete process.env.DYNO_UPSTREAM_BASE_URL;
  delete process.env.DYNO_UPSTREAM_API_KEY;

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'cloud_first',
        fallback_enabled: false,
        local_model: 'Xenova/all-MiniLM-L6-v2',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://agent.test/health') {
      return jsonResponse({ ok: true });
    }
    if (url === 'http://agent.test/debug/readiness') {
      return jsonResponse({ interactiveLocalReady: false, backgroundLocalReady: false });
    }
    throw new Error(`Unexpected fetch URL in fallback-disabled test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_test_key' },
  );
  const body = result.body as { error?: { code?: string } };

  assert.equal(result.status, 503);
  assert.equal(body.error?.code, 'fallback_disabled');
});

test('GET /v1/models requires bearer auth and returns OpenAI-compatible models shape', async () => {
  const executions = captureRecordedExecutions();
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ projectId: 'proj-123' });
    }
    throw new Error(`Unexpected fetch URL in models test: ${url}`);
  }) as typeof global.fetch;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  const response = await new Promise<{ body: string; requestIdHeader: string | null }>((resolve, reject) => {
    const request = http.request(
      {
        method: 'GET',
        host: '127.0.0.1',
        port: address.port,
        path: '/v1/models',
        headers: {
          Authorization: 'Bearer dyno_live_test_key',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            requestIdHeader: response.headers['x-dyno-request-id']?.toString() ?? null,
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  const parsed = JSON.parse(response.body) as { object: string; data: Array<{ id: string }> };
  assert.equal(parsed.object, 'list');
  assert.equal(Array.isArray(parsed.data), true);
  assert.equal(parsed.data[0]?.id, DYNO_EMBEDDINGS_MODEL_ID);
  assert.equal(typeof response.requestIdHeader, 'string');
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.endpoint, '/v1/models');
  assert.equal(executions[0]?.status, 'success');
});

test('POST /v1/embeddings returns authentication_error when bearer token is missing', async () => {
  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    {},
  );
  const body = result.body as { error?: { type?: string; code?: string } };
  assert.equal(result.status, 401);
  assert.equal(body.error?.type, 'authentication_error');
  assert.equal(body.error?.code, 'missing_api_key');
});

test('POST /v1/embeddings returns authentication_error when auth header is malformed', async () => {
  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Token dyno_live_bad' },
  );
  const body = result.body as { error?: { type?: string; code?: string } };
  assert.equal(result.status, 401);
  assert.equal(body.error?.type, 'authentication_error');
  assert.equal(body.error?.code, 'invalid_api_key');
});

test('POST /v1/embeddings returns authentication_error when bearer token is invalid', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    throw new Error(`Unexpected fetch URL in invalid bearer test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_invalid' },
  );
  const body = result.body as { error?: { type?: string; code?: string } };
  assert.equal(result.status, 401);
  assert.equal(body.error?.type, 'authentication_error');
  assert.equal(body.error?.code, 'invalid_api_key');
});

test('POST /v1/embeddings returns revoked_api_key when key is revoked', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/auth/resolve-api-key') {
      return jsonResponse({ error: 'unauthorized', code: 'revoked_api_key' }, 401);
    }
    throw new Error(`Unexpected fetch URL in revoked bearer test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { authorization: 'Bearer dyno_live_revoked' },
  );
  const body = result.body as { error?: { type?: string; code?: string } };
  assert.equal(result.status, 401);
  assert.equal(body.error?.type, 'authentication_error');
  assert.equal(body.error?.code, 'revoked_api_key');
});

test('POST /v1/embeddings allows optional X-Project-Id fallback when enabled', async () => {
  process.env.DYNO_ENABLE_X_PROJECT_ID_FALLBACK = 'true';
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'up-key';
  process.env.DYNO_AGENT_BASE_URL = 'http://agent.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/project-config/proj-fallback') {
      return jsonResponse({
        projectId: 'proj-fallback',
        use_case_type: 'embeddings',
        strategy_preset: 'cloud_first',
        local_model: null,
        cloud_model: 'text-embedding-3-small',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    if (url === 'http://upstream.test/v1/embeddings') {
      return jsonResponse({
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 2, total_tokens: 2 },
      });
    }
    throw new Error(`Unexpected fetch URL in fallback auth test: ${url}`);
  }) as typeof global.fetch;

  const result = await handleEmbeddingsRequest(
    { input: 'hello', model: DYNO_EMBEDDINGS_MODEL_ID },
    { 'x-project-id': 'proj-fallback' },
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers?.['X-Dyno-Execution'], 'cloud');
});
