import { DynoSdk } from './client.js';
import {
  DynoEmbeddingsRuntime,
  type EmbeddingsBatchExecutionResult,
  type EmbeddingsExecutionResult,
  type EmbeddingsFallbackAdapter,
  type TelemetrySink,
} from './embeddings-runtime.js';
import { createDefaultRuntimeController } from './host-adapters/default-runtime-controller.js';
import { LocalRuntimeManager } from './runtime-manager.js';

const DEFAULT_AGENT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_FALLBACK_MODEL = 'text-embedding-3-small';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function parseEmbeddingFromFallbackResponse(payload: unknown): number[] {
  if (payload == null || typeof payload !== 'object') {
    throw new Error('fallback response was not an object');
  }
  const root = payload as Record<string, unknown>;
  const directEmbedding = root.embedding;
  if (Array.isArray(directEmbedding) && directEmbedding.every((value) => typeof value === 'number')) {
    return directEmbedding;
  }
  const data = root.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if (
      first &&
      Array.isArray(first.embedding) &&
      first.embedding.every((value) => typeof value === 'number')
    ) {
      return first.embedding as number[];
    }
  }
  throw new Error('fallback response did not include a numeric embedding vector');
}

export interface DynoFallbackConfig {
  /**
   * Adapter-first fallback contract (recommended/default):
   * app code owns provider client + credentials and Dyno invokes this adapter.
   */
  adapter?: EmbeddingsFallbackAdapter;
  /**
   * Convenience HTTP fallback wrapper (secondary):
   * provide provider base URL + API key when you do not pass `adapter`.
   */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  embedPath?: string;
}

export interface DynoInitOptions {
  /** Project-scoped API key used by managed config onboarding. */
  projectApiKey: string;
  /** Optional managed config resolver endpoint override. */
  configResolverUrl?: string;
  /** Optional project identifier context hint for runtime calls. */
  projectId?: string;
  /**
   * Advanced override for the runtime HTTP endpoint.
   * By default, the SDK resolves and manages local runtime endpoints internally.
   */
  agentBaseUrl?: string;
  /**
   * App-owned fallback contract.
   * Prefer `fallback.adapter`; `baseUrl/apiKey/model` is a convenience HTTP wrapper.
   */
  fallback: DynoFallbackConfig;
  telemetrySinks?: TelemetrySink[];
}

export interface DynoRuntimeStatus {
  state: string;
  healthy: boolean;
  ready: boolean;
  lastError: string | null;
  runtimeSource: 'packaged' | 'development' | 'external';
  runtimeVersion: string | null;
  helperPath: string | null;
  agentBaseUrl: string;
}

export interface DynoStatus {
  runtime: DynoRuntimeStatus;
}

export class Dyno {
  /**
   * Advanced/internal escape hatch to low-level runtime HTTP operations.
   * Not part of the GA quickstart contract.
   */
  readonly sdk: DynoSdk;

  /**
   * Advanced/internal access to the embeddings runtime internals.
   * Prefer `embedText` / `embedTexts` in GA integrations.
   */
  readonly embeddings: DynoEmbeddingsRuntime;

  private constructor(
    sdk: DynoSdk,
    embeddings: DynoEmbeddingsRuntime,
    private readonly runtimeManager: LocalRuntimeManager,
    private readonly runtimeController: ReturnType<typeof createDefaultRuntimeController>,
  ) {
    this.sdk = sdk;
    this.embeddings = embeddings;
  }

  static async init(options: DynoInitOptions): Promise<Dyno> {
    const explicitAgentBaseUrl = options.agentBaseUrl?.trim() || process.env.DYNO_AGENT_URL?.trim() || '';
    const runtimeController = createDefaultRuntimeController({
      agentBaseUrl: explicitAgentBaseUrl ? normalizeBaseUrl(explicitAgentBaseUrl) : undefined,
      projectId: options.projectId,
      configResolverUrl: options.configResolverUrl,
    });
    await runtimeController.ensureStarted();

    const resolvedAgentBaseUrl = normalizeBaseUrl(
      runtimeController.getAgentBaseUrl() || DEFAULT_AGENT_BASE_URL,
    );
    const sdk = new DynoSdk({
      baseUrl: resolvedAgentBaseUrl,
      projectId: options.projectId,
    });
    const runtimeManager = new LocalRuntimeManager({
      sdk,
      hooks: {
        startRuntime: () => runtimeController.ensureStarted(),
      },
    });

    const runtime = new DynoEmbeddingsRuntime({
      projectApiKey: options.projectApiKey,
      configResolverUrl: options.configResolverUrl,
      sdk,
      runtimeManager,
      telemetrySinks: options.telemetrySinks,
      cloudFallback: Dyno.buildFallbackAdapter(options.fallback),
    });

    await runtimeManager.ensureStarted();
    await runtimeManager.waitUntilHealthy();
    return new Dyno(sdk, runtime, runtimeManager, runtimeController);
  }

  async shutdown(reason = 'sdk_shutdown'): Promise<void> {
    await this.runtimeController.shutdown(reason);
  }

  async embedText(text: string): Promise<EmbeddingsExecutionResult> {
    return this.embeddings.embedText(text);
  }

  async embedTexts(texts: string[]): Promise<EmbeddingsBatchExecutionResult> {
    return this.embeddings.embedTexts(texts);
  }

  async getStatus(): Promise<DynoStatus> {
    const managerStatus = this.runtimeManager.getStatus();
    const controllerStatus = this.runtimeController.getStatus();
    return {
      runtime: {
        state: managerStatus.state,
        healthy: managerStatus.healthy,
        ready: managerStatus.ready,
        lastError: managerStatus.lastError ?? controllerStatus.lastError,
        runtimeSource: controllerStatus.runtimeSource,
        runtimeVersion: controllerStatus.runtimeVersion,
        helperPath: controllerStatus.helperPath,
        agentBaseUrl: controllerStatus.agentBaseUrl ?? this.runtimeController.getAgentBaseUrl(),
      },
    };
  }

  private static buildFallbackAdapter(fallback: DynoFallbackConfig): EmbeddingsFallbackAdapter {
    if (fallback.adapter) {
      return fallback.adapter;
    }
    const baseUrl = fallback.baseUrl?.trim();
    const apiKey = fallback.apiKey?.trim();
    if (!baseUrl || !apiKey) {
      throw new Error(
        'fallback contract requires app-owned fallback.adapter, or fallback.baseUrl + fallback.apiKey for the convenience HTTP wrapper',
      );
    }
    const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
    const embedPath = fallback.embedPath?.trim() || '/embeddings';
    const model = fallback.model?.trim() || DEFAULT_FALLBACK_MODEL;
    return async ({ text }) => {
      const response = await fetch(`${resolvedBaseUrl}${embedPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          model,
          input: text,
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`fallback provider returned ${response.status}: ${raw || '(empty body)'}`);
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('fallback provider returned invalid JSON');
      }
      return {
        embedding: parseEmbeddingFromFallbackResponse(parsed),
      };
    };
  }
}
