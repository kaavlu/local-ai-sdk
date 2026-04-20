import type { DemoProjectConfig, DemoStrategyPreset, ProjectConfigProvider } from './config-provider.js'

type FetchLike = typeof fetch

export interface ManagedProjectConfigProviderOptions {
  projectApiKey: string
  configResolverUrl?: string
  resolverUrl?: string
  resolverConfigPath?: string
  requestTimeoutMs?: number
  fetchImpl?: FetchLike
}

export type ManagedResolverErrorCode =
  | 'invalid_project_api_key'
  | 'revoked_project_api_key'
  | 'resolver_unreachable'
  | 'resolver_timeout'
  | 'resolver_payload_invalid'
  | 'project_config_not_found'
  | 'resolver_unauthorized'
  | 'resolver_internal_error'

export class ManagedResolverError extends Error {
  readonly code: ManagedResolverErrorCode

  constructor(code: ManagedResolverErrorCode, message: string) {
    super(`${message} (${code})`)
    this.name = 'ManagedResolverError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const DEFAULT_RESOLVER_PATH = '/api/v1/sdk/config'
const DEFAULT_LOCAL_RESOLVER_URL = 'http://127.0.0.1:3000'

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('resolverConfigPath must be a non-empty string')
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeStrategyPreset(raw: string): DemoStrategyPreset {
  if (raw === 'local_first' || raw === 'balanced' || raw === 'cloud_first') {
    return raw
  }
  throw new Error(`Unsupported strategy_preset "${raw}" in resolver response`)
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean for "${fieldName}" in resolver response`)
  }
  return value
}

function assertNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'number') {
    throw new Error(`Expected number|null for "${fieldName}" in resolver response`)
  }
  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`Expected string|null for "${fieldName}" in resolver response`)
  }
  return value
}

function parseResolverResponse(raw: unknown): DemoProjectConfig {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Resolver returned invalid JSON shape')
  }

  const body = raw as Record<string, unknown>
  const projectId = String(body.projectId ?? '').trim()
  if (!projectId) {
    throw new Error('Resolver response is missing projectId')
  }

  const useCaseType = String(body.use_case_type ?? '').trim()
  if (!useCaseType) {
    throw new Error('Resolver response is missing use_case_type')
  }

  const strategy = String(body.strategy_preset ?? '').trim()
  if (!strategy) {
    throw new Error('Resolver response is missing strategy_preset')
  }

  return {
    projectId,
    use_case_type: useCaseType,
    strategy_preset: normalizeStrategyPreset(strategy),
    fallback_enabled:
      body.fallback_enabled === undefined ? true : assertBoolean(body.fallback_enabled, 'fallback_enabled'),
    local_model: assertNullableString(body.local_model, 'local_model'),
    cloud_model: assertNullableString(body.cloud_model, 'cloud_model'),
    requires_charging: assertBoolean(body.requires_charging, 'requires_charging'),
    wifi_only: assertBoolean(body.wifi_only, 'wifi_only'),
    battery_min_percent: assertNullableNumber(body.battery_min_percent, 'battery_min_percent'),
    idle_min_seconds: assertNullableNumber(body.idle_min_seconds, 'idle_min_seconds'),
  }
}

function readResolverBaseUrlFromEnv(): string {
  return process.env.DYNO_CONFIG_RESOLVER_URL?.trim() || DEFAULT_LOCAL_RESOLVER_URL
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ManagedResolverError(
        'resolver_timeout',
        `Resolver request timed out after ${timeoutMs}ms`,
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ManagedResolverError('resolver_unreachable', `Resolver request failed: ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}

export class ManagedProjectConfigProvider implements ProjectConfigProvider {
  private readonly resolverBaseUrl: string
  private readonly resolverConfigPath: string
  private readonly projectApiKey: string
  private readonly requestTimeoutMs: number
  private readonly fetchImpl: FetchLike

  constructor(options: ManagedProjectConfigProviderOptions) {
    const resolverUrl =
      (options.configResolverUrl || options.resolverUrl || readResolverBaseUrlFromEnv()).trim()
    if (!resolverUrl) {
      throw new Error('configResolverUrl is required for ManagedProjectConfigProvider')
    }
    const projectApiKey = options.projectApiKey.trim()
    if (!projectApiKey) {
      throw new Error('projectApiKey is required for ManagedProjectConfigProvider')
    }
    this.resolverBaseUrl = normalizeBaseUrl(resolverUrl)
    this.resolverConfigPath = normalizePath(options.resolverConfigPath || DEFAULT_RESOLVER_PATH)
    this.projectApiKey = projectApiKey
    this.requestTimeoutMs = Math.max(200, options.requestTimeoutMs ?? 8_000)
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async loadProjectConfig(_projectId: string): Promise<DemoProjectConfig> {
    const responseBody = await this.fetchJson(`${this.resolverBaseUrl}${this.resolverConfigPath}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.projectApiKey}`,
      },
    })
    try {
      return parseResolverResponse(responseBody)
    } catch (error) {
      throw new ManagedResolverError(
        'resolver_payload_invalid',
        `Resolver config payload is invalid: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchWithTimeout(this.fetchImpl, url, init, this.requestTimeoutMs)
    const text = await response.text()
    let parsed: Record<string, unknown> = {}
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        throw new ManagedResolverError('resolver_payload_invalid', 'Resolver returned invalid JSON')
      }
    }

    if (response.ok) {
      return parsed
    }

    const code = typeof parsed.code === 'string' ? parsed.code : ''
    if (response.status === 401 && code === 'invalid_api_key') {
      throw new ManagedResolverError('invalid_project_api_key', 'Project API key is invalid')
    }
    if (response.status === 401 && code === 'revoked_api_key') {
      throw new ManagedResolverError('revoked_project_api_key', 'Project API key is revoked')
    }
    if (response.status === 401 || response.status === 403) {
      throw new ManagedResolverError('resolver_unauthorized', 'Resolver request was unauthorized')
    }
    if (response.status === 404) {
      throw new ManagedResolverError('project_config_not_found', 'Project config not found')
    }
    if (response.status >= 500) {
      throw new ManagedResolverError(
        'resolver_internal_error',
        `Resolver returned ${response.status}${text ? `: ${text}` : ''}`,
      )
    }
    throw new ManagedResolverError(
      'resolver_payload_invalid',
      `Resolver returned ${response.status}${text ? `: ${text}` : ''}`,
    )
  }
}
