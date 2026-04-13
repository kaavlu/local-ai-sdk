import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { resolveProjectContext } from '../project-context.js';

const originalFetch = global.fetch;
const originalEnv = {
  DYNO_CONFIG_RESOLVER_URL: process.env.DYNO_CONFIG_RESOLVER_URL,
  DYNO_CONFIG_RESOLVER_SECRET: process.env.DYNO_CONFIG_RESOLVER_SECRET,
  DYNO_UPSTREAM_BASE_URL: process.env.DYNO_UPSTREAM_BASE_URL,
  DYNO_UPSTREAM_API_KEY: process.env.DYNO_UPSTREAM_API_KEY,
  DYNO_UPSTREAM_MODEL: process.env.DYNO_UPSTREAM_MODEL,
};

afterEach(() => {
  global.fetch = originalFetch;
  process.env.DYNO_CONFIG_RESOLVER_URL = originalEnv.DYNO_CONFIG_RESOLVER_URL;
  process.env.DYNO_CONFIG_RESOLVER_SECRET = originalEnv.DYNO_CONFIG_RESOLVER_SECRET;
  process.env.DYNO_UPSTREAM_BASE_URL = originalEnv.DYNO_UPSTREAM_BASE_URL;
  process.env.DYNO_UPSTREAM_API_KEY = originalEnv.DYNO_UPSTREAM_API_KEY;
  process.env.DYNO_UPSTREAM_MODEL = originalEnv.DYNO_UPSTREAM_MODEL;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

test('resolveProjectContext prefers canonical project upstream over env fallback', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';
  process.env.DYNO_UPSTREAM_BASE_URL = 'http://env-upstream.test';
  process.env.DYNO_UPSTREAM_API_KEY = 'env-key';
  process.env.DYNO_UPSTREAM_MODEL = 'env-model';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/project-config/proj-123') {
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

  const context = await resolveProjectContext('proj-123');
  assert.equal(context.upstreamBaseUrl, 'http://project-upstream.test');
  assert.equal(context.upstreamApiKey, 'project-key');
  assert.equal(context.upstreamModel, 'text-embedding-3-small');
});

test('resolveProjectContext falls back to cloud_model when upstream_model is missing', async () => {
  process.env.DYNO_CONFIG_RESOLVER_URL = 'http://resolver.test';

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://resolver.test/api/demo/project-config/proj-legacy') {
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

  const context = await resolveProjectContext('proj-legacy');
  assert.equal(context.upstreamModel, 'text-embedding-3-small');
});
