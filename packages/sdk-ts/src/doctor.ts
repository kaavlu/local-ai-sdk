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
    generationModel?: string;
    embedPath?: string;
    generatePath?: string;
    timeoutMs?: number;
    sampleText?: string;
    generationSampleText?: string;
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
  embeddings: DynoDoctorCheckResult & { skipped: boolean };
  generation: DynoDoctorCheckResult & { skipped: boolean };
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
const DEFAULT_GENERATION_FALLBACK_MODEL = 'gpt-4.1-mini';

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

function hasGenerationTextShape(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') {
    return false;
  }
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return true;
  }
  const output = root.output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (first && typeof first === 'object') {
      const firstRoot = first as Record<string, unknown>;
      const content = firstRoot.content;
      if (Array.isArray(content) && content.length > 0) {
        const head = content[0];
        if (head && typeof head === 'object') {
          const text = (head as Record<string, unknown>).text;
          if (typeof text === 'string' && text.trim()) {
            return true;
          }
        }
      }
    }
  }
  const choices = root.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === 'object') {
      const choice = firstChoice as Record<string, unknown>;
      const message = choice.message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string' && content.trim()) {
          return true;
        }
      }
      const text = choice.text;
      if (typeof text === 'string' && text.trim()) {
        return true;
      }
    }
  }
  return false;
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

  probeOrder.push('GET /debug/models');
  try {
    const models = await withTimeout(
      () => sdk.getModelDebugInfo(),
      runtimeTimeoutMs,
      'runtime_generation_models_timeout',
    );
    if (!models.generate_text) {
      return {
        ok: false,
        code: 'runtime_generation_unsupported',
        message: 'Runtime /debug/models does not report generate_text model support.',
        durationMs: toDurationMs(startedAt),
        probeOrder,
        health,
      };
    }
    if (models.generate_text.state === 'failed') {
      return {
        ok: false,
        code: 'runtime_generation_model_failed',
        message: 'Runtime reports generate_text model state=failed. Check local model setup.',
        durationMs: toDurationMs(startedAt),
        probeOrder,
        health,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('runtime_generation_models_timeout')
      ? 'runtime_generation_models_timeout'
      : 'runtime_generation_probe_failed';
    return {
      ok: false,
      code,
      message: `Runtime generation support probe failed: ${message}`,
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
      message:
        'Runtime is healthy with generation support and treated as ready (legacy runtime without readinessDebugV1).',
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
    message: `Runtime is healthy, generation-capable, and ready for mode "${localMode}".`,
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

async function probeFallbackEmbeddings(options: DynoDoctorOptions): Promise<DynoDoctorCheckResult> {
  const startedAt = Date.now();
  const baseUrl = normalizeBaseUrl(options.fallback!.baseUrl);
  const timeoutMs = Math.max(200, options.fallback!.timeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS);
  const embedPath = options.fallback!.embedPath?.trim() || '/embeddings';
  const model = options.fallback!.model?.trim() || 'text-embedding-3-small';
  const sampleText = options.fallback!.sampleText?.trim() || 'dyno-doctor-fallback-probe';

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
      message: `Embeddings fallback probe failed: ${message}`,
      durationMs: toDurationMs(startedAt),
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: `fallback_http_${response.status}`,
      message: `Embeddings fallback returned ${response.status}${text ? `: ${text}` : ''}`,
      durationMs: toDurationMs(startedAt),
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
        message: 'Embeddings fallback returned invalid JSON.',
        durationMs: toDurationMs(startedAt),
      };
    }
  }

  if (!hasEmbeddingShape(payload)) {
    return {
      ok: false,
      code: 'fallback_invalid_payload',
      message: 'Embeddings fallback response did not include an embedding vector.',
      durationMs: toDurationMs(startedAt),
    };
  }

  return {
    ok: true,
    code: 'fallback_embeddings_ok',
    message: 'Embeddings fallback endpoint is reachable and returned a valid embedding payload.',
    durationMs: toDurationMs(startedAt),
  };
}

async function probeFallbackGeneration(options: DynoDoctorOptions): Promise<DynoDoctorCheckResult> {
  const startedAt = Date.now();
  const baseUrl = normalizeBaseUrl(options.fallback!.baseUrl);
  const timeoutMs = Math.max(200, options.fallback!.timeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS);
  const generatePath = options.fallback!.generatePath?.trim() || '/chat/completions';
  const model = options.fallback!.generationModel?.trim() || DEFAULT_GENERATION_FALLBACK_MODEL;
  const sampleText = options.fallback!.generationSampleText?.trim() || 'Return one short word: dyno';

  let response: Response;
  try {
    response = await withTimeout(
      () =>
        fetch(`${baseUrl}${generatePath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.fallback?.apiKey ?? ''}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: sampleText }],
            max_tokens: 12,
            temperature: 0,
          }),
        }),
      timeoutMs,
      'fallback_generation_timeout',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('fallback_generation_timeout')
      ? 'fallback_generation_timeout'
      : 'fallback_generation_unreachable';
    return {
      ok: false,
      code,
      message: `Generation fallback probe failed: ${message}`,
      durationMs: toDurationMs(startedAt),
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: `fallback_generation_http_${response.status}`,
      message: `Generation fallback returned ${response.status}${text ? `: ${text}` : ''}`,
      durationMs: toDurationMs(startedAt),
    };
  }

  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        ok: false,
        code: 'fallback_generation_invalid_json',
        message: 'Generation fallback returned invalid JSON.',
        durationMs: toDurationMs(startedAt),
      };
    }
  }

  if (!hasGenerationTextShape(payload)) {
    return {
      ok: false,
      code: 'fallback_generation_invalid_payload',
      message: 'Generation fallback response did not include generated text.',
      durationMs: toDurationMs(startedAt),
    };
  }

  return {
    ok: true,
    code: 'fallback_generation_ok',
    message: 'Generation fallback endpoint is reachable and returned generated text.',
    durationMs: toDurationMs(startedAt),
  };
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
      embeddings: {
        ok: true,
        code: 'fallback_embeddings_skipped',
        message: 'Embeddings fallback probe skipped (missing fallback base URL or API key).',
        durationMs: 0,
        skipped: true,
      },
      generation: {
        ok: true,
        code: 'fallback_generation_skipped',
        message: 'Generation fallback probe skipped (missing fallback base URL or API key).',
        durationMs: 0,
        skipped: true,
      },
    };
  }

  const embeddings = await probeFallbackEmbeddings(options);
  const generation = await probeFallbackGeneration(options);

  if (!embeddings.ok) {
    return {
      ok: false,
      code: embeddings.code,
      message: embeddings.message,
      durationMs: toDurationMs(startedAt),
      skipped: false,
      embeddings: { ...embeddings, skipped: false },
      generation: { ...generation, skipped: false },
    };
  }

  if (!generation.ok) {
    return {
      ok: false,
      code: generation.code,
      message: generation.message,
      durationMs: toDurationMs(startedAt),
      skipped: false,
      embeddings: { ...embeddings, skipped: false },
      generation: { ...generation, skipped: false },
    };
  }

  return {
    ok: true,
    code: 'fallback_ok',
    message: 'Fallback endpoint is reachable for embeddings and generation probes.',
    durationMs: toDurationMs(startedAt),
    skipped: false,
    embeddings: { ...embeddings, skipped: false },
    generation: { ...generation, skipped: false },
  };
}

export async function runDynoDoctor(options: DynoDoctorOptions = {}): Promise<DynoDoctorReport> {
  const runtime = await probeRuntime(options);
  const resolver = await probeResolver(options);
  const fallback = await probeFallback(options);
  const checks = [runtime, resolver, fallback.embeddings, fallback.generation];
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
