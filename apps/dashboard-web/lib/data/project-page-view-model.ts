import type {
  Project,
  ProjectApiKeyListItem,
  ProjectConfig,
  ProjectRequestExecution,
  ProjectValueSummaryExecution,
} from '@/lib/data/dashboard-types'
import {
  PROJECT_CAPABILITY_MATRIX_VERSION,
  PROJECT_RUNTIME_CONTROL_CAPABILITIES,
  isCapabilityEditable,
  type RuntimeControlCapability,
} from '@/lib/data/project-capability-matrix'

const DEFAULT_DYNO_BASE_URL = 'http://127.0.0.1:8788/v1'
const DEFAULT_EMBEDDINGS_LOGICAL_MODEL = 'dyno-embeddings-1'
const DEFAULT_CHAT_LOGICAL_MODEL = 'dyno-chat-1'
export const VALUE_SUMMARY_WINDOW_DAYS = 7
export const DEFAULT_ESTIMATED_CLOUD_COST_PER_REQUEST_USD = 0.0001

export interface ProjectValueSummary {
  windowLabel: string
  totalRequests: number
  localRequests: number
  cloudRequests: number
  localPercentage: number
  estimatedCloudCostPerRequestUsd: number
  estimatedAvoidedCostUsd: number
  estimatedCloudCostUsd: number
  estimatedEquivalentCloudCostUsd: number
}

export interface ProjectFallbackReasonBucket {
  key: string
  label: string
  count: number
  share: number
}

export interface ProjectReliabilityTrendPoint {
  label: string
  totalRequests: number
  errorCount: number
  timeoutCount: number
  errorRate: number
}

export interface ProjectPilotConfidence {
  level: 'low' | 'medium' | 'high'
  sampleSize: number
  mediumThreshold: number
  highThreshold: number
  summary: string
}

export interface ProjectOperationalSignals {
  windowLabel: string
  directionalCaveat: string
  confidence: ProjectPilotConfidence
  localHitRate: number
  localHitRateSampleSize: number
  fallbackReasonBuckets: ProjectFallbackReasonBucket[]
  reliabilityTrend: ProjectReliabilityTrendPoint[]
  reliabilitySummary: {
    latestErrorRate: number
    previousErrorRate: number | null
    direction: 'improving' | 'degrading' | 'stable' | 'insufficient_data'
  }
}

export interface ProjectPilotKpiSchema {
  schemaVersion: 'pilot-kpi-v1'
  generatedAt: string
  windowLabel: string
  directionalCaveat: string
  localHitRate: number
  localHitRateSampleSize: number
  confidence: ProjectPilotConfidence
  fallbackReasonBuckets: ProjectFallbackReasonBucket[]
  reliabilitySummary: ProjectOperationalSignals['reliabilitySummary']
  reliabilityTrend: ProjectReliabilityTrendPoint[]
  estimatedCostImpact: {
    estimatedCloudCostPerRequestUsd: number
    estimatedAvoidedCostUsd: number
    estimatedCloudCostUsd: number
    estimatedEquivalentCloudCostUsd: number
  }
}

export interface ProjectPilotProofPack {
  kpis: ProjectPilotKpiSchema
  exports: {
    json: string
    csv: string
    markdown: string
  }
}

export type ProjectSetupJourneyStepStatus = 'todo' | 'blocked' | 'ready' | 'done'

export interface ProjectSetupJourneyStep {
  key:
    | 'configure_cloud_fallback'
    | 'configure_local_model'
    | 'create_dyno_api_key'
    | 'copy_sdk_snippet'
    | 'send_first_request'
  title: string
  description: string
  status: ProjectSetupJourneyStepStatus
  optional?: boolean
  blockerReason?: string
  actionLabel: string
  actionHref: string
}

export interface ProjectPageViewModel {
  project: Project
  config: ProjectConfig | null
  apiKeys: ProjectApiKeyListItem[]
  recentRequests: ProjectRequestExecution[]
  integration: {
    baseUrl: string
    logicalModel: string
    sdkSnippet: string
    openAiSnippet: string
    curlSnippet: string
  }
  health: {
    readyForRequests: boolean
    fallbackConfigured: boolean
    upstreamApiKeyConfigured: boolean
    activeApiKeyCount: number
    hasApiKeys: boolean
    recentRequestCount: number
    recentSuccessCount: number
    recentFailureCount: number
    localExecutionCount: number
    cloudExecutionCount: number
    lastRequest: {
      createdAt: string
      status: 'success' | 'error'
      executionPath: 'local' | 'cloud' | 'unknown' | null
    } | null
  }
  guidance: {
    needsFallbackSetup: boolean
    needsDynoApiKey: boolean
    hasNoRequests: boolean
    hasRecentFailures: boolean
  }
  setupJourney: {
    steps: ProjectSetupJourneyStep[]
    completedCount: number
    totalCount: number
    allComplete: boolean
    completionMessage: string | null
  }
  capability: {
    matrixVersion: string
    controls: RuntimeControlCapability[]
    editableControlCount: number
    notYetActiveControls: RuntimeControlCapability[]
  }
  valueSummary: ProjectValueSummary
  operationalSignals: ProjectOperationalSignals
  pilotProofPack: ProjectPilotProofPack
}

function getDefaultLogicalModel(useCaseType: string): string {
  return useCaseType === 'text_generation' ? DEFAULT_CHAT_LOGICAL_MODEL : DEFAULT_EMBEDDINGS_LOGICAL_MODEL
}

function toBaseUrlValue(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DYNO_BASE_URL?.trim()
  if (!fromEnv) {
    return DEFAULT_DYNO_BASE_URL
  }
  return fromEnv.replace(/\/+$/, '')
}

export function buildOpenAiEmbeddingsSnippet(input: { baseUrl: string; logicalModel: string }) {
  return [
    "import OpenAI from 'openai'",
    '',
    '// Optional hosted OpenAI-compatible API (sandbox/demos/tooling).',
    'const client = new OpenAI({',
    '  apiKey: process.env.DYNO_API_KEY,',
    `  baseURL: '${input.baseUrl}',`,
    '})',
    '',
    'const response = await client.embeddings.create({',
    `  model: '${input.logicalModel}',`,
    "  input: 'hello world',",
    '})',
    '',
    'console.log(response.data[0]?.embedding?.length)',
  ].join('\n')
}

export function buildSdkEmbeddingsSnippet(input: { projectId: string }) {
  return [
    "import OpenAI from 'openai'",
    "import { Dyno } from '@dynosdk/ts'",
    '',
    'const provider = new OpenAI({',
    '  apiKey: process.env.OPENAI_API_KEY!,',
    '})',
    '',
    'const dyno = await Dyno.init({',
    '  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,',
    '  fallback: {',
    '    adapter: async ({ text }) => {',
    '      const response = await provider.embeddings.create({',
    "        model: 'text-embedding-3-small',",
    '        input: text,',
    '      })',
    '      return { embedding: response.data[0]!.embedding }',
    '    },',
    '  },',
    '})',
    '',
    `// Project: '${input.projectId}'`,
    "const result = await dyno.embedText('hello world')",
    'console.log(result.decision, result.reason, result.embedding.length)',
    '',
    'const status = await dyno.getStatus()',
    'console.log(status.runtime.ready, status.runtime.runtimeSource)',
    '',
    'await dyno.shutdown()',
  ].join('\n')
}

export function buildCurlEmbeddingsSnippet(input: { baseUrl: string; logicalModel: string }) {
  return [
    `curl -s -X POST ${input.baseUrl}/embeddings \\`,
    "  -H 'Authorization: Bearer '$DYNO_API_KEY \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{"model":"${input.logicalModel}","input":"hello world"}'`,
  ].join('\n')
}

export function buildOpenAiChatSnippet(input: { baseUrl: string; logicalModel: string }) {
  return [
    "import OpenAI from 'openai'",
    '',
    '// Optional hosted OpenAI-compatible API (sandbox/demos/tooling).',
    'const client = new OpenAI({',
    '  apiKey: process.env.DYNO_API_KEY,',
    `  baseURL: '${input.baseUrl}',`,
    '})',
    '',
    'const response = await client.chat.completions.create({',
    `  model: '${input.logicalModel}',`,
    "  messages: [{ role: 'user', content: 'Hello' }],",
    '})',
    '',
    'console.log(response.choices[0]?.message?.content)',
  ].join('\n')
}

export function buildCurlChatSnippet(input: { baseUrl: string; logicalModel: string }) {
  return [
    `curl -s -X POST ${input.baseUrl}/chat/completions \\`,
    "  -H 'Authorization: Bearer '$DYNO_API_KEY \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '{"model":"${input.logicalModel}","messages":[{"role":"user","content":"Hello"}]}'`,
  ].join('\n')
}

export function buildProjectValueSummary(input: {
  projectId: string
  executions: ProjectValueSummaryExecution[]
  estimatedCloudCostPerRequestUsd: number | null
  windowDays?: number
}): ProjectValueSummary {
  const localRequests = input.executions.filter(
    (execution) =>
      execution.project_id === input.projectId &&
      execution.status === 'success' &&
      execution.execution_path === 'local',
  ).length
  const cloudRequests = input.executions.filter(
    (execution) =>
      execution.project_id === input.projectId &&
      execution.status === 'success' &&
      execution.execution_path === 'cloud',
  ).length
  const totalRequests = localRequests + cloudRequests
  const localPercentage = totalRequests > 0 ? localRequests / totalRequests : 0
  const estimatedCloudCostPerRequestUsd =
    input.estimatedCloudCostPerRequestUsd == null
      ? DEFAULT_ESTIMATED_CLOUD_COST_PER_REQUEST_USD
      : input.estimatedCloudCostPerRequestUsd
  const estimatedAvoidedCostUsd = localRequests * estimatedCloudCostPerRequestUsd
  const estimatedCloudCostUsd = cloudRequests * estimatedCloudCostPerRequestUsd

  return {
    windowLabel: `Last ${input.windowDays ?? VALUE_SUMMARY_WINDOW_DAYS} days`,
    totalRequests,
    localRequests,
    cloudRequests,
    localPercentage,
    estimatedCloudCostPerRequestUsd,
    estimatedAvoidedCostUsd,
    estimatedCloudCostUsd,
    estimatedEquivalentCloudCostUsd: estimatedAvoidedCostUsd + estimatedCloudCostUsd,
  }
}

function toUtcDayKey(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString().slice(0, 10)
}

function buildFallbackReasonBuckets(input: {
  projectId: string
  executions: ProjectValueSummaryExecution[]
}): ProjectFallbackReasonBucket[] {
  const reasonCounts = new Map<string, { key: string; label: string; count: number }>()
  let totalCloudFallbackRequests = 0

  function addBucket(key: string, label: string) {
    const existing = reasonCounts.get(key)
    if (existing) {
      existing.count += 1
      return
    }
    reasonCounts.set(key, { key, label, count: 1 })
  }

  for (const execution of input.executions) {
    if (execution.project_id !== input.projectId || execution.execution_path !== 'cloud') {
      continue
    }
    totalCloudFallbackRequests += 1
    const reason = execution.execution_reason?.trim().toLowerCase()
    if (!reason) {
      addBucket('reason_unspecified', 'Reason not reported')
      continue
    }
    if (reason.includes('policy') || reason.includes('cloud_first')) {
      addBucket('policy_routed_to_cloud', 'Policy routed to cloud')
      continue
    }
    if (
      reason.includes('runtime_unavailable') ||
      reason.includes('runtime_not_available') ||
      reason.includes('local_unavailable') ||
      reason.includes('local_not_ready')
    ) {
      addBucket('local_runtime_unavailable', 'Local runtime unavailable')
      continue
    }
    if (reason.includes('timeout')) {
      addBucket('local_timeout_fallback', 'Local timeout fallback')
      continue
    }
    if (reason.includes('unsupported') || reason.includes('not_supported')) {
      addBucket('unsupported_for_local', 'Unsupported for local')
      continue
    }
    if (reason.includes('error') || reason.includes('failure')) {
      addBucket('local_error_fallback', 'Local error fallback')
      continue
    }
    addBucket('other', 'Other fallback reason')
  }

  if (totalCloudFallbackRequests === 0) {
    return []
  }

  return Array.from(reasonCounts.values())
    .map((item) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      share: item.count / totalCloudFallbackRequests,
    }))
    .sort((left, right) => right.count - left.count)
}

function isTimeoutLikeExecution(execution: ProjectValueSummaryExecution): boolean {
  const reason = execution.execution_reason?.toLowerCase() ?? ''
  const code = execution.error_code?.toLowerCase() ?? ''
  const type = execution.error_type?.toLowerCase() ?? ''
  return reason.includes('timeout') || code.includes('timeout') || type.includes('timeout')
}

function buildReliabilityTrend(input: {
  projectId: string
  executions: ProjectValueSummaryExecution[]
  windowDays: number
}): ProjectReliabilityTrendPoint[] {
  const days = Number.isFinite(input.windowDays) && input.windowDays > 0 ? Math.floor(input.windowDays) : 7
  const today = new Date()
  const dayKeys: string[] = []
  const aggregates = new Map<string, { totalRequests: number; errorCount: number; timeoutCount: number }>()

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset))
    const key = day.toISOString().slice(0, 10)
    dayKeys.push(key)
    aggregates.set(key, { totalRequests: 0, errorCount: 0, timeoutCount: 0 })
  }

  for (const execution of input.executions) {
    if (
      execution.project_id !== input.projectId ||
      (execution.execution_path !== 'local' && execution.execution_path !== 'cloud')
    ) {
      continue
    }
    const key = toUtcDayKey(execution.created_at)
    if (!key) {
      continue
    }
    const bucket = aggregates.get(key)
    if (!bucket) {
      continue
    }
    bucket.totalRequests += 1
    if (execution.status === 'error') {
      bucket.errorCount += 1
      if (isTimeoutLikeExecution(execution)) {
        bucket.timeoutCount += 1
      }
    }
  }

  return dayKeys.map((key) => {
    const bucket = aggregates.get(key) ?? { totalRequests: 0, errorCount: 0, timeoutCount: 0 }
    const [year, month, day] = key.split('-').map((value) => Number.parseInt(value, 10))
    const label = Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) ? key : `${month}/${day}`
    return {
      label,
      totalRequests: bucket.totalRequests,
      errorCount: bucket.errorCount,
      timeoutCount: bucket.timeoutCount,
      errorRate: bucket.totalRequests > 0 ? bucket.errorCount / bucket.totalRequests : 0,
    }
  })
}

function buildPilotConfidence(sampleSize: number): ProjectPilotConfidence {
  const mediumThreshold = 50
  const highThreshold = 200
  let level: ProjectPilotConfidence['level'] = 'low'
  if (sampleSize >= highThreshold) {
    level = 'high'
  } else if (sampleSize >= mediumThreshold) {
    level = 'medium'
  }

  if (level === 'high') {
    return {
      level,
      sampleSize,
      mediumThreshold,
      highThreshold,
      summary: `High directional confidence (${sampleSize} successful local/cloud executions in window).`,
    }
  }
  if (level === 'medium') {
    return {
      level,
      sampleSize,
      mediumThreshold,
      highThreshold,
      summary: `Medium directional confidence (${sampleSize} successful local/cloud executions in window).`,
    }
  }
  return {
    level,
    sampleSize,
    mediumThreshold,
    highThreshold,
    summary: `Low directional confidence (${sampleSize} successful local/cloud executions in window).`,
  }
}

function toFixed(value: number, digits = 4): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return value.toFixed(digits)
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function toCsvCell(value: string | number): string {
  const asString = String(value)
  if (asString.includes(',') || asString.includes('"') || asString.includes('\n')) {
    return `"${asString.replace(/"/g, '""')}"`
  }
  return asString
}

function buildPilotProofPack(input: {
  valueSummary: ProjectValueSummary
  operationalSignals: ProjectOperationalSignals
}): ProjectPilotProofPack {
  const generatedAt = new Date().toISOString()
  const kpis: ProjectPilotKpiSchema = {
    schemaVersion: 'pilot-kpi-v1',
    generatedAt,
    windowLabel: input.operationalSignals.windowLabel,
    directionalCaveat: input.operationalSignals.directionalCaveat,
    localHitRate: input.operationalSignals.localHitRate,
    localHitRateSampleSize: input.operationalSignals.localHitRateSampleSize,
    confidence: input.operationalSignals.confidence,
    fallbackReasonBuckets: input.operationalSignals.fallbackReasonBuckets,
    reliabilitySummary: input.operationalSignals.reliabilitySummary,
    reliabilityTrend: input.operationalSignals.reliabilityTrend,
    estimatedCostImpact: {
      estimatedCloudCostPerRequestUsd: input.valueSummary.estimatedCloudCostPerRequestUsd,
      estimatedAvoidedCostUsd: input.valueSummary.estimatedAvoidedCostUsd,
      estimatedCloudCostUsd: input.valueSummary.estimatedCloudCostUsd,
      estimatedEquivalentCloudCostUsd: input.valueSummary.estimatedEquivalentCloudCostUsd,
    },
  }

  const csvRows: Array<Array<string | number>> = [
    ['section', 'metric', 'value', 'notes'],
    ['summary', 'window_label', kpis.windowLabel, ''],
    ['summary', 'schema_version', kpis.schemaVersion, ''],
    ['summary', 'generated_at', kpis.generatedAt, 'UTC ISO-8601'],
    ['summary', 'directional_caveat', kpis.directionalCaveat, 'Use for trend visibility only'],
    ['summary', 'confidence_level', kpis.confidence.level, kpis.confidence.summary],
    ['summary', 'sample_size', kpis.localHitRateSampleSize, 'Successful local/cloud executions'],
    ['summary', 'local_hit_rate_pct', toPercent(kpis.localHitRate), 'Based on successful local/cloud executions'],
    ['cost', 'estimated_cloud_cost_per_request_usd', toFixed(kpis.estimatedCostImpact.estimatedCloudCostPerRequestUsd), 'Configurable'],
    ['cost', 'estimated_avoided_cost_usd', toFixed(kpis.estimatedCostImpact.estimatedAvoidedCostUsd), 'Directional estimate'],
    ['cost', 'estimated_cloud_cost_usd', toFixed(kpis.estimatedCostImpact.estimatedCloudCostUsd), 'Directional estimate'],
    [
      'cost',
      'estimated_equivalent_cloud_cost_usd',
      toFixed(kpis.estimatedCostImpact.estimatedEquivalentCloudCostUsd),
      'Directional estimate',
    ],
    ['reliability_summary', 'latest_error_rate_pct', toPercent(kpis.reliabilitySummary.latestErrorRate), 'Daily aggregate'],
    [
      'reliability_summary',
      'previous_error_rate_pct',
      kpis.reliabilitySummary.previousErrorRate == null ? 'n/a' : toPercent(kpis.reliabilitySummary.previousErrorRate),
      'Daily aggregate',
    ],
    ['reliability_summary', 'direction', kpis.reliabilitySummary.direction, 'Compared against previous populated day'],
  ]
  for (const bucket of kpis.fallbackReasonBuckets) {
    csvRows.push([
      'fallback_bucket',
      bucket.key,
      bucket.count,
      `${bucket.label} (${toPercent(bucket.share)})`,
    ])
  }
  for (const point of kpis.reliabilityTrend) {
    csvRows.push([
      'reliability_trend',
      point.label,
      toPercent(point.errorRate),
      `${point.errorCount} errors / ${point.timeoutCount} timeouts across ${point.totalRequests} requests`,
    ])
  }

  const topFallbackText =
    kpis.fallbackReasonBuckets.length === 0
      ? '- No cloud fallback executions captured in this window.'
      : kpis.fallbackReasonBuckets
          .slice(0, 3)
          .map((bucket) => `- ${bucket.label}: ${bucket.count} (${toPercent(bucket.share)})`)
          .join('\n')
  const reliabilityDirectionLabel =
    kpis.reliabilitySummary.direction === 'insufficient_data'
      ? 'insufficient data'
      : kpis.reliabilitySummary.direction
  const markdown = [
    `# Dyno Pilot Telemetry Proof-Pack`,
    '',
    `- Window: ${kpis.windowLabel}`,
    `- Generated at: ${kpis.generatedAt}`,
    `- Schema: ${kpis.schemaVersion}`,
    '',
    '## KPI snapshot',
    `- Local hit rate: ${toPercent(kpis.localHitRate)} (${kpis.localHitRateSampleSize} successful local/cloud executions)`,
    `- Confidence: ${kpis.confidence.level.toUpperCase()} (${kpis.confidence.summary})`,
    `- Latest error rate: ${toPercent(kpis.reliabilitySummary.latestErrorRate)} (${reliabilityDirectionLabel})`,
    `- Estimated avoided cloud cost: $${toFixed(kpis.estimatedCostImpact.estimatedAvoidedCostUsd, 6)}`,
    '',
    '## Top fallback reasons',
    topFallbackText,
    '',
    '## Caveat',
    `${kpis.directionalCaveat}`,
  ].join('\n')

  return {
    kpis,
    exports: {
      json: JSON.stringify(kpis, null, 2),
      csv: csvRows.map((row) => row.map((cell) => toCsvCell(cell)).join(',')).join('\n'),
      markdown,
    },
  }
}

export function buildProjectOperationalSignals(input: {
  projectId: string
  executions: ProjectValueSummaryExecution[]
  windowDays: number
}): ProjectOperationalSignals {
  const localSuccessful = input.executions.filter(
    (execution) =>
      execution.project_id === input.projectId &&
      execution.status === 'success' &&
      execution.execution_path === 'local',
  ).length
  const cloudSuccessful = input.executions.filter(
    (execution) =>
      execution.project_id === input.projectId &&
      execution.status === 'success' &&
      execution.execution_path === 'cloud',
  ).length
  const localHitRateSampleSize = localSuccessful + cloudSuccessful
  const localHitRate = localHitRateSampleSize > 0 ? localSuccessful / localHitRateSampleSize : 0
  const confidence = buildPilotConfidence(localHitRateSampleSize)
  const fallbackReasonBuckets = buildFallbackReasonBuckets({
    projectId: input.projectId,
    executions: input.executions,
  })
  const reliabilityTrend = buildReliabilityTrend({
    projectId: input.projectId,
    executions: input.executions,
    windowDays: input.windowDays,
  })
  const populatedDays = reliabilityTrend.filter((point) => point.totalRequests > 0)
  const latest = populatedDays.at(-1)
  const previous = populatedDays.length > 1 ? populatedDays.at(-2) : null
  let direction: ProjectOperationalSignals['reliabilitySummary']['direction'] = 'insufficient_data'
  if (latest && previous) {
    const delta = latest.errorRate - previous.errorRate
    if (delta >= 0.02) {
      direction = 'degrading'
    } else if (delta <= -0.02) {
      direction = 'improving'
    } else {
      direction = 'stable'
    }
  }

  return {
    windowLabel: `Last ${input.windowDays} days`,
    directionalCaveat: `Directional signals from best-effort telemetry. Sample size: ${localHitRateSampleSize} successful local/cloud executions (confidence: ${confidence.level}, medium >= ${confidence.mediumThreshold}, high >= ${confidence.highThreshold}). Use for trend monitoring, not exact accounting.`,
    confidence,
    localHitRate,
    localHitRateSampleSize,
    fallbackReasonBuckets,
    reliabilityTrend,
    reliabilitySummary: {
      latestErrorRate: latest?.errorRate ?? 0,
      previousErrorRate: previous?.errorRate ?? null,
      direction,
    },
  }
}

export function buildProjectPageViewModel(input: {
  project: Project
  config: ProjectConfig | null
  apiKeys: ProjectApiKeyListItem[]
  recentRequests: ProjectRequestExecution[]
  valueSummaryExecutions: ProjectValueSummaryExecution[]
}): ProjectPageViewModel {
  const baseUrl = toBaseUrlValue()
  const logicalModel = input.config?.logical_model?.trim() || getDefaultLogicalModel(input.project.use_case_type)
  const activeApiKeyCount = input.apiKeys.filter((key) => !key.revoked_at).length
  const recentSuccessCount = input.recentRequests.filter((request) => request.status === 'success').length
  const recentFailureCount = input.recentRequests.filter((request) => request.status === 'error').length
  const localExecutionCount = input.recentRequests.filter((request) => request.execution_path === 'local').length
  const cloudExecutionCount = input.recentRequests.filter((request) => request.execution_path === 'cloud').length
  const lastRequest = input.recentRequests.at(0)

  const fallbackConfigured = Boolean(
    input.config?.fallback_enabled &&
      input.config?.upstream_base_url?.trim() &&
      input.config?.upstream_model?.trim(),
  )
  const upstreamApiKeyConfigured = Boolean(input.config?.upstream_api_key_configured)
  const hasApiKeys = activeApiKeyCount > 0
  const fallbackReady = !input.config?.fallback_enabled || fallbackConfigured
  const readyForRequests = hasApiKeys && Boolean(logicalModel) && fallbackReady
  const valueSummary = buildProjectValueSummary({
    projectId: input.project.id,
    executions: input.valueSummaryExecutions,
    estimatedCloudCostPerRequestUsd: input.config?.estimated_cloud_cost_per_request_usd ?? null,
    windowDays: VALUE_SUMMARY_WINDOW_DAYS,
  })
  const operationalSignals = buildProjectOperationalSignals({
    projectId: input.project.id,
    executions: input.valueSummaryExecutions,
    windowDays: VALUE_SUMMARY_WINDOW_DAYS,
  })
  const pilotProofPack = buildPilotProofPack({
    valueSummary,
    operationalSignals,
  })
  const controls = Object.values(PROJECT_RUNTIME_CONTROL_CAPABILITIES)
  const editableControlCount = controls.filter((control) => isCapabilityEditable(control.state)).length
  const notYetActiveControls = controls.filter((control) => control.state === 'not_yet_active')
  const cloudFallbackReady = Boolean(input.config?.fallback_enabled && fallbackConfigured)
  const localModelConfigured = Boolean(input.config?.local_model?.trim())
  const firstSuccessfulRequestObserved = recentSuccessCount > 0
  const steps: ProjectSetupJourneyStep[] = [
    cloudFallbackReady
      ? {
          key: 'configure_cloud_fallback',
          title: 'Configure cloud fallback',
          description:
            'Set fallback provider URL and model in Runtime Configuration. App-owned credentials are the default path.',
          status: 'done',
          actionLabel: 'Review runtime config',
          actionHref: '#runtime-configuration',
        }
      : {
          key: 'configure_cloud_fallback',
          title: 'Configure cloud fallback',
          description:
            'Set fallback provider URL and model in Runtime Configuration. App-owned credentials are the default path.',
          status: 'ready',
          blockerReason: input.config?.fallback_enabled
            ? 'Fallback is enabled but incomplete.'
            : 'Fallback is disabled. Enable and configure it for reliable first success.',
          actionLabel: 'Configure cloud',
          actionHref: '#runtime-configuration',
        },
    localModelConfigured
      ? {
          key: 'configure_local_model',
          title: 'Configure local model (if available)',
          description: 'Choose a local model for on-device execution in Runtime Configuration.',
          status: 'done',
          optional: true,
          actionLabel: 'Review local model',
          actionHref: '#runtime-configuration',
        }
      : {
          key: 'configure_local_model',
          title: 'Configure local model (if available)',
          description: 'Choose a local model for on-device execution in Runtime Configuration.',
          status: 'todo',
          optional: true,
          blockerReason: 'Optional: add a local model when you are ready to validate on-device execution.',
          actionLabel: 'Add local model',
          actionHref: '#runtime-configuration',
        },
    hasApiKeys
      ? {
          key: 'create_dyno_api_key',
          title: 'Create Dyno project API key',
          description: 'Create at least one active project API key for request authentication.',
          status: 'done',
          actionLabel: 'Manage API keys',
          actionHref: '#api-keys',
        }
      : {
          key: 'create_dyno_api_key',
          title: 'Create Dyno project API key',
          description: 'Create at least one active project API key for request authentication.',
          status: cloudFallbackReady ? 'ready' : 'blocked',
          blockerReason: cloudFallbackReady
            ? 'No active Dyno API key found.'
            : 'Configure cloud fallback first, then create a project API key.',
          actionLabel: 'Create API key',
          actionHref: '#api-keys',
        },
    hasApiKeys
      ? {
          key: 'copy_sdk_snippet',
          title: 'Copy SDK snippet',
          description: 'Use the @dynosdk/ts snippet as the default local-first integration path.',
          status: 'done',
          actionLabel: 'Open integration',
          actionHref: '#integration',
        }
      : {
          key: 'copy_sdk_snippet',
          title: 'Copy SDK snippet',
          description: 'Use the @dynosdk/ts snippet as the default local-first integration path.',
          status: 'blocked',
          blockerReason: 'Create a Dyno API key first so snippet auth values are usable.',
          actionLabel: 'Open integration',
          actionHref: '#integration',
        },
    firstSuccessfulRequestObserved
      ? {
          key: 'send_first_request',
          title: 'Send first request and verify telemetry',
          description: 'Send one request from Request Tester and confirm it appears in Recent Requests.',
          status: 'done',
          actionLabel: 'View recent requests',
          actionHref: '#recent-requests',
        }
      : {
          key: 'send_first_request',
          title: 'Send first request and verify telemetry',
          description: 'Send one request from Request Tester and confirm it appears in Recent Requests.',
          status: hasApiKeys && cloudFallbackReady ? 'ready' : 'blocked',
          blockerReason:
            hasApiKeys && cloudFallbackReady
              ? recentFailureCount > 0
                ? 'Only failing requests observed so far. Send one successful request.'
                : 'No successful request observed yet.'
              : 'Complete cloud fallback and API key setup before sending your first request.',
          actionLabel: hasApiKeys && cloudFallbackReady ? 'Open request tester' : 'Fix setup blockers',
          actionHref: hasApiKeys && cloudFallbackReady ? '#request-tester' : '#runtime-configuration',
        },
  ]
  const requiredSteps = steps.filter((step) => !step.optional)
  const completedCount = requiredSteps.filter((step) => step.status === 'done').length
  const totalCount = requiredSteps.length
  const allComplete = completedCount === totalCount && readyForRequests && firstSuccessfulRequestObserved

  return {
    project: input.project,
    config: input.config,
    apiKeys: input.apiKeys,
    recentRequests: input.recentRequests,
    integration: {
      baseUrl,
      logicalModel,
      sdkSnippet: buildSdkEmbeddingsSnippet({ projectId: input.project.id }),
      openAiSnippet:
        input.project.use_case_type === 'text_generation'
          ? buildOpenAiChatSnippet({ baseUrl, logicalModel })
          : buildOpenAiEmbeddingsSnippet({ baseUrl, logicalModel }),
      curlSnippet:
        input.project.use_case_type === 'text_generation'
          ? buildCurlChatSnippet({ baseUrl, logicalModel })
          : buildCurlEmbeddingsSnippet({ baseUrl, logicalModel }),
    },
    health: {
      readyForRequests,
      fallbackConfigured,
      upstreamApiKeyConfigured,
      activeApiKeyCount,
      hasApiKeys,
      recentRequestCount: input.recentRequests.length,
      recentSuccessCount,
      recentFailureCount,
      localExecutionCount,
      cloudExecutionCount,
      lastRequest: lastRequest
        ? {
            createdAt: lastRequest.created_at,
            status: lastRequest.status,
            executionPath: lastRequest.execution_path,
          }
        : null,
    },
    guidance: {
      needsFallbackSetup: Boolean(input.config?.fallback_enabled) && !fallbackConfigured,
      needsDynoApiKey: !hasApiKeys,
      hasNoRequests: input.recentRequests.length === 0,
      hasRecentFailures: recentFailureCount > 0,
    },
    setupJourney: {
      steps,
      completedCount,
      totalCount,
      allComplete,
      completionMessage: allComplete
        ? 'Setup complete. Ready for first production test. Run one representative request and confirm local/cloud path behavior in Recent Requests.'
        : null,
    },
    capability: {
      matrixVersion: PROJECT_CAPABILITY_MATRIX_VERSION,
      controls,
      editableControlCount,
      notYetActiveControls,
    },
    valueSummary,
    operationalSignals,
    pilotProofPack,
  }
}
