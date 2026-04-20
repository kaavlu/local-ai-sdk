export type StrategyPreset = 'local_first' | 'balanced' | 'cloud_first';
export type LocalMode = 'interactive' | 'background';

const DEFAULT_RESOLVER_PATH = '/api/v1/sdk/config';
const DEFAULT_RESOLVER_TIMEOUT_MS = 8_000;

interface ResolverResponse {
  projectId: string;
  use_case_type: string;
  strategy_preset: string;
  logical_model: string | null;
  fallback_enabled: boolean;
  upstream_provider_type: string | null;
  local_model: string | null;
  cloud_model: string | null;
  upstream_base_url: string | null;
  upstream_model: string | null;
  upstream_api_key: string | null;
  requires_charging: boolean;
  wifi_only: boolean;
  battery_min_percent: number | null;
  idle_min_seconds: number | null;
  upstreamBaseUrl?: string;
  upstreamApiKey?: string;
  upstreamModel?: string;
}

export interface ProjectContext {
  projectId: string;
  useCaseType: string;
  strategyPreset: StrategyPreset;
  logicalModel: string;
  fallbackEnabled: boolean;
  upstreamProviderType: string;
  localMode: LocalMode;
  localModel: string | null;
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  upstreamModel: string;
  readiness: {
    requiresCharging: boolean;
    wifiOnly: boolean;
    batteryMinPercent: number | null;
    idleMinSeconds: number | null;
  };
}

export class ProjectContextError extends Error {
  public readonly projectId: string | null;

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    options: { projectId?: string | null } = {},
  ) {
    super(message);
    this.name = 'ProjectContextError';
    this.projectId = options.projectId ?? null;
  }
}

function normalizeStrategyPreset(raw: string): StrategyPreset {
  if (raw === 'local_first' || raw === 'balanced' || raw === 'cloud_first') {
    return raw;
  }
  throw new ProjectContextError(`Unsupported strategy_preset "${raw}"`, 502, 'resolver_invalid_strategy');
}

function strategyToLocalMode(strategy: StrategyPreset): LocalMode {
  return strategy === 'balanced' ? 'background' : 'interactive';
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readResolverBaseUrl(): string {
  const resolverBaseUrl = nonEmptyString(process.env.DYNO_CONFIG_RESOLVER_URL);
  if (!resolverBaseUrl) {
    throw new ProjectContextError(
      'DYNO_CONFIG_RESOLVER_URL is required for project config resolution',
      500,
      'resolver_not_configured',
    );
  }
  return resolverBaseUrl.replace(/\/+$/, '');
}

function readProjectConfigResolverPath(): string {
  const configuredPath =
    nonEmptyString(process.env.DYNO_CONFIG_RESOLVER_CONFIG_PATH) ??
    nonEmptyString(process.env.DYNO_SDK_CONFIG_PATH) ??
    DEFAULT_RESOLVER_PATH;
  return configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
}

function readResolverTimeoutMs(): number {
  const parsed = Number(process.env.DYNO_CONFIG_RESOLVER_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RESOLVER_TIMEOUT_MS;
  }
  return Math.max(200, Math.trunc(parsed));
}

export function getResolverAuthHeaders(): Record<string, string> {
  const resolverSecret = nonEmptyString(process.env.DYNO_CONFIG_RESOLVER_SECRET);
  const resolverHeaderName =
    nonEmptyString(process.env.DYNO_CONFIG_RESOLVER_SECRET_HEADER) ?? 'x-dyno-control-plane-secret';
  if (!resolverSecret) {
    return {};
  }
  return {
    [resolverHeaderName]: resolverSecret,
  };
}

function getResolverBearerHeaders(projectApiKey: string): Record<string, string> {
  const normalizedKey = nonEmptyString(projectApiKey);
  if (!normalizedKey) {
    throw new ProjectContextError('projectApiKey is required', 401, 'missing_api_key');
  }
  return {
    Authorization: `Bearer ${normalizedKey}`,
    ...getResolverAuthHeaders(),
  };
}

function normalizeResolverBody(raw: unknown): ResolverResponse {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProjectContextError('Resolver returned invalid JSON object', 502, 'resolver_invalid_json');
  }
  const body = raw as Record<string, unknown>;
  const projectId = String(body.projectId ?? '').trim();
  const useCaseType = String(body.use_case_type ?? '').trim();
  const strategy = String(body.strategy_preset ?? '').trim();
  if (!projectId || !useCaseType || !strategy) {
    throw new ProjectContextError(
      'Resolver response missing required project config fields',
      502,
      'resolver_missing_fields',
    );
  }
  return {
    projectId,
    use_case_type: useCaseType,
    strategy_preset: strategy,
    logical_model: typeof body.logical_model === 'string' ? body.logical_model : null,
    fallback_enabled: body.fallback_enabled === undefined ? true : Boolean(body.fallback_enabled),
    upstream_provider_type:
      typeof body.upstream_provider_type === 'string' ? body.upstream_provider_type : null,
    local_model: typeof body.local_model === 'string' ? body.local_model : null,
    cloud_model: typeof body.cloud_model === 'string' ? body.cloud_model : null,
    upstream_base_url:
      typeof body.upstream_base_url === 'string' ? body.upstream_base_url : null,
    upstream_model: typeof body.upstream_model === 'string' ? body.upstream_model : null,
    upstream_api_key:
      typeof body.upstream_api_key === 'string'
        ? body.upstream_api_key
        : typeof body.upstreamApiKey === 'string'
          ? body.upstreamApiKey
          : null,
    requires_charging: Boolean(body.requires_charging),
    wifi_only: Boolean(body.wifi_only),
    battery_min_percent: typeof body.battery_min_percent === 'number' ? body.battery_min_percent : null,
    idle_min_seconds: typeof body.idle_min_seconds === 'number' ? body.idle_min_seconds : null,
    upstreamBaseUrl: typeof body.upstreamBaseUrl === 'string' ? body.upstreamBaseUrl : undefined,
    upstreamApiKey: typeof body.upstreamApiKey === 'string' ? body.upstreamApiKey : undefined,
    upstreamModel: typeof body.upstreamModel === 'string' ? body.upstreamModel : undefined,
  };
}

async function fetchResolverResponse(
  resolverUrl: string,
  requestHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resolverUrl, {
      method: 'GET',
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProjectContextError(
        `Project config resolver timed out after ${timeoutMs}ms`,
        504,
        'resolver_timeout',
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProjectContextError(
      `Failed to resolve project config: ${message}`,
      502,
      'resolver_unreachable',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface ResolveProjectContextOptions {
  requireCloudConfig?: boolean;
}

export async function resolveProjectContext(
  projectApiKey: string,
  options: ResolveProjectContextOptions = {},
): Promise<ProjectContext> {
  const resolverBaseUrl = readResolverBaseUrl();
  const projectConfigPath = readProjectConfigResolverPath();
  const requestHeaders = getResolverBearerHeaders(projectApiKey);
  const url = `${resolverBaseUrl}${projectConfigPath}`;
  const timeoutMs = readResolverTimeoutMs();

  let response: Response;
  response = await fetchResolverResponse(url, requestHeaders, timeoutMs);

  const text = await response.text();
  if (!response.ok) {
    let parsedCode = '';
    if (text) {
      try {
        const body = JSON.parse(text) as { code?: unknown };
        parsedCode = typeof body.code === 'string' ? body.code : '';
      } catch {
        parsedCode = '';
      }
    }

    if (response.status === 401 && parsedCode === 'revoked_api_key') {
      throw new ProjectContextError('Project API key has been revoked', 401, 'revoked_api_key');
    }
    if (response.status === 401) {
      throw new ProjectContextError('Invalid project API key', 401, 'invalid_api_key');
    }
    if (response.status === 404) {
      throw new ProjectContextError('Project config not found', 404, 'project_config_not_found');
    }
    if (response.status >= 500) {
      throw new ProjectContextError(
        `Project config resolver returned ${response.status}`,
        502,
        'resolver_internal_error',
      );
    }
    throw new ProjectContextError(
      `Project config resolver returned ${response.status}`,
      502,
      'resolver_error',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectContextError('Resolver returned invalid JSON payload', 502, 'resolver_invalid_json');
  }
  const body = normalizeResolverBody(parsed);
  const strategyPreset = normalizeStrategyPreset(body.strategy_preset);
  const logicalModel = nonEmptyString(body.logical_model) ?? 'dyno-embeddings-1';
  const fallbackEnabled = body.fallback_enabled;
  const upstreamProviderType = nonEmptyString(body.upstream_provider_type) ?? 'openai_compatible';
  const upstreamBaseUrl =
    nonEmptyString(body.upstream_base_url) ??
    nonEmptyString(body.upstreamBaseUrl) ?? nonEmptyString(process.env.DYNO_UPSTREAM_BASE_URL);
  const upstreamApiKey =
    nonEmptyString(body.upstream_api_key) ??
    nonEmptyString(body.upstreamApiKey) ??
    nonEmptyString(process.env.DYNO_UPSTREAM_API_KEY);
  const upstreamModel =
    nonEmptyString(body.upstream_model) ??
    nonEmptyString(body.upstreamModel) ??
    nonEmptyString(body.cloud_model) ??
    nonEmptyString(process.env.DYNO_UPSTREAM_MODEL);

  const requireCloudConfig = options.requireCloudConfig ?? true;
  if (requireCloudConfig && fallbackEnabled && (!upstreamBaseUrl || !upstreamApiKey || !upstreamModel)) {
    throw new ProjectContextError(
      'Resolved project is missing upstream cloud configuration',
      502,
      'upstream_not_configured',
      { projectId: body.projectId },
    );
  }

  return {
    projectId: body.projectId,
    useCaseType: body.use_case_type,
    strategyPreset,
    logicalModel,
    fallbackEnabled,
    upstreamProviderType,
    localMode: strategyToLocalMode(strategyPreset),
    localModel: body.local_model,
    upstreamBaseUrl: upstreamBaseUrl ?? '',
    upstreamApiKey: upstreamApiKey ?? '',
    upstreamModel: upstreamModel ?? logicalModel,
    readiness: {
      requiresCharging: body.requires_charging,
      wifiOnly: body.wifi_only,
      batteryMinPercent: body.battery_min_percent,
      idleMinSeconds: body.idle_min_seconds,
    },
  };
}
