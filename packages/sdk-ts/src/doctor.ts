import { DynoSdk } from './client.js';
import { ManagedProjectConfigProvider, ManagedResolverError } from './demo-http-config-provider.js';
import { getModeReadinessFlag, supportsReadinessProbe } from './runtime-manager.js';
import type { HealthResponse, LocalMode, ReadinessDebugResponse } from './types.js';

export interface DynoDoctorOptions {
  runtimeBaseUrl?: string;
  localMode?: LocalMode;
  runtimeTimeoutMs?: number;
  readinessTimeoutMs?: number;
  resolver?: {
    configResolverUrl: string;
    projectApiKey: string;
    resolverConfigPath?: string;
    requestTimeoutMs?: number;
  };
  fallback?: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    embedPath?: string;
    timeoutMs?: number;
    sampleText?: string;
  };
}

export interface DynoDoctorCheckResult {
  ok: boolean;
  code: string;
  message: string;
  durationMs: number;
}

export interface DynoDoctorRuntimeResult extends DynoDoctorCheckResult {
  probeOrder: string[];
  health?: HealthResponse;
  readiness?: ReadinessDebugResponse;
}

export interface DynoDoctorResolverResult extends DynoDoctorCheckResult {
  skipped: boolean;
  projectConfig?: Record<string, unknown>;
}

export interface DynoDoctorFallbackResult extends DynoDoctorCheckResult {
  skipped: boolean;
}

export interface DynoDoctorReport {
  ok: boolean;
  checkedAt: string;
  runtime: DynoDoctorRuntimeResult;
  resolver: DynoDoctorResolverResult;
  fallback: DynoDoctorFallbackResult;
  summary: {
    passCount: number;
    failCount: number;
    skippedCount: number;
  };
}

const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:8787';
const DEFAULT_MODE: LocalMode = 'interactive';
const DEFAULT_RUNTIME_TIMEOUT_MS = 2_000;
const DEFAULT_READINESS_TIMEOUT_MS = 2_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 4_000;

function toDurationMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isNumericArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function hasEmbeddingShape(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') {
    return false;
  }
  const record = payload as Record<string, unknown>;
  if (isNumericArray(record.embedding)) {
    return true;
  }
  const data = record.data;
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }
  const first = data[0] as Record<string, unknown> | undefined;
  return Boolean(first && isNumericArray(first.embedding));
}

async function probeRuntime(options: DynoDoctorOptions): Promise<DynoDoctorRuntimeResult> {
  const startedAt = Date.now();
  const runtimeBaseUrl = normalizeBaseUrl(options.runtimeBaseUrl ?? DEFAULT_RUNTIME_URL);
  const runtimeTimeoutMs = Math.max(200, options.runtimeTimeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS);
  const readinessTimeoutMs = Math.max(200, options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS);
  const localMode = options.localMode ?? DEFAULT_MODE;
  const sdk = new DynoSdk({ baseUrl: runtimeBaseUrl });
  const probeOrder = ['GET /health'];

  let health: HealthResponse;
  try {
    health = await withTimeout(() => sdk.healthCheck(), runtimeTimeoutMs, 'runtime_health_timeout');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('runtime_health_timeout')
      ? 'runtime_health_timeout'
      : 'runtime_unreachable';
    return {
      ok: false,
      code,
      message: `Runtime health probe failed: ${message}`,
      durationMs: toDurationMs(startedAt),
      probeOrder,
    };
  }

  if (health.ok !== true) {
    return {
      ok: false,
      code: 'runtime_health_not_ok',
      message: 'Runtime /health responded with ok=false.',
      durationMs: toDurationMs(startedAt),
      probeOrder,
      health,
    };
  }

  const supportsReadiness = supportsReadinessProbe(health);
  if (!supportsReadiness) {
    return {
      ok: true,
      code: 'runtime_ready_legacy',
      message: 'Runtime is healthy and treated as ready (legacy runtime without readinessDebugV1).',
      durationMs: toDurationMs(startedAt),
      probeOrder,
      health,
    };
  }

  probeOrder.push('GET /debug/readiness');
  let readiness: ReadinessDebugResponse;
  try {
    readiness = await withTimeout(
      () => sdk.getReadinessDebug(),
      readinessTimeoutMs,
      'runtime_readiness_timeout',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('runtime_readiness_timeout')
      ? 'runtime_readiness_timeout'
      : 'runtime_readiness_probe_failed';
    return {
      ok: false,
      code,
      message: `Runtime readiness probe failed: ${message}`,
      durationMs: toDurationMs(startedAt),
      probeOrder,
      health,
    };
  }

  const modeReady = getModeReadinessFlag(localMode, readiness);
  if (modeReady === false) {
    return {
      ok: false,
      code: `runtime_not_ready_${localMode}`,
      message: `Runtime readiness probe reports local mode "${localMode}" is not ready.`,
      durationMs: toDurationMs(startedAt),
      probeOrder,
      health,
      readiness,
    };
  }

  if (typeof modeReady !== 'boolean') {
    return {
      ok: false,
      code: 'runtime_readiness_missing_flag',
      message: `Runtime readiness payload is missing a readiness flag for mode "${localMode}".`,
      durationMs: toDurationMs(startedAt),
      probeOrder,
      health,
      readiness,
    };
  }

  return {
    ok: true,
    code: 'runtime_ready',
    message: `Runtime is healthy and ready for mode "${localMode}".`,
    durationMs: toDurationMs(startedAt),
    probeOrder,
    health,
    readiness,
  };
}

async function probeResolver(options: DynoDoctorOptions): Promise<DynoDoctorResolverResult> {
  const startedAt = Date.now();
  if (!options.resolver?.configResolverUrl || !options.resolver?.projectApiKey) {
    return {
      ok: true,
      code: 'resolver_skipped',
      message: 'Resolver probe skipped (missing resolver URL or project API key).',
      durationMs: toDurationMs(startedAt),
      skipped: true,
    };
  }

  const provider = new ManagedProjectConfigProvider({
    configResolverUrl: options.resolver.configResolverUrl,
    projectApiKey: options.resolver.projectApiKey,
    resolverConfigPath: options.resolver.resolverConfigPath,
    requestTimeoutMs: options.resolver.requestTimeoutMs,
  });

  try {
    const config = await provider.loadProjectConfig('__doctor__');
    return {
      ok: true,
      code: 'resolver_ok',
      message: 'Resolver returned project config.',
      durationMs: toDurationMs(startedAt),
      skipped: false,
      projectConfig: {
        projectId: config.projectId,
        use_case_type: config.use_case_type,
        strategy_preset: config.strategy_preset,
        fallback_enabled: config.fallback_enabled ?? true,
      },
    };
  } catch (error) {
    if (error instanceof ManagedResolverError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        durationMs: toDurationMs(startedAt),
        skipped: false,
      };
    }
    return {
      ok: false,
      code: 'resolver_probe_failed',
      message: error instanceof Error ? error.message : String(error),
      durationMs: toDurationMs(startedAt),
      skipped: false,
    };
  }
}

async function probeFallback(options: DynoDoctorOptions): Promise<DynoDoctorFallbackResult> {
  const startedAt = Date.now();
  if (!options.fallback?.baseUrl || !options.fallback?.apiKey) {
    return {
      ok: true,
      code: 'fallback_skipped',
      message: 'Fallback probe skipped (missing fallback base URL or API key).',
      durationMs: toDurationMs(startedAt),
      skipped: true,
    };
  }

  const baseUrl = normalizeBaseUrl(options.fallback.baseUrl);
  const timeoutMs = Math.max(200, options.fallback.timeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS);
  const embedPath = options.fallback.embedPath?.trim() || '/embeddings';
  const model = options.fallback.model?.trim() || 'text-embedding-3-small';
  const sampleText = options.fallback.sampleText?.trim() || 'dyno-doctor-fallback-probe';

  let response: Response;
  try {
    response = await withTimeout(
      () =>
        fetch(`${baseUrl}${embedPath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.fallback?.apiKey ?? ''}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            model,
            input: sampleText,
          }),
        }),
      timeoutMs,
      'fallback_timeout',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('fallback_timeout') ? 'fallback_timeout' : 'fallback_unreachable';
    return {
      ok: false,
      code,
      message: `Fallback probe failed: ${message}`,
      durationMs: toDurationMs(startedAt),
      skipped: false,
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: `fallback_http_${response.status}`,
      message: `Fallback returned ${response.status}${text ? `: ${text}` : ''}`,
      durationMs: toDurationMs(startedAt),
      skipped: false,
    };
  }

  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        ok: false,
        code: 'fallback_invalid_json',
        message: 'Fallback returned invalid JSON.',
        durationMs: toDurationMs(startedAt),
        skipped: false,
      };
    }
  }

  if (!hasEmbeddingShape(payload)) {
    return {
      ok: false,
      code: 'fallback_invalid_payload',
      message: 'Fallback response did not include an embedding vector.',
      durationMs: toDurationMs(startedAt),
      skipped: false,
    };
  }

  return {
    ok: true,
    code: 'fallback_ok',
    message: 'Fallback endpoint is reachable and returned embeddings payload.',
    durationMs: toDurationMs(startedAt),
    skipped: false,
  };
}

export async function runDynoDoctor(options: DynoDoctorOptions = {}): Promise<DynoDoctorReport> {
  const runtime = await probeRuntime(options);
  const resolver = await probeResolver(options);
  const fallback = await probeFallback(options);
  const checks = [runtime, resolver, fallback];
  const passCount = checks.filter((check) => check.ok && !('skipped' in check && check.skipped)).length;
  const failCount = checks.filter((check) => !check.ok).length;
  const skippedCount = checks.filter((check) => 'skipped' in check && check.skipped).length;

  return {
    ok: failCount === 0,
    checkedAt: new Date().toISOString(),
    runtime,
    resolver,
    fallback,
    summary: {
      passCount,
      failCount,
      skippedCount,
    },
  };
}
