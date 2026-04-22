import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  Project,
  ProjectApiKeyListItem,
  ProjectConfig,
  ProjectRequestExecution,
  ProjectValueSummaryExecution,
} from '@/lib/data/dashboard-types'
import {
  DEFAULT_ESTIMATED_CLOUD_COST_PER_REQUEST_USD,
  buildProjectOperationalSignals,
  buildProjectPageViewModel,
  buildProjectValueSummary,
} from '@/lib/data/project-page-view-model'

function createProject(overrides: Partial<Project> = {}): Project {
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
    ...overrides,
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
    estimated_cloud_cost_per_request_usd: null,
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

function toValueSummaryExecution(
  request: ProjectRequestExecution,
  overrides: Partial<ProjectValueSummaryExecution> = {},
): ProjectValueSummaryExecution {
  return {
    project_id: request.project_id,
    status: request.status,
    execution_path: request.execution_path,
    execution_reason: request.execution_reason,
    error_type: request.error_type,
    error_code: request.error_code,
    created_at: request.created_at,
    ...overrides,
  }
}

test('buildProjectPageViewModel marks configured project as ready', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey()],
    recentRequests: [createRequest()],
    valueSummaryExecutions: [],
  })

  assert.equal(result.health.readyForRequests, true)
  assert.equal(result.health.fallbackConfigured, true)
  assert.equal(result.health.upstreamApiKeyConfigured, true)
  assert.equal(result.health.activeApiKeyCount, 1)
  assert.equal(result.health.lastRequest?.status, 'success')
  assert.equal(result.health.lastRequest?.executionPath, 'local')
  assert.equal(result.capability.notYetActiveControls.length > 0, true)
  assert.equal(
    result.capability.notYetActiveControls.some((control) => control.key === 'batteryMinPercent'),
    true,
  )
  assert.match(result.capability.matrixVersion, /phase5-capability-truth-audit/)
})

test('buildProjectPageViewModel remains ready without hosted relay API key', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({
      upstream_api_key_configured: false,
      upstream_api_key_last_updated_at: null,
      fallback_enabled: true,
      upstream_base_url: 'https://api.openai.com/v1',
      upstream_model: 'text-embedding-3-small',
    }),
    apiKeys: [createApiKey()],
    recentRequests: [createRequest()],
    valueSummaryExecutions: [],
  })

  assert.equal(result.health.fallbackConfigured, true)
  assert.equal(result.health.upstreamApiKeyConfigured, false)
  assert.equal(result.health.readyForRequests, true)
  assert.equal(result.setupJourney.steps[0]?.status, 'done')
})

test('buildProjectPageViewModel marks incomplete fallback setup', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({
      upstream_base_url: null,
      fallback_enabled: true,
      local_model: null,
    }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: [],
  })

  assert.equal(result.health.fallbackConfigured, false)
  assert.equal(result.guidance.needsFallbackSetup, true)
  assert.equal(result.health.readyForRequests, false)
  assert.equal(result.setupJourney.steps[0]?.key, 'configure_cloud_fallback')
  assert.equal(result.setupJourney.steps[0]?.status, 'ready')
  assert.equal(result.setupJourney.steps[1]?.key, 'configure_local_model')
  assert.equal(result.setupJourney.steps[1]?.optional, true)
  assert.equal(result.setupJourney.steps[1]?.status, 'todo')
  assert.equal(result.setupJourney.steps[2]?.key, 'create_dyno_api_key')
  assert.equal(result.setupJourney.steps[2]?.status, 'done')
  assert.equal(result.setupJourney.steps[4]?.key, 'send_first_request')
  assert.equal(result.setupJourney.steps[4]?.status, 'blocked')
})

test('setup journey reaches completion after first successful request', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({
      local_model: 'Xenova/all-MiniLM-L6-v2',
      fallback_enabled: true,
      upstream_base_url: 'https://api.openai.com/v1',
      upstream_model: 'text-embedding-3-small',
      upstream_api_key_configured: true,
    }),
    apiKeys: [createApiKey()],
    recentRequests: [createRequest({ status: 'success' })],
    valueSummaryExecutions: [],
  })

  assert.equal(result.setupJourney.allComplete, true)
  assert.equal(result.setupJourney.completedCount, result.setupJourney.totalCount)
  assert.equal(result.setupJourney.steps.every((step) => step.status === 'done' || step.optional), true)
  assert.match(result.setupJourney.completionMessage ?? '', /Ready for first production test/)
})

test('setup journey points first request step to dashboard request tester', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({
      fallback_enabled: true,
      upstream_base_url: 'https://api.openai.com/v1',
      upstream_model: 'text-embedding-3-small',
      upstream_api_key_configured: true,
    }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: [],
  })

  const firstRequestStep = result.setupJourney.steps.find((step) => step.key === 'send_first_request')
  assert.equal(firstRequestStep?.status, 'ready')
  assert.equal(firstRequestStep?.actionHref, '#request-tester')
})

test('integration snippet reflects logical model', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({ logical_model: 'dyno-embeddings-custom' }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: [],
  })

  assert.match(result.integration.openAiSnippet, /model: 'dyno-embeddings-custom'/)
  assert.match(result.integration.curlSnippet, /"model":"dyno-embeddings-custom"/)
  assert.match(result.integration.sdkSnippet, /Dyno\.init\(\{/)
  assert.match(result.integration.sdkSnippet, /Project: 'proj_12345678'/)
  assert.match(result.integration.sdkSnippet, /dyno\.embedText\('hello world'\)/)
  assert.match(result.integration.sdkSnippet, /dyno\.getStatus\(\)/)
  assert.match(result.integration.sdkSnippet, /dyno\.shutdown\(\)/)
  assert.doesNotMatch(result.integration.sdkSnippet, /dyno\.sdk\.createJob/)
  assert.doesNotMatch(result.integration.sdkSnippet, /Runtime Manager|runtime manager|startup hooks/)
  assert.match(result.integration.openAiSnippet, /Optional hosted OpenAI-compatible API/)
})

test('text generation projects default to chat logical model and chat snippets', () => {
  const result = buildProjectPageViewModel({
    project: createProject({ use_case_type: 'text_generation' }),
    config: createConfig({
      logical_model: '',
    }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: [],
  })

  assert.equal(result.integration.logicalModel, 'dyno-chat-1')
  assert.match(result.integration.sdkSnippet, /dyno\.embedText\('hello world'\)/)
  assert.doesNotMatch(result.integration.sdkSnippet, /dyno\.sdk\.createJob/)
  assert.match(result.integration.openAiSnippet, /client\.chat\.completions\.create/)
  assert.match(result.integration.curlSnippet, /\/chat\/completions/)
})

test('no-api-key and no-requests guidance are set', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey({ revoked_at: '2026-04-05T00:00:00.000Z' })],
    recentRequests: [],
    valueSummaryExecutions: [],
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
    valueSummaryExecutions: [],
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
    valueSummaryExecutions: [],
  })

  const json = JSON.stringify(result)
  assert.equal(json.includes('upstream_api_key_encrypted'), false)
  assert.equal(json.includes('sk-live'), false)
  assert.equal('upstreamApiKey' in (result as unknown as Record<string, unknown>), false)
})

test('value summary computes local/cloud totals and costs with default estimate', () => {
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'cloud' })),
  ]
  const summary = buildProjectValueSummary({
    projectId: 'proj_12345678',
    executions,
    estimatedCloudCostPerRequestUsd: null,
  })

  assert.equal(summary.totalRequests, 3)
  assert.equal(summary.localRequests, 2)
  assert.equal(summary.cloudRequests, 1)
  assert.equal(summary.localPercentage, 2 / 3)
  assert.equal(
    summary.estimatedAvoidedCostUsd,
    2 * DEFAULT_ESTIMATED_CLOUD_COST_PER_REQUEST_USD,
  )
  assert.equal(summary.estimatedCloudCostUsd, DEFAULT_ESTIMATED_CLOUD_COST_PER_REQUEST_USD)
})

test('value summary excludes errors and unknown execution path from cost totals', () => {
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ status: 'error', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ status: 'error', execution_path: 'cloud' })),
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'unknown' })),
  ]
  const summary = buildProjectValueSummary({
    projectId: 'proj_12345678',
    executions,
    estimatedCloudCostPerRequestUsd: 0.5,
  })

  assert.equal(summary.totalRequests, 0)
  assert.equal(summary.localRequests, 0)
  assert.equal(summary.cloudRequests, 0)
  assert.equal(summary.localPercentage, 0)
  assert.equal(summary.estimatedAvoidedCostUsd, 0)
  assert.equal(summary.estimatedCloudCostUsd, 0)
})

test('value summary uses project-configured cloud cost override', () => {
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ status: 'success', execution_path: 'cloud' })),
  ]
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({ estimated_cloud_cost_per_request_usd: 0.25 }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: executions,
  })

  assert.equal(result.valueSummary.estimatedCloudCostPerRequestUsd, 0.25)
  assert.equal(result.valueSummary.estimatedAvoidedCostUsd, 0.25)
  assert.equal(result.valueSummary.estimatedCloudCostUsd, 0.25)
})

test('value summary includes successful chat executions in totals', () => {
  const chatRequest = createRequest({
    endpoint: '/v1/chat/completions',
    use_case: 'text_generation',
    logical_model: 'dyno-chat-1',
    execution_path: 'cloud',
  })
  const executions: ProjectValueSummaryExecution[] = [toValueSummaryExecution(chatRequest)]
  const summary = buildProjectValueSummary({
    projectId: 'proj_12345678',
    executions,
    estimatedCloudCostPerRequestUsd: 0.5,
  })

  assert.equal(summary.totalRequests, 1)
  assert.equal(summary.localRequests, 0)
  assert.equal(summary.cloudRequests, 1)
  assert.equal(summary.estimatedCloudCostUsd, 0.5)
})

test('value summary returns clean zero state when there are no successful local/cloud requests', () => {
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig(),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: [],
  })

  assert.equal(result.valueSummary.totalRequests, 0)
  assert.equal(result.valueSummary.localRequests, 0)
  assert.equal(result.valueSummary.cloudRequests, 0)
  assert.equal(result.valueSummary.localPercentage, 0)
  assert.equal(result.valueSummary.estimatedAvoidedCostUsd, 0)
  assert.equal(result.valueSummary.estimatedCloudCostUsd, 0)
})

test('value summary only counts executions from the current project', () => {
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ project_id: 'proj_12345678', execution_path: 'local' })),
    toValueSummaryExecution(
      createRequest({ project_id: 'proj_other', execution_path: 'local' }),
      { project_id: 'proj_other' },
    ),
  ]
  const summary = buildProjectValueSummary({
    projectId: 'proj_12345678',
    executions,
    estimatedCloudCostPerRequestUsd: 1,
  })

  assert.equal(summary.totalRequests, 1)
  assert.equal(summary.localRequests, 1)
  assert.equal(summary.cloudRequests, 0)
})

test('operational signals provide zero-state defaults for sparse telemetry', () => {
  const signals = buildProjectOperationalSignals({
    projectId: 'proj_12345678',
    executions: [],
    windowDays: 7,
  })

  assert.equal(signals.localHitRate, 0)
  assert.equal(signals.localHitRateSampleSize, 0)
  assert.equal(signals.confidence.level, 'low')
  assert.equal(signals.fallbackReasonBuckets.length, 0)
  assert.equal(signals.reliabilityTrend.length, 7)
  assert.equal(signals.reliabilitySummary.direction, 'insufficient_data')
})

test('operational signals map fallback reasons into stable buckets', () => {
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ execution_path: 'cloud', execution_reason: 'policy_cloud_first' })),
    toValueSummaryExecution(createRequest({ execution_path: 'cloud', execution_reason: 'runtime_unavailable' })),
    toValueSummaryExecution(
      createRequest({ execution_path: 'cloud', execution_reason: 'runtime_unavailable', status: 'error' }),
    ),
    toValueSummaryExecution(
      createRequest({ execution_path: 'cloud', execution_reason: 'sdk_timeout', status: 'error' }),
    ),
  ]
  const signals = buildProjectOperationalSignals({
    projectId: 'proj_12345678',
    executions,
    windowDays: 7,
  })

  assert.equal(signals.fallbackReasonBuckets.length >= 3, true)
  assert.equal(signals.fallbackReasonBuckets[0]?.key, 'local_runtime_unavailable')
  assert.equal(signals.fallbackReasonBuckets[0]?.count, 2)
  assert.equal(
    signals.fallbackReasonBuckets.some((bucket) => bucket.key === 'policy_routed_to_cloud'),
    true,
  )
  assert.equal(
    signals.fallbackReasonBuckets.some((bucket) => bucket.key === 'local_timeout_fallback'),
    true,
  )
})

test('operational signals compute reliability trend direction from daily error rate', () => {
  const now = new Date()
  const day = (offset: number) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset))
    return date.toISOString()
  }
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ created_at: day(1), status: 'success', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ created_at: day(1), status: 'success', execution_path: 'cloud' })),
    toValueSummaryExecution(createRequest({ created_at: day(0), status: 'error', execution_path: 'local' })),
    toValueSummaryExecution(
      createRequest({
        created_at: day(0),
        status: 'error',
        execution_path: 'cloud',
        error_code: 'timeout',
        execution_reason: 'runtime_timeout',
      }),
    ),
  ]
  const signals = buildProjectOperationalSignals({
    projectId: 'proj_12345678',
    executions,
    windowDays: 7,
  })

  assert.equal(signals.reliabilitySummary.direction, 'degrading')
  const latest = signals.reliabilityTrend.at(-1)
  assert.equal(latest?.errorCount, 2)
  assert.equal(latest?.timeoutCount, 1)
})

test('pilot proof-pack exports align with computed KPI telemetry and caveats', () => {
  const now = new Date()
  const day = (offset: number) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset))
    return date.toISOString()
  }
  const executions: ProjectValueSummaryExecution[] = [
    toValueSummaryExecution(createRequest({ created_at: day(2), status: 'success', execution_path: 'local' })),
    toValueSummaryExecution(createRequest({ created_at: day(1), status: 'success', execution_path: 'cloud', execution_reason: 'policy_cloud_first' })),
    toValueSummaryExecution(
      createRequest({
        created_at: day(0),
        status: 'error',
        execution_path: 'cloud',
        execution_reason: 'runtime_timeout',
        error_code: 'timeout',
      }),
    ),
  ]
  const result = buildProjectPageViewModel({
    project: createProject(),
    config: createConfig({ estimated_cloud_cost_per_request_usd: 0.2 }),
    apiKeys: [createApiKey()],
    recentRequests: [],
    valueSummaryExecutions: executions,
  })

  assert.equal(result.pilotProofPack.kpis.schemaVersion, 'pilot-kpi-v1')
  assert.equal(result.pilotProofPack.kpis.localHitRate, result.operationalSignals.localHitRate)
  assert.equal(
    result.pilotProofPack.kpis.fallbackReasonBuckets[0]?.key,
    result.operationalSignals.fallbackReasonBuckets[0]?.key,
  )
  assert.equal(
    result.pilotProofPack.kpis.reliabilitySummary.direction,
    result.operationalSignals.reliabilitySummary.direction,
  )
  assert.match(result.pilotProofPack.exports.markdown, /Directional signals from best-effort telemetry/)
  assert.match(result.pilotProofPack.exports.csv, /directional_caveat/)
  assert.match(result.pilotProofPack.exports.json, /"schemaVersion": "pilot-kpi-v1"/)
})
