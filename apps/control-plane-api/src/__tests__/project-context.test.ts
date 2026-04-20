import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { resolveProjectContext } from '../project-context.js';

const originalFetch = global.fetch;
const originalEnv = {
  DYNO_CONFIG_RESOLVER_URL: process.env.DYNO_CONFIG_RESOLVER_URL,
  DYNO_CONFIG_RESOLVER_CONFIG_PATH: process.env.DYNO_CONFIG_RESOLVER_CONFIG_PATH,
  DYNO_CONFIG_RESOLVER_TIMEOUT_MS: process.env.DYNO_CONFIG_RESOLVER_TIMEOUT_MS,
  DYNO_UPSTREAM_BASE_URL: process.env.DYNO_UPSTREAM_BASE_URL,
  DYNO_UPSTREAM_API_KEY: process.env.DYNO_UPSTREAM_API_KEY,
  DYNO_UPSTREAM_MODEL: process.env.DYNO_UPSTREAM_MODEL,
};

function restoreEnvVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

afterEach(() => {
  global.fetch = originalFetch;
  restoreEnvVariable('DYNO_CONFIG_RESOLVER_URL', originalEnv.DYNO_CONFIG_RESOLVER_URL);
  restoreEnvVariable('DYNO_CONFIG_RESOLVER_CONFIG_PATH', originalEnv.DYNO_CONFIG_RESOLVER_CONFIG_PATH);
  restoreEnvVariable('DYNO_CONFIG_RESOLVER_TIMEOUT_MS', originalEnv.DYNO_CONFIG_RESOLVER_TIMEOUT_MS);
  restoreEnvVariable('DYNO_UPSTREAM_BASE_URL', originalEnv.DYNO_UPSTREAM_BASE_URL);
  restoreEnvVariable('DYNO_UPSTREAM_API_KEY', originalEnv.DYNO_UPSTREAM_API_KEY);
  restoreEnvVariable('DYNO_UPSTREAM_MODEL', originalEnv.DYNO_UPSTREAM_MODEL);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getResolverConfigUrl(baseUrl: string): string {
  const resolverPath = process.env.DYNO_CONFIG_RESOLVER_CONFIG_PATH ?? '/api/v1/sdk/config';
  return `${baseUrl}${resolverPath}`;
}

test('resolveProjectContext prefers canonical project upstream over env fallback', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://env-upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'env-key';
  process.env.DYNO_UPSTREAM_MODEL = 'env-model';

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === getResolverConfigUrl('http://resolver.test')) {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer dyno_live_test_key');
      return jsonResponse({
        projectId: 'proj-123',
        use_case_type: 'embeddings',
        strategy_preset: 'cloud_first',
        logical_model: 'dyno-embeddings-1',
        fallback_enabled: true,
        upstream_provider_type: 'openai_compatible',
        upstream_base_url: 'http://project-upstream.test',
        upstream_model: 'text-embedding-3-small',
        upstream_api_key: 'project-key',
        local_model: null,
        cloud_model: null,
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    throw new Error(`Unexpected URL in project-context test: ${url}`);
  }) as typeof global.fetch;

  const context = await resolveProjectContext('dyno_live_test_key');
  assert.equal(context.upstreamBaseUrl, 'http://project-upstream.test');
  assert.equal(context.upstreamApiKey, 'project-key');
  assert.equal(context.upstreamModel, 'text-embedding-3-small');
});

test('resolveProjectContext falls back to cloud_model when upstream_model is missing', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === getResolverConfigUrl('http://resolver.test')) {
      return jsonResponse({
        projectId: 'proj-legacy',
        use_case_type: 'embeddings',
        strategy_preset: 'balanced',
        fallback_enabled: true,
        upstream_base_url: 'http://project-upstream.test',
        upstream_api_key: 'project-key',
        cloud_model: 'text-embedding-3-small',
        local_model: 'Xenova/all-MiniLM-L6-v2',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    throw new Error(`Unexpected URL in legacy compatibility test: ${url}`);
  }) as typeof global.fetch;

  const context = await resolveProjectContext('dyno_live_test_key');
  assert.equal(context.upstreamModel, 'text-embedding-3-small');
});

test('resolveProjectContext respects DYNO_CONFIG_RESOLVER_CONFIG_PATH override', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_CONFIG_RESOLVER_CONFIG_PATH = '/api/custom/sdk-config';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/custom/sdk-config') {
      return jsonResponse({
        projectId: 'proj-override',
        use_case_type: 'embeddings',
        strategy_preset: 'local_first',
        fallback_enabled: true,
        upstream_base_url: 'http://project-upstream.test',
        upstream_api_key: 'project-key',
        upstream_model: 'text-embedding-3-small',
        local_model: null,
        cloud_model: 'text-embedding-3-small',
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      });
    }
    throw new Error(`Unexpected URL in path override test: ${url}`);
  }) as typeof global.fetch;

  const context = await resolveProjectContext('dyno_live_test_key');
  assert.equal(context.projectId, 'proj-override');
  assert.equal(context.upstreamModel, 'text-embedding-3-small');
});

test('resolveProjectContext maps invalid_api_key from resolver', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === getResolverConfigUrl('http://resolver.test')) {
      return jsonResponse({ error: 'unauthorized', code: 'invalid_api_key' }, 401);
    }
    throw new Error(`Unexpected URL in invalid key test: ${url}`);
  }) as typeof global.fetch;

  await assert.rejects(
    () => resolveProjectContext('dyno_live_invalid'),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'invalid_api_key',
  );
});

test('resolveProjectContext maps project_config_not_found from resolver', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === getResolverConfigUrl('http://resolver.test')) {
      return jsonResponse({ error: 'not_found', code: 'project_config_not_found' }, 404);
    }
    throw new Error(`Unexpected URL in not-found test: ${url}`);
  }) as typeof global.fetch;

  await assert.rejects(
    () => resolveProjectContext('dyno_live_missing'),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'project_config_not_found',
  );
});
