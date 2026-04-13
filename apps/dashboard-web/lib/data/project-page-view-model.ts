import type { Project, ProjectApiKeyListItem, ProjectConfig, ProjectRequestExecution } from '@/lib/data/dashboard-types'

const DEFAULT_DYNO_BASE_URL = 'http://127.0.0.1:8788/v1'
const DEFAULT_LOGICAL_MODEL = 'dyno-embeddings-1'

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

export function buildProjectPageViewModel(input: {
  project: Project
  config: ProjectConfig | null
  apiKeys: ProjectApiKeyListItem[]
  recentRequests: ProjectRequestExecution[]
}): ProjectPageViewModel {
  const baseUrl = toBaseUrlValue()
  const logicalModel = input.config?.logical_model?.trim() || DEFAULT_LOGICAL_MODEL
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

  return {
    project: input.project,
    config: input.config,
    apiKeys: input.apiKeys,
    recentRequests: input.recentRequests,
    integration: {
      baseUrl,
      logicalModel,
      openAiSnippet: buildOpenAiEmbeddingsSnippet({ baseUrl, logicalModel }),
      curlSnippet: buildCurlEmbeddingsSnippet({ baseUrl, logicalModel }),
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
  }
}
