import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  Project,
  ProjectApiKeyListItem,
  ProjectConfig,
  ProjectRequestExecution,
} from '@/lib/data/dashboard-types'
import { buildProjectPageViewModel } from '@/lib/data/project-page-view-model'

function createProject(): Project {
  return {
    id: 'proj_12345678',
    workspace_id: 'ws_123',
    name: 'Embeddings Project',
    description: null,
    use_case_type: 'embeddings',
    strategy_preset: 'balanced',
    status: 'active',
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-01T12:00:00.000Z',
  }
}

function createConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: 'cfg_123',
    project_id: 'proj_12345678',
    local_model: 'Xenova/all-MiniLM-L6-v2',
    cloud_model: 'text-embedding-3-small',
    logical_model: 'dyno-embeddings-1',
    upstream_provider_type: 'openai_compatible',
    upstream_base_url: 'https://api.openai.com/v1',
    upstream_model: 'text-embedding-3-small',
    fallback_enabled: true,
    upstream_api_key_configured: true,
    upstream_api_key_last_updated_at: '2026-04-01T12:10:00.000Z',
    battery_min_percent: null,
    idle_min_seconds: null,
    requires_charging: false,
    wifi_only: false,
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-01T12:00:00.000Z',
    ...overrides,
  }
}

function createApiKey(overrides: Partial<ProjectApiKeyListItem> = {}): ProjectApiKeyListItem {
  return {
    id: 'key_1',
    project_id: 'proj_12345678',
    label: 'Primary',
    key_prefix: 'dyno_live_123',
    created_at: '2026-04-02T12:00:00.000Z',
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  }
}

function createRequest(overrides: Partial<ProjectRequestExecution> = {}): ProjectRequestExecution {
  return {
    id: 'req_1',
    project_id: 'proj_12345678',
    api_key_id: 'key_1',
    api_key_label: 'Primary',
    endpoint: '/v1/embeddings',
    use_case: 'embeddings',
    logical_model: 'dyno-embeddings-1',
    execution_path: 'local',
    execution_reason: 'local_available',
    status: 'success',
    http_status: 200,
    latency_ms: 120,
    input_count: 1,
    error_type: null,
    error_code: null,
    request_id: 'r1',
    created_at: '2026-04-03T12:00:00.000Z',
    ...overrides,
  }
}

test('buildProjectPageViewModel marks configured project as ready', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey()],
    recentRequests: [createRequest()],
  })

  assert.equal(result.health.readyForRequests, true)
  assert.equal(result.health.fallbackConfigured, true)
  assert.equal(result.health.upstreamApiKeyConfigured, true)
  assert.equal(result.health.activeApiKeyCount, 1)
  assert.equal(result.health.lastRequest?.status, 'success')
  assert.equal(result.health.lastRequest?.executionPath, 'local')
})

test('buildProjectPageViewModel marks incomplete fallback setup', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({
      upstream_base_url: null,
      fallback_enabled: true,
    }),
    apiKeys: [createApiKey()],
    recentRequests: [],
  })

  assert.equal(result.health.fallbackConfigured, false)
  assert.equal(result.guidance.needsFallbackSetup, true)
  assert.equal(result.health.readyForRequests, false)
})

test('integration snippet reflects logical model', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({ logical_model: 'dyno-embeddings-custom' }),
    apiKeys: [createApiKey()],
    recentRequests: [],
  })

  assert.match(result.integration.openAiSnippet, /model: 'dyno-embeddings-custom'/)
  assert.match(result.integration.curlSnippet, /"model":"dyno-embeddings-custom"/)
})

test('no-api-key and no-requests guidance are set', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey({ revoked_at: '2026-04-05T00:00:00.000Z' })],
    recentRequests: [],
  })

  assert.equal(result.guidance.needsDynoApiKey, true)
  assert.equal(result.guidance.hasNoRequests, true)
  assert.equal(result.health.readyForRequests, false)
})

test('recent request summary uses only current project inputs', () => {
  const requests = [
    createRequest({ id: 'req_2', status: 'error', execution_path: 'cloud' }),
    createRequest({ id: 'req_3', status: 'success', execution_path: 'local' }),
  ]
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey()],
    recentRequests: requests,
  })

  assert.equal(result.health.recentRequestCount, 2)
  assert.equal(result.health.recentFailureCount, 1)
  assert.equal(result.health.recentSuccessCount, 1)
  assert.equal(result.health.cloudExecutionCount, 1)
  assert.equal(result.health.localExecutionCount, 1)
  assert.equal(result.health.lastRequest?.status, 'error')
})

test('project view model does not expose secret values', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey()],
    recentRequests: [],
  })

  const json = JSON.stringify(result)
  assert.equal(json.includes('upstream_api_key_encrypted'), false)
  assert.equal(json.includes('sk-live'), false)
  assert.equal('upstreamApiKey' in (result as unknown as Record<string, unknown>), false)
})
