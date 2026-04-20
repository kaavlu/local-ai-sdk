import { DynoSdk, DynoSdkError } from './client.js';
import { mapStrategyPresetToScheduling, type ProjectConfig, type ProjectConfigProvider } from './config-provider.js';
import { ManagedProjectConfigProvider, type ManagedResolverErrorCode } from './demo-http-config-provider.js';
import { getModeReadinessFlag, supportsReadinessProbe } from './runtime-manager.js';
import type { HealthResponse, LocalMode, RuntimeManager } from './types.js';

export type ExecutionDecision = 'local' | 'cloud';

export type EmbeddingsReasonCategory = 'preflight' | 'local_execution' | 'fallback' | 'config';

export type EmbeddingsExecutionReason =
  | 'agent_unavailable'
  | 'readiness_probe_failed'
  | 'local_not_ready_interactive'
  | 'local_not_ready_background'
  | 'local_not_ready_conservative'
  | 'local_job_completed'
  | 'local_job_failed'
  | 'local_job_cancelled'
  | 'local_job_incomplete'
  | 'local_job_timeout'
  | 'local_agent_error'
  | 'local_failure'
  | 'fallback_disabled'
  | 'fallback_adapter_timeout'
  | 'fallback_adapter_error'
  | 'config_load_failed'
  | 'invalid_project_use_case';

export interface TelemetryEvent {
  eventType: 'embeddings_execution' | 'embeddings_batch_execution';
  projectId: string;
  useCase: 'embeddings';
  decision: ExecutionDecision | 'mixed';
  reason: EmbeddingsExecutionReason | 'batch_completed' | 'batch_partial_failure' | 'batch_failed';
  reasonCategory: EmbeddingsReasonCategory;
  durationMs: number;
  fallbackInvoked: boolean | 'mixed';
  itemCount?: number;
  successCount?: number;
  failureCount?: number;
}

export type TelemetrySink = (event: TelemetryEvent) => void | Promise<void>;

export interface EmbeddingsFallbackRequest {
  text: string;
  projectConfig: ProjectConfig;
  reason: EmbeddingsExecutionReason;
  reasonCategory: EmbeddingsReasonCategory;
}

export interface EmbeddingsFallbackResult {
  embedding: number[];
}

export type EmbeddingsFallbackAdapter = (
  request: EmbeddingsFallbackRequest,
) => Promise<EmbeddingsFallbackResult>;

export interface EmbeddingsExecutionResult {
  embedding: number[];
  decision: ExecutionDecision;
  reason: EmbeddingsExecutionReason;
  reasonCategory: EmbeddingsReasonCategory;
  projectConfig: ProjectConfig;
}

export interface ProjectConfigCacheOptions {
  ttlMs?: number;
  allowStaleOnError?: boolean;
  maxStaleMs?: number;
}

export class CachedProjectConfigProvider implements ProjectConfigProvider {
  private readonly ttlMs: number;
  private readonly allowStaleOnError: boolean;
  private readonly maxStaleMs: number;
  private readonly cache = new Map<string, { config: ProjectConfig; loadedAt: number }>();

  constructor(
    private readonly provider: ProjectConfigProvider,
    options?: ProjectConfigCacheOptions,
  ) {
    this.ttlMs = Math.max(0, options?.ttlMs ?? 30_000);
    this.allowStaleOnError = options?.allowStaleOnError ?? true;
    this.maxStaleMs = Math.max(0, options?.maxStaleMs ?? 10 * 60_000);
  }

  async loadProjectConfig(projectId: string): Promise<ProjectConfig> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      throw new Error('projectId is required to load project config');
    }

    const now = Date.now();
    if (this.ttlMs === 0) {
      // Explicit no-cache mode: cold-start failures should fail fast.
      return this.provider.loadProjectConfig(normalizedProjectId);
    }
    const cached = this.cache.get(normalizedProjectId);
    if (cached && now - cached.loadedAt <= this.ttlMs) {
      return cached.config;
    }

    try {
      const config = await this.provider.loadProjectConfig(normalizedProjectId);
      this.cache.set(normalizedProjectId, { config, loadedAt: now });
      return config;
    } catch (error) {
      if (cached && this.allowStaleOnError && now - cached.loadedAt <= this.maxStaleMs) {
        return cached.config;
      }
      if (!cached) {
        throw new Error(
          `Project config load failed for "${normalizedProjectId}" on cold start (config_load_failed): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      throw new Error(
        `Project config refresh failed for "${normalizedProjectId}" and stale cache is unavailable (config_load_failed): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function parseDynoEmbeddingOutput(output: unknown): number[] {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('Dyno embedding job output has unexpected shape.');
  }
  const maybeEmbedding = (output as Record<string, unknown>).embedding;
  if (!Array.isArray(maybeEmbedding) || !maybeEmbedding.every((value) => typeof value === 'number')) {
    throw new Error('Dyno embedding job output is missing numeric `embedding`.');
  }
  return maybeEmbedding;
}

function normalizeReasonFromLocalFailure(error: unknown): EmbeddingsExecutionReason {
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

function mapTerminalLocalStateToFallbackReason(state: string): EmbeddingsExecutionReason {
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
      // Best-effort by design: synchronous sink failures must not alter execution path.
      continue;
    }
    void Promise.resolve(maybePromise).catch(() => {
      // Best-effort by design: telemetry must not alter execution path.
    });
  }
}

function normalizeFallbackFailureReason(error: unknown): 'fallback_adapter_timeout' | 'fallback_adapter_error' {
  if (error instanceof Error && error.message.includes('cloud_fallback timed out')) {
    return 'fallback_adapter_timeout';
  }
  return 'fallback_adapter_error';
}

interface DynoEmbeddingsRuntimeBaseOptions {
  sdk: DynoSdk;
  cloudFallback: EmbeddingsFallbackAdapter;
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

export interface DynoEmbeddingsRuntimeCustomProviderOptions extends DynoEmbeddingsRuntimeBaseOptions {
  projectId: string;
  projectConfigProvider: ProjectConfigProvider;
}

export interface DynoEmbeddingsRuntimeManagedOptions extends DynoEmbeddingsRuntimeBaseOptions {
  projectApiKey: string;
  configResolverUrl?: string;
  resolverConfigPath?: string;
  resolverRequestTimeoutMs?: number;
  resolverFetch?: typeof fetch;
  projectConfigCache?: ProjectConfigCacheOptions;
}

export type DynoEmbeddingsRuntimeInitOptions =
  | DynoEmbeddingsRuntimeCustomProviderOptions
  | DynoEmbeddingsRuntimeManagedOptions;

export type DynoEmbeddingsRuntimeOptions = DynoEmbeddingsRuntimeInitOptions;

export type ManagedConfigResolverErrorCode = ManagedResolverErrorCode;

function isCustomProviderOptions(
  options: DynoEmbeddingsRuntimeInitOptions,
): options is DynoEmbeddingsRuntimeCustomProviderOptions {
  return 'projectConfigProvider' in options;
}

export interface EmbedTextsOptions {
  failFast?: boolean;
}

export type EmbeddingsBatchItemResult =
  | { ok: true; index: number; text: string; result: EmbeddingsExecutionResult }
  | { ok: false; index: number; text: string; error: string };

export interface EmbeddingsBatchExecutionResult {
  itemCount: number;
  successCount: number;
  failureCount: number;
  results: EmbeddingsBatchItemResult[];
  durationMs: number;
}

export class DynoEmbeddingsRuntime {
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

  constructor(private readonly options: DynoEmbeddingsRuntimeInitOptions) {
    if (isCustomProviderOptions(options)) {
      const normalizedProjectId = options.projectId.trim();
      if (!normalizedProjectId) {
        throw new Error('projectId is required for DynoEmbeddingsRuntime');
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
        options.projectConfigCache,
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

  async embedText(text: string): Promise<EmbeddingsExecutionResult> {
    const normalizedText = String(text).trim();
    if (!normalizedText) {
      throw new Error('text is required for embeddings');
    }

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

    if (projectConfig.use_case_type !== 'embeddings') {
      throw new Error(
        `Unsupported project use_case_type "${projectConfig.use_case_type}" for embeddings runtime (invalid_project_use_case).`,
      );
    }

    const scheduling = mapStrategyPresetToScheduling(projectConfig.strategy_preset);
    const preflight = await this.runLocalPreflight(scheduling.localMode);
    if (!preflight.ok) {
      this.registerLocalFailure(preflight.reason);
      return this.runCloudFallback(
        normalizedText,
        projectConfig,
        resolvedProjectId,
        startedAt,
        preflight.reason,
        preflight.reasonCategory,
      );
    }

    try {
      const created = await this.options.sdk.createJob({
        taskType: 'embed_text',
        payload: { text: normalizedText },
        executionPolicy: scheduling.executionPolicy,
        localMode: scheduling.localMode,
      });

      const finalJob = await this.options.sdk.waitForJobCompletion(created.id, {
        pollIntervalMs: this.localPollIntervalMs,
        timeoutMs: this.localTimeoutMs,
      });

      if (finalJob.state === 'completed') {
        const result = await this.options.sdk.getJobResult(created.id);
        const output = parseDynoEmbeddingOutput(result.output);
        const reason = 'local_job_completed';
        this.registerLocalSuccess();
        emitTelemetry(this.options.telemetrySinks, {
          eventType: 'embeddings_execution',
          projectId: resolvedProjectId,
          useCase: 'embeddings',
          decision: 'local',
          reason,
          reasonCategory: 'local_execution',
          durationMs: Date.now() - startedAt,
          fallbackInvoked: false,
        });
        return {
          embedding: output,
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
        projectConfig,
        resolvedProjectId,
        startedAt,
        fallbackReason,
        'local_execution',
      );
    }
  }

  async embedTexts(texts: string[], options?: EmbedTextsOptions): Promise<EmbeddingsBatchExecutionResult> {
    const startedAt = Date.now();
    const values = Array.isArray(texts) ? texts : [];
    if (values.length === 0) {
      throw new Error('texts must contain at least one entry for embedTexts');
    }
    const failFast = options?.failFast ?? false;
    const results: EmbeddingsBatchItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    let telemetryProjectId = this.projectId || 'unknown_project';
    for (const [index, text] of values.entries()) {
      try {
        const result = await this.embedText(text);
        results.push({ ok: true, index, text, result });
        telemetryProjectId = result.projectConfig.projectId || telemetryProjectId;
        successCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ ok: false, index, text, error: message });
        failureCount += 1;
        if (failFast) {
          break;
        }
      }
    }

    const itemCount = results.length;
    const batchReason =
      failureCount === 0 ? 'batch_completed' : successCount > 0 ? 'batch_partial_failure' : 'batch_failed';
    emitTelemetry(this.options.telemetrySinks, {
      eventType: 'embeddings_batch_execution',
      projectId: telemetryProjectId,
      useCase: 'embeddings',
      decision: failureCount === 0 ? 'local' : successCount === 0 ? 'cloud' : 'mixed',
      reason: batchReason,
      reasonCategory: 'fallback',
      durationMs: Date.now() - startedAt,
      fallbackInvoked: failureCount === 0 ? false : successCount === 0 ? true : 'mixed',
      itemCount,
      successCount,
      failureCount,
    });

    return {
      itemCount,
      successCount,
      failureCount,
      results,
      durationMs: Date.now() - startedAt,
    }
  }

  /**
   * Enforces bounded probe order before enqueueing local work:
   * 1) `/health` to avoid TCP/connect stalls and discover capabilities
   * 2) optional `/debug/readiness` gate check (when advertised by runtime contract)
   * 3) job enqueue when local path remains eligible
   */
  private async runLocalPreflight(
    localMode: LocalMode,
  ): Promise<{ ok: true } | { ok: false; reason: EmbeddingsExecutionReason; reasonCategory: 'preflight' }> {
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
      // Legacy runtime (no handshake/capability): do not fail local path for missing readiness support.
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
        // Older agents may not expose /debug/readiness yet.
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

  private registerLocalFailure(reason: EmbeddingsExecutionReason): void {
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

  private shouldTrackLocalFailure(reason: EmbeddingsExecutionReason): boolean {
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
    projectConfig: ProjectConfig,
    projectId: string,
    startedAt: number,
    reason: EmbeddingsExecutionReason,
    reasonCategory: EmbeddingsReasonCategory,
  ): Promise<EmbeddingsExecutionResult> {
    if (projectConfig.fallback_enabled === false) {
      throw new Error(
        `Local execution failed (${reason}) and cloud fallback is disabled in project config (fallback_disabled).`,
      );
    }

    let fallbackResult: EmbeddingsFallbackResult;
    try {
      fallbackResult = await withTimeout(
        () =>
          this.options.cloudFallback({
            text,
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

    if (
      !Array.isArray(fallbackResult.embedding) ||
      !fallbackResult.embedding.every((value) => typeof value === 'number')
    ) {
      throw new Error('cloudFallback returned an invalid embedding vector');
    }

    emitTelemetry(this.options.telemetrySinks, {
      eventType: 'embeddings_execution',
      projectId,
      useCase: 'embeddings',
      decision: 'cloud',
      reason,
      reasonCategory,
      durationMs: Date.now() - startedAt,
      fallbackInvoked: true,
    });

    return {
      embedding: fallbackResult.embedding,
      decision: 'cloud',
      reason,
      reasonCategory,
      projectConfig,
    };
  }
}
