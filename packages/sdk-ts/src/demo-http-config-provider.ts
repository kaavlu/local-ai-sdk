import type { ConfigProvider, DemoProjectConfig, DemoStrategyPreset } from './config-provider.js'

type ResolverResponse = {
  projectId: string
  use_case_type: string
  strategy_preset: string
  local_model: string | null
  cloud_model: string | null
  requires_charging: boolean
  wifi_only: boolean
  battery_min_percent: number | null
  idle_min_seconds: number | null
}

export interface HttpDemoConfigProviderOptions {
  configResolverUrl: string
  resolverUrl?: string
  resolverSecret?: string
  resolverSecretHeaderName?: string
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
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
    local_model: assertNullableString(body.local_model, 'local_model'),
    cloud_model: assertNullableString(body.cloud_model, 'cloud_model'),
    requires_charging: assertBoolean(body.requires_charging, 'requires_charging'),
    wifi_only: assertBoolean(body.wifi_only, 'wifi_only'),
    battery_min_percent: assertNullableNumber(body.battery_min_percent, 'battery_min_percent'),
    idle_min_seconds: assertNullableNumber(body.idle_min_seconds, 'idle_min_seconds'),
  }
}

/**
 * Demo-only HTTP resolver provider for dashboard project configs.
 * This keeps the integration path projectId-focused while config stays server-side.
 */
export class HttpDemoConfigProvider implements ConfigProvider {
  private readonly resolverBaseUrl: string
  private readonly resolverSecret?: string
  private readonly resolverSecretHeaderName: string

  constructor(options: HttpDemoConfigProviderOptions) {
    const resolverUrl = (options.configResolverUrl || options.resolverUrl || '').trim()
    if (!resolverUrl) {
      throw new Error('configResolverUrl is required for HttpDemoConfigProvider')
    }
    this.resolverBaseUrl = normalizeBaseUrl(resolverUrl)
    this.resolverSecret = options.resolverSecret?.trim() || undefined
    this.resolverSecretHeaderName = options.resolverSecretHeaderName?.trim() || 'x-dyno-demo-secret'
  }

  static fromEnv(): HttpDemoConfigProvider {
    const resolverUrl = process.env.DYNO_CONFIG_RESOLVER_URL?.trim() || ''
    if (!resolverUrl) {
      throw new Error('Missing DYNO_CONFIG_RESOLVER_URL for HttpDemoConfigProvider')
    }
    return new HttpDemoConfigProvider({
      configResolverUrl: resolverUrl,
      resolverSecret: process.env.DYNO_CONFIG_RESOLVER_SECRET?.trim(),
    })
  }

  async loadProjectConfig(projectId: string): Promise<DemoProjectConfig> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) {
      throw new Error('projectId is required to load project config')
    }

    const url = `${this.resolverBaseUrl}/api/demo/project-config/${encodeURIComponent(normalizedProjectId)}`
    const headers: Record<string, string> = {}
    if (this.resolverSecret) {
      headers[this.resolverSecretHeaderName] = this.resolverSecret
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Resolver request failed for projectId "${normalizedProjectId}": ${message}`)
    }

    const text = await response.text()
    if (!response.ok) {
      throw new Error(
        `Resolver returned ${response.status} for projectId "${normalizedProjectId}": ${text || '(empty body)'}`,
      )
    }

    let parsed: ResolverResponse
    try {
      parsed = JSON.parse(text) as ResolverResponse
    } catch {
      throw new Error(`Resolver returned invalid JSON for projectId "${normalizedProjectId}"`)
    }
    return parseResolverResponse(parsed)
  }
}
