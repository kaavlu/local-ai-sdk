import type {
  Project,
  ProjectApiKeyListItem,
  ProjectConfig,
  ProjectRequestExecution,
  ProjectValueSummaryExecution,
} from '@/lib/data/dashboard-types'

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

export interface ProjectPageViewModel {
  project: Project
  config: ProjectConfig | null
  apiKeys: ProjectApiKeyListItem[]
  recentRequests: ProjectRequestExecution[]
  integration: {
    baseUrl: string
    logicalModel: string
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
  valueSummary: ProjectValueSummary
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
  const fallbackReady = !input.config?.fallback_enabled || (fallbackConfigured && upstreamApiKeyConfigured)
  const readyForRequests = hasApiKeys && Boolean(logicalModel) && fallbackReady
  const valueSummary = buildProjectValueSummary({
    projectId: input.project.id,
    executions: input.valueSummaryExecutions,
    estimatedCloudCostPerRequestUsd: input.config?.estimated_cloud_cost_per_request_usd ?? null,
    windowDays: VALUE_SUMMARY_WINDOW_DAYS,
  })

  return {
    project: input.project,
    config: input.config,
    apiKeys: input.apiKeys,
    recentRequests: input.recentRequests,
    integration: {
      baseUrl,
      logicalModel,
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
    valueSummary,
  }
}
