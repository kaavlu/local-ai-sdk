import { DynoSdk, DynoSdkError } from './client.js';
import { mapStrategyPresetToScheduling, type ProjectConfig, type ProjectConfigProvider } from './config-provider.js';
import { ManagedProjectConfigProvider, type ManagedResolverErrorCode } from './demo-http-config-provider.js';
import { getModeReadinessFlag, supportsReadinessProbe } from './runtime-manager.js';
import type {
  GenerateTextPayload,
  HealthResponse,
  LocalMode,
  RuntimeManager,
} from './types.js';
import {
  CachedProjectConfigProvider,
  type EmbeddingsExecutionReason as GenerationExecutionReason,
  type EmbeddingsReasonCategory as GenerationReasonCategory,
  type ExecutionDecision,
  type ProjectConfigCacheOptions,
  type TelemetryEvent,
  type TelemetrySink,
} from './embeddings-runtime.js';

export interface GenerationFallbackRequest {
  text: string;
  payload: GenerateTextPayload;
  projectConfig: ProjectConfig;
  reason: GenerationExecutionReason;
  reasonCategory: GenerationReasonCategory;
}

export interface GenerationFallbackResult {
  output: string;
  model?: string;
  usage?: {
    promptChars?: number;
    completionChars?: number;
    totalChars?: number;
  };
}

export type GenerationFallbackAdapter = (
  request: GenerationFallbackRequest,
) => Promise<GenerationFallbackResult>;

export interface GenerationExecutionResult {
  output: string;
  decision: ExecutionDecision;
  reason: GenerationExecutionReason;
  reasonCategory: GenerationReasonCategory;
  model: string | null;
  usage: {
    promptChars: number | null;
    completionChars: number | null;
    totalChars: number | null;
  };
  projectConfig: ProjectConfig;
}

interface DynoGenerationRuntimeBaseOptions {
  sdk: DynoSdk;
  cloudFallback: GenerationFallbackAdapter;
  telemetrySinks?: TelemetrySink[];
  runtimeManager?: RuntimeManager;
  localTimeoutMs?: number;
  localPollIntervalMs?: number;
  preflightTimeoutMs?: number;
  cloudFallbackTimeoutMs?: number;
  probeReadiness?: boolean;
  localFailureCooldownMs?: number;
  localFailureOpenAfter?: number;
}

export interface DynoGenerationRuntimeCustomProviderOptions extends DynoGenerationRuntimeBaseOptions {
  projectId: string;
  projectConfigProvider: ProjectConfigProvider;
}

export interface DynoGenerationRuntimeManagedOptions extends DynoGenerationRuntimeBaseOptions {
  projectApiKey: string;
  configResolverUrl?: string;
  resolverConfigPath?: string;
  resolverRequestTimeoutMs?: number;
  resolverFetch?: typeof fetch;
  projectConfigCache?: ProjectConfigCacheOptions;
}

export type DynoGenerationRuntimeInitOptions =
  | DynoGenerationRuntimeCustomProviderOptions
  | DynoGenerationRuntimeManagedOptions;

export type DynoGenerationRuntimeOptions = DynoGenerationRuntimeInitOptions;
export type ManagedGenerationConfigResolverErrorCode = ManagedResolverErrorCode;

const DEFAULT_RESOLVER_ORIGIN = 'http://127.0.0.1:3000';

function isCustomProviderOptions(
  options: DynoGenerationRuntimeInitOptions,
): options is DynoGenerationRuntimeCustomProviderOptions {
  return 'projectConfigProvider' in options;
}

function resolveManagedResolverOrigin(configResolverUrl?: string): string {
  const resolved = configResolverUrl?.trim() || process.env.DYNO_CONFIG_RESOLVER_URL?.trim() || DEFAULT_RESOLVER_ORIGIN;
  try {
    return new URL(resolved).origin;
  } catch {
    return resolved.replace(/\/+$/, '') || DEFAULT_RESOLVER_ORIGIN;
  }
}

function parseDynoGenerationOutput(
  output: unknown,
): Pick<GenerationExecutionResult, 'output' | 'model' | 'usage'> {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('Dyno generate_text job output has unexpected shape.');
  }
  const root = output as Record<string, unknown>;
  if (typeof root.output !== 'string' || root.output.trim() === '') {
    throw new Error('Dyno generate_text job output is missing non-empty string `output`.');
  }
  const usageRoot =
    root.usage && typeof root.usage === 'object' && !Array.isArray(root.usage)
      ? (root.usage as Record<string, unknown>)
      : {};
  const readNullableNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    output: root.output.trim(),
    model: typeof root.model === 'string' && root.model.trim() ? root.model : null,
    usage: {
      promptChars: readNullableNumber(usageRoot.promptChars),
      completionChars: readNullableNumber(usageRoot.completionChars),
      totalChars: readNullableNumber(usageRoot.totalChars),
    },
  };
}

function normalizeReasonFromLocalFailure(error: unknown): GenerationExecutionReason {
  if (!(error instanceof Error)) {
    return 'local_failure';
  }
  if (error.message.includes('waitForJobCompletion timed out')) {
    return 'local_job_timeout';
  }
  if (error.message.includes('/jobs') && error.message.includes('timed out')) {
    return 'local_job_timeout';
  }
  if (error.message.includes('Dyno agent request failed')) {
    return 'agent_unavailable';
  }
  if (error instanceof DynoSdkError && error.statusCode >= 500) {
    return 'local_agent_error';
  }
  return 'local_failure';
}

function mapTerminalLocalStateToFallbackReason(state: string): GenerationExecutionReason {
  if (state === 'failed') {
    return 'local_job_failed';
  }
  if (state === 'cancelled') {
    return 'local_job_cancelled';
  }
  if (state === 'queued' || state === 'running') {
    return 'local_job_incomplete';
  }
  return 'local_failure';
}

function isDynoSdkErrorWithStatus(error: unknown, statusCode: number): boolean {
  return error instanceof DynoSdkError && error.statusCode === statusCode;
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutLabel: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function emitTelemetry(sinks: TelemetrySink[] | undefined, event: TelemetryEvent): void {
  if (!sinks || sinks.length === 0) {
    return;
  }
  for (const sink of sinks) {
    let maybePromise: void | Promise<void>;
    try {
      maybePromise = sink(event);
    } catch {
      continue;
    }
    void Promise.resolve(maybePromise).catch(() => {
      // Best effort by design.
    });
  }
}

function normalizeFallbackFailureReason(error: unknown): 'fallback_adapter_timeout' | 'fallback_adapter_error' {
  if (error instanceof Error && error.message.includes('cloud_fallback timed out')) {
    return 'fallback_adapter_timeout';
  }
  return 'fallback_adapter_error';
}

function toGeneratePayload(text: string, options?: GenerateTextOptions): GenerateTextPayload {
  const payload: GenerateTextPayload = { text };
  if (options?.maxNewTokens !== undefined) {
    payload.max_new_tokens = options.maxNewTokens;
  }
  if (options?.temperature !== undefined) {
    payload.temperature = options.temperature;
  }
  if (options?.topP !== undefined) {
    payload.top_p = options.topP;
  }
  return payload;
}

export interface GenerateTextOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
}

export class DynoGenerationRuntime {
  private readonly projectId?: string;
  private readonly projectConfigProvider: ProjectConfigProvider;
  private readonly localTimeoutMs: number;
  private readonly localPollIntervalMs: number;
  private readonly preflightTimeoutMs: number;
  private readonly cloudFallbackTimeoutMs: number;
  private readonly probeReadiness: boolean;
  private readonly runtimeManager?: RuntimeManager;
  private readonly localFailureCooldownMs: number;
  private readonly localFailureOpenAfter: number;
  private localFailureStreak = 0;
  private localFailureCircuitOpenUntil = 0;

  constructor(private readonly options: DynoGenerationRuntimeInitOptions) {
    if (isCustomProviderOptions(options)) {
      const normalizedProjectId = options.projectId.trim();
      if (!normalizedProjectId) {
        throw new Error('projectId is required for DynoGenerationRuntime');
      }
      this.projectId = normalizedProjectId;
      this.projectConfigProvider = options.projectConfigProvider;
    } else {
      const managedProvider = new ManagedProjectConfigProvider({
        projectApiKey: options.projectApiKey,
        configResolverUrl: options.configResolverUrl,
        resolverConfigPath: options.resolverConfigPath,
        requestTimeoutMs: options.resolverRequestTimeoutMs,
        fetchImpl: options.resolverFetch,
      });
      this.projectConfigProvider = new CachedProjectConfigProvider(
        managedProvider,
        {
          ...options.projectConfigCache,
          cacheNamespace:
            options.projectConfigCache?.cacheNamespace ?? resolveManagedResolverOrigin(options.configResolverUrl),
        },
      );
    }
    this.localTimeoutMs = Math.max(1000, options.localTimeoutMs ?? 60_000);
    this.localPollIntervalMs = Math.max(50, options.localPollIntervalMs ?? 300);
    this.preflightTimeoutMs = Math.max(200, options.preflightTimeoutMs ?? 1_200);
    this.cloudFallbackTimeoutMs = Math.max(200, options.cloudFallbackTimeoutMs ?? 12_000);
    this.probeReadiness = options.probeReadiness ?? true;
    this.runtimeManager = options.runtimeManager;
    this.localFailureCooldownMs = Math.max(0, options.localFailureCooldownMs ?? 15_000);
    this.localFailureOpenAfter = Math.max(1, options.localFailureOpenAfter ?? 3);
  }

  async generateText(text: string, options?: GenerateTextOptions): Promise<GenerationExecutionResult> {
    const normalizedText = String(text).trim();
    if (!normalizedText) {
      throw new Error('text is required for generation');
    }
    const payload = toGeneratePayload(normalizedText, options);
    const startedAt = Date.now();
    let projectConfig: ProjectConfig;
    try {
      projectConfig = await this.projectConfigProvider.loadProjectConfig(this.projectId ?? '__managed__');
    } catch (error) {
      throw new Error(
        `Failed to load project config (config_load_failed): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const resolvedProjectId = projectConfig.projectId || this.projectId || 'unknown_project';

    if (projectConfig.use_case_type !== 'text_generation') {
      throw new Error(
        `Unsupported project use_case_type "${projectConfig.use_case_type}" for generation runtime (invalid_project_use_case).`,
      );
    }

    const scheduling = mapStrategyPresetToScheduling(projectConfig.strategy_preset);
    const preflight = await this.runLocalPreflight(scheduling.localMode);
    if (!preflight.ok) {
      this.registerLocalFailure(preflight.reason);
      return this.runCloudFallback(
        normalizedText,
        payload,
        projectConfig,
        resolvedProjectId,
        startedAt,
        preflight.reason,
        preflight.reasonCategory,
      );
    }

    try {
      const created = await this.options.sdk.createJob({
        taskType: 'generate_text',
        payload,
        executionPolicy: scheduling.executionPolicy,
        localMode: scheduling.localMode,
      });
      const finalJob = await this.options.sdk.waitForJobCompletion(created.id, {
        pollIntervalMs: this.localPollIntervalMs,
        timeoutMs: this.localTimeoutMs,
      });
      if (finalJob.state === 'completed') {
        const result = await this.options.sdk.getJobResult(created.id);
        const output = parseDynoGenerationOutput(result.output);
        const reason = 'local_job_completed';
        this.registerLocalSuccess();
        emitTelemetry(this.options.telemetrySinks, {
          eventType: 'generate_text_execution',
          projectId: resolvedProjectId,
          useCase: 'text_generation',
          decision: 'local',
          reason,
          reasonCategory: 'local_execution',
          durationMs: Date.now() - startedAt,
          fallbackInvoked: false,
        });
        return {
          ...output,
          decision: 'local',
          reason,
          reasonCategory: 'local_execution',
          projectConfig,
        };
      }
      const fallbackReason = mapTerminalLocalStateToFallbackReason(finalJob.state);
      this.registerLocalFailure(fallbackReason);
      return this.runCloudFallback(
        normalizedText,
        payload,
        projectConfig,
        resolvedProjectId,
        startedAt,
        fallbackReason,
        'local_execution',
      );
    } catch (error) {
      const fallbackReason = normalizeReasonFromLocalFailure(error);
      this.registerLocalFailure(fallbackReason);
      return this.runCloudFallback(
        normalizedText,
        payload,
        projectConfig,
        resolvedProjectId,
        startedAt,
        fallbackReason,
        'local_execution',
      );
    }
  }

  private async runLocalPreflight(
    localMode: LocalMode,
  ): Promise<{ ok: true } | { ok: false; reason: GenerationExecutionReason; reasonCategory: 'preflight' }> {
    if (this.isLocalCircuitOpen()) {
      return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
    }

    if (this.runtimeManager) {
      try {
        await withTimeout(
          () => this.runtimeManager!.ensureStarted({ timeoutMs: this.preflightTimeoutMs }),
          this.preflightTimeoutMs,
          'runtime_manager_start',
        );
      } catch {
        return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
      }
      try {
        const health = await withTimeout(
          () =>
            this.runtimeManager!.waitUntilHealthy({
              timeoutMs: this.preflightTimeoutMs,
              pollIntervalMs: Math.min(this.localPollIntervalMs, 250),
            }),
          this.preflightTimeoutMs,
          'agent_health_probe',
        );
        if (!health.ok) {
          return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
        }
      } catch {
        return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
      }

      if (!this.probeReadiness) {
        return { ok: true };
      }

      try {
        const readiness = await withTimeout(
          () =>
            this.runtimeManager!.waitUntilReady(localMode, {
              timeoutMs: this.preflightTimeoutMs,
              pollIntervalMs: Math.min(this.localPollIntervalMs, 250),
              waitForReady: true,
            }),
          this.preflightTimeoutMs,
          'agent_readiness_probe',
        );
        if (readiness === null) {
          return { ok: true };
        }
        const modeReady = getModeReadinessFlag(localMode, readiness);
        if (typeof modeReady !== 'boolean') {
          return { ok: false, reason: 'readiness_probe_failed', reasonCategory: 'preflight' };
        }
        if (!modeReady) {
          return {
            ok: false,
            reason: `local_not_ready_${localMode}`,
            reasonCategory: 'preflight',
          };
        }
        return { ok: true };
      } catch (error) {
        if (isDynoSdkErrorWithStatus(error, 404)) {
          return { ok: true };
        }
        return { ok: false, reason: 'readiness_probe_failed', reasonCategory: 'preflight' };
      }
    }

    let health: HealthResponse;
    try {
      health = await withTimeout(
        () => this.options.sdk.healthCheck(),
        this.preflightTimeoutMs,
        'agent_health_probe',
      );
      if (!health.ok) {
        return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
      }
    } catch {
      return { ok: false, reason: 'agent_unavailable', reasonCategory: 'preflight' };
    }

    if (!this.probeReadiness) {
      return { ok: true };
    }
    if (!supportsReadinessProbe(health)) {
      return { ok: true };
    }

    try {
      const readiness = await withTimeout(
        () => this.options.sdk.getReadinessDebug(),
        this.preflightTimeoutMs,
        'agent_readiness_probe',
      );
      const modeReady = getModeReadinessFlag(localMode, readiness);
      if (typeof modeReady !== 'boolean') {
        return { ok: false, reason: 'readiness_probe_failed', reasonCategory: 'preflight' };
      }
      if (!modeReady) {
        return {
          ok: false,
          reason: `local_not_ready_${localMode}`,
          reasonCategory: 'preflight',
        };
      }
      return { ok: true };
    } catch (error) {
      if (isDynoSdkErrorWithStatus(error, 404)) {
        return { ok: true };
      }
      return { ok: false, reason: 'readiness_probe_failed', reasonCategory: 'preflight' };
    }
  }

  private isLocalCircuitOpen(): boolean {
    return this.localFailureCircuitOpenUntil > Date.now();
  }

  private registerLocalSuccess(): void {
    this.localFailureStreak = 0;
    this.localFailureCircuitOpenUntil = 0;
  }

  private registerLocalFailure(reason: GenerationExecutionReason): void {
    if (this.localFailureCooldownMs <= 0) {
      return;
    }
    if (!this.shouldTrackLocalFailure(reason)) {
      return;
    }
    this.localFailureStreak += 1;
    if (this.localFailureStreak >= this.localFailureOpenAfter) {
      this.localFailureCircuitOpenUntil = Date.now() + this.localFailureCooldownMs;
    }
  }

  private shouldTrackLocalFailure(reason: GenerationExecutionReason): boolean {
    return (
      reason === 'agent_unavailable' ||
      reason === 'readiness_probe_failed' ||
      reason === 'local_not_ready_interactive' ||
      reason === 'local_not_ready_background' ||
      reason === 'local_not_ready_conservative' ||
      reason === 'local_job_failed' ||
      reason === 'local_job_cancelled' ||
      reason === 'local_job_incomplete' ||
      reason === 'local_job_timeout' ||
      reason === 'local_agent_error' ||
      reason === 'local_failure'
    );
  }

  private async runCloudFallback(
    text: string,
    payload: GenerateTextPayload,
    projectConfig: ProjectConfig,
    projectId: string,
    startedAt: number,
    reason: GenerationExecutionReason,
    reasonCategory: GenerationReasonCategory,
  ): Promise<GenerationExecutionResult> {
    if (projectConfig.fallback_enabled === false) {
      throw new Error(
        `Local execution failed (${reason}) and cloud fallback is disabled in project config (fallback_disabled).`,
      );
    }
    let fallbackResult: GenerationFallbackResult;
    try {
      fallbackResult = await withTimeout(
        () =>
          this.options.cloudFallback({
            text,
            payload,
            projectConfig,
            reason,
            reasonCategory,
          }),
        this.cloudFallbackTimeoutMs,
        'cloud_fallback',
      );
    } catch (error) {
      const fallbackReason = normalizeFallbackFailureReason(error);
      throw new Error(
        `Cloud fallback failed (${fallbackReason}) after local reason ${reason}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (typeof fallbackResult.output !== 'string' || fallbackResult.output.trim() === '') {
      throw new Error('cloudFallback returned an invalid generation output string');
    }
    const usage = fallbackResult.usage ?? {};
    const readNullableNumber = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    emitTelemetry(this.options.telemetrySinks, {
      eventType: 'generate_text_execution',
      projectId,
      useCase: 'text_generation',
      decision: 'cloud',
      reason,
      reasonCategory,
      durationMs: Date.now() - startedAt,
      fallbackInvoked: true,
    });

    return {
      output: fallbackResult.output.trim(),
      decision: 'cloud',
      reason,
      reasonCategory,
      model: fallbackResult.model?.trim() ? fallbackResult.model : null,
      usage: {
        promptChars: readNullableNumber(usage.promptChars),
        completionChars: readNullableNumber(usage.completionChars),
        totalChars: readNullableNumber(usage.totalChars),
      },
      projectConfig,
    };
  }
}
