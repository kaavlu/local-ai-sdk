import { DynoSdk, DynoSdkError } from './client.js';
import type {
  HealthResponse,
  LocalMode,
  ReadinessDebugResponse,
  RuntimeManager,
  RuntimeManagerReadyOptions,
  RuntimeManagerStartOptions,
  RuntimeManagerState,
  RuntimeManagerStatus,
  RuntimeManagerWaitOptions,
} from './types.js';

export interface RuntimeManagerHooks {
  /**
   * Optional host-side runtime bootstrap hook (for example, start a sidecar process).
   * When omitted, runtime manager only probes the already configured local endpoint.
   */
  startRuntime?: () => void | Promise<void>;
  /**
   * Optional host-side runtime shutdown hook.
   * This remains internal to managed SDK flows and is not required by app developers.
   */
  stopRuntime?: (reason?: string) => void | Promise<void>;
}

export interface LocalRuntimeManagerOptions {
  sdk: DynoSdk;
  hooks?: RuntimeManagerHooks;
  startupTimeoutMs?: number;
  healthPollIntervalMs?: number;
  readinessPollIntervalMs?: number;
}

function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getModeReadinessFlag(
  localMode: LocalMode,
  readiness: ReadinessDebugResponse,
): boolean | undefined {
  if (localMode === 'background' && typeof readiness.backgroundLocalReady === 'boolean') {
    return readiness.backgroundLocalReady;
  }
  if (localMode === 'conservative' && typeof readiness.conservativeLocalReady === 'boolean') {
    return readiness.conservativeLocalReady;
  }
  if (localMode === 'interactive' && typeof readiness.interactiveLocalReady === 'boolean') {
    return readiness.interactiveLocalReady;
  }
  const nestedModeReady = readiness.readiness?.modes?.[localMode]?.isReady;
  if (typeof nestedModeReady === 'boolean') {
    return nestedModeReady;
  }
  return undefined;
}

export function supportsReadinessProbe(health: HealthResponse): boolean {
  return health.runtime?.capabilities?.readinessDebugV1 === true;
}

export class LocalRuntimeManager implements RuntimeManager {
  private readonly startupTimeoutMs: number;
  private readonly healthPollIntervalMs: number;
  private readonly readinessPollIntervalMs: number;
  private readonly hooks?: RuntimeManagerHooks;
  private startInFlight: Promise<void> | null = null;
  private status: RuntimeManagerStatus = {
    state: 'idle',
    lastError: null,
    lastCheckedAt: null,
    startedAt: null,
    healthy: false,
    ready: false,
  };

  constructor(private readonly options: LocalRuntimeManagerOptions) {
    this.hooks = options.hooks;
    this.startupTimeoutMs = Math.max(200, options.startupTimeoutMs ?? 4_000);
    this.healthPollIntervalMs = Math.max(50, options.healthPollIntervalMs ?? 250);
    this.readinessPollIntervalMs = Math.max(50, options.readinessPollIntervalMs ?? 250);
  }

  getStatus(): RuntimeManagerStatus {
    return { ...this.status };
  }

  async ensureStarted(options?: RuntimeManagerStartOptions): Promise<void> {
    const timeoutMs = Math.max(200, options?.timeoutMs ?? this.startupTimeoutMs);
    if (await this.tryHealthyOnce()) {
      return;
    }
    if (!this.hooks?.startRuntime) {
      this.updateStatus('unavailable', 'runtime manager start hook is not configured');
      throw new Error('runtime_manager_unavailable');
    }
    if (!this.startInFlight) {
      this.startInFlight = withTimeout(
        async () => {
          this.updateStatus('starting', null);
          await Promise.resolve(this.hooks?.startRuntime?.());
          this.status.startedAt = Date.now();
        },
        timeoutMs,
        'runtime_manager_start',
      ).finally(() => {
        this.startInFlight = null;
      });
    }
    await this.startInFlight;
  }

  async waitUntilHealthy(options?: RuntimeManagerWaitOptions): Promise<HealthResponse> {
    const timeoutMs = Math.max(200, options?.timeoutMs ?? this.startupTimeoutMs);
    const pollIntervalMs = Math.max(50, options?.pollIntervalMs ?? this.healthPollIntervalMs);
    const startedAt = Date.now();
    let lastError: unknown = null;
    while (Date.now() - startedAt <= timeoutMs) {
      try {
        const health = await this.options.sdk.healthCheck();
        this.status.lastCheckedAt = Date.now();
        if (health.ok) {
          this.status.healthy = true;
          this.updateStatus('healthy', null);
          return health;
        }
        lastError = new Error('health returned ok=false');
      } catch (error) {
        lastError = error;
      }
      await sleep(pollIntervalMs);
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
    this.updateStatus('unavailable', detail);
    throw new Error(`runtime_manager_health_timeout: ${detail}`);
  }

  async waitUntilReady(
    localMode: LocalMode,
    options?: RuntimeManagerReadyOptions,
  ): Promise<ReadinessDebugResponse | null> {
    const timeoutMs = Math.max(200, options?.timeoutMs ?? this.startupTimeoutMs);
    const pollIntervalMs = Math.max(50, options?.pollIntervalMs ?? this.readinessPollIntervalMs);
    const waitForReady = options?.waitForReady ?? true;
    const health = await this.waitUntilHealthy({ timeoutMs, pollIntervalMs });
    if (!supportsReadinessProbe(health)) {
      this.status.ready = true;
      this.updateStatus('ready', null);
      return null;
    }
    let lastReadiness: ReadinessDebugResponse | null = null;
    let lastError: unknown = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      try {
        const readiness = await this.options.sdk.getReadinessDebug();
        lastReadiness = readiness;
        const modeReady = getModeReadinessFlag(localMode, readiness);
        if (typeof modeReady === 'boolean') {
          this.status.lastCheckedAt = Date.now();
          this.status.ready = modeReady;
          this.updateStatus(modeReady ? 'ready' : 'degraded', null);
          if (!waitForReady || modeReady) {
            return readiness;
          }
        } else {
          lastError = new Error('readiness payload missing mode readiness flag');
        }
      } catch (error) {
        if (error instanceof DynoSdkError && error.statusCode === 404) {
          // Older agents may not expose /debug/readiness.
          this.status.ready = true;
          this.updateStatus('ready', null);
          return null;
        }
        lastError = error;
      }
      await sleep(pollIntervalMs);
    }
    if (lastReadiness) {
      return lastReadiness;
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
    this.updateStatus('unavailable', detail);
    throw new Error(`runtime_manager_readiness_timeout: ${detail}`);
  }

  private async tryHealthyOnce(): Promise<boolean> {
    try {
      const health = await this.options.sdk.healthCheck();
      this.status.lastCheckedAt = Date.now();
      this.status.healthy = health.ok;
      this.status.ready = health.ok;
      this.updateStatus(health.ok ? 'healthy' : 'unavailable', health.ok ? null : 'health returned ok=false');
      return health.ok;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.status.healthy = false;
      this.status.ready = false;
      this.updateStatus('unavailable', detail);
      return false;
    }
  }

  private updateStatus(state: RuntimeManagerState, lastError: string | null): void {
    this.status.state = state;
    this.status.lastError = lastError;
    this.status.lastCheckedAt = Date.now();
  }
}
