import { DynoSdk } from './client.js';
import {
  DynoEmbeddingsRuntime,
  type EmbeddingsBatchExecutionResult,
  type EmbeddingsExecutionResult,
  type EmbeddingsFallbackAdapter,
  type ProjectConfigCacheOptions,
  type TelemetrySink,
} from './embeddings-runtime.js';
import {
  DynoGenerationRuntime,
  type GenerationExecutionResult,
  type GenerationFallbackAdapter,
  type GenerateTextOptions,
} from './generation-runtime.js';
import { createDefaultRuntimeController } from './host-adapters/default-runtime-controller.js';
import { LocalRuntimeManager } from './runtime-manager.js';
import { createHttpTelemetrySink } from './telemetry-http-sink.js';

const DEFAULT_AGENT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_EMBEDDINGS_FALLBACK_MODEL = 'text-embedding-3-small';
const DEFAULT_GENERATION_FALLBACK_MODEL = 'gpt-4.1-mini';

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

function parseTextFromFallbackResponse(payload: unknown): string {
  if (payload == null || typeof payload !== 'object') {
    throw new Error('fallback response was not an object');
  }
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text.trim();
  }
  if (Array.isArray(root.output) && root.output.length > 0) {
    const first = root.output[0];
    if (first && typeof first === 'object') {
      const firstRoot = first as Record<string, unknown>;
      if (Array.isArray(firstRoot.content) && firstRoot.content.length > 0) {
        const head = firstRoot.content[0];
        if (head && typeof head === 'object') {
          const text = (head as Record<string, unknown>).text;
          if (typeof text === 'string' && text.trim()) {
            return text.trim();
          }
        }
      }
    }
  }
  if (Array.isArray(root.choices) && root.choices.length > 0) {
    const choice = root.choices[0];
    if (choice && typeof choice === 'object') {
      const message = (choice as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string' && content.trim()) {
          return content.trim();
        }
      }
      const text = (choice as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }
  throw new Error('fallback response did not include generated text');
}

function readOptionalEnvVar(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function resolveDynoTelemetrySinks(
  explicitTelemetrySinks: TelemetrySink[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): TelemetrySink[] | undefined {
  const telemetryUrl = readOptionalEnvVar(env, 'DYNO_TELEMETRY_URL');
  const telemetryApiKey = readOptionalEnvVar(env, 'DYNO_TELEMETRY_API_KEY');
  if (!telemetryUrl) {
    return explicitTelemetrySinks;
  }
  const defaultSink = createHttpTelemetrySink({
    endpointUrl: telemetryUrl,
    apiKey: telemetryApiKey,
  });
  return [...(explicitTelemetrySinks ?? []), defaultSink];
}

export interface DynoFallbackConfig {
  /**
   * Adapter-first fallback contract (recommended/default):
   * app code owns provider client + credentials and Dyno invokes this adapter.
   */
  adapter?: EmbeddingsFallbackAdapter;
  /**
   * Adapter-first generation fallback contract (recommended/default for generateText).
   * app code owns provider client + credentials and Dyno invokes this adapter.
   */
  generateTextAdapter?: GenerationFallbackAdapter;
  /**
   * Convenience HTTP fallback wrapper (secondary):
   * provide provider base URL + API key when you do not pass explicit adapters.
   */
  baseUrl?: string;
  apiKey?: string;
  /** Embeddings model for convenience wrapper. */
  model?: string;
  /** Generation model for convenience wrapper. */
  generationModel?: string;
  embedPath?: string;
  generatePath?: string;
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
  /**
   * Project-config cache behavior for managed onboarding.
   * Defaults to in-memory LKG cache with bounded stale-on-error behavior.
   */
  projectConfigCache?: ProjectConfigCacheOptions;
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
  /**
   * Advanced/internal access to the generation runtime internals.
   * Prefer `generateText` in GA integrations.
   */
  readonly generation: DynoGenerationRuntime;

  private constructor(
    sdk: DynoSdk,
    embeddings: DynoEmbeddingsRuntime,
    generation: DynoGenerationRuntime,
    private readonly runtimeManager: LocalRuntimeManager,
    private readonly runtimeController: ReturnType<typeof createDefaultRuntimeController>,
  ) {
    this.sdk = sdk;
    this.embeddings = embeddings;
    this.generation = generation;
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
    const telemetrySinks = resolveDynoTelemetrySinks(options.telemetrySinks);

    const embeddingsRuntime = new DynoEmbeddingsRuntime({
      projectApiKey: options.projectApiKey,
      configResolverUrl: options.configResolverUrl,
      sdk,
      runtimeManager,
      telemetrySinks,
      projectConfigCache: options.projectConfigCache,
      cloudFallback: Dyno.buildEmbeddingsFallbackAdapter(options.fallback),
    });
    const generationRuntime = new DynoGenerationRuntime({
      projectApiKey: options.projectApiKey,
      configResolverUrl: options.configResolverUrl,
      sdk,
      runtimeManager,
      telemetrySinks,
      projectConfigCache: options.projectConfigCache,
      cloudFallback: Dyno.buildGenerationFallbackAdapter(options.fallback),
    });

    await runtimeManager.ensureStarted();
    await runtimeManager.waitUntilHealthy();
    return new Dyno(sdk, embeddingsRuntime, generationRuntime, runtimeManager, runtimeController);
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

  async generateText(text: string, options?: GenerateTextOptions): Promise<GenerationExecutionResult> {
    return this.generation.generateText(text, options);
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

  private static buildEmbeddingsFallbackAdapter(fallback: DynoFallbackConfig): EmbeddingsFallbackAdapter {
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
    const model = fallback.model?.trim() || DEFAULT_EMBEDDINGS_FALLBACK_MODEL;
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

  private static buildGenerationFallbackAdapter(fallback: DynoFallbackConfig): GenerationFallbackAdapter {
    if (fallback.generateTextAdapter) {
      return fallback.generateTextAdapter;
    }
    const baseUrl = fallback.baseUrl?.trim();
    const apiKey = fallback.apiKey?.trim();
    if (!baseUrl || !apiKey) {
      return async () => {
        throw new Error(
          'generateText fallback contract requires app-owned fallback.generateTextAdapter, or fallback.baseUrl + fallback.apiKey for the convenience HTTP wrapper',
        );
      };
    }
    const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
    const generatePath = fallback.generatePath?.trim() || '/chat/completions';
    const model = fallback.generationModel?.trim() || DEFAULT_GENERATION_FALLBACK_MODEL;
    return async ({ payload }) => {
      const response = await fetch(`${resolvedBaseUrl}${generatePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: payload.text }],
          max_tokens: payload.max_new_tokens,
          temperature: payload.temperature,
          top_p: payload.top_p,
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
        output: parseTextFromFallbackResponse(parsed),
        model,
      };
    };
  }
}
