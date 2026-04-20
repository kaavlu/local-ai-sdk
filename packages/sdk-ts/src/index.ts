/** Public exports for `@dyno/sdk-ts` — primary SDK integration surface for the local runtime (SDK-first architecture; see repo AGENTS.md). */
/** GA default entrypoint. */
export { Dyno } from './dyno.js';
/** Advanced/internal low-level runtime HTTP client. */
export { DynoSdk, DynoSdkError } from './client.js';
/** Advanced/internal runtime building blocks. */
export { CachedProjectConfigProvider, DynoEmbeddingsRuntime } from './embeddings-runtime.js';
export { ManagedProjectConfigProvider, ManagedResolverError } from './demo-http-config-provider.js';
export {
  ProjectConfig,
  ProjectConfigProvider,
  ProjectStrategyPreset,
  ProjectUseCaseType,
} from './config-provider.js';
export type {
  DynoFallbackConfig,
  DynoInitOptions,
  DynoRuntimeStatus,
  DynoStatus,
} from './dyno.js';
/** Advanced/internal runtime and telemetry types. */
export type {
  EmbeddingsBatchExecutionResult,
  EmbeddingsBatchItemResult,
  EmbeddingsExecutionReason,
  EmbeddingsExecutionResult,
  EmbeddingsFallbackAdapter,
  EmbeddingsFallbackRequest,
  EmbeddingsFallbackResult,
  EmbeddingsReasonCategory,
  EmbedTextsOptions,
  DynoEmbeddingsRuntimeCustomProviderOptions,
  DynoEmbeddingsRuntimeManagedOptions,
  DynoEmbeddingsRuntimeOptions,
  ManagedConfigResolverErrorCode,
  TelemetryEvent,
  TelemetrySink,
} from './embeddings-runtime.js';
export type { ManagedProjectConfigProviderOptions, ManagedResolverErrorCode } from './demo-http-config-provider.js';
/** Advanced/internal low-level runtime client types. */
export type {
  CancelJobResponse,
  ClassifyTextPayload,
  CreateJobRequest,
  CreateJobResponse,
  DatabaseDebugInfo,
  DebugMetricsResponse,
  DeviceProfileRecord,
  EmbedTextModelDebugRow,
  EmbedTextModelState,
  EmbedTextPayload,
  ExecutionPolicy,
  HealthResponse,
  JobRecord,
  JobResultRecord,
  JobState,
  DynoSdkOptions,
  LocalMode,
  MachineStateDebugRecord,
  MachineStateInput,
  MetricsJobStatusCounts,
  ModelDebugInfo,
  RuntimeCapabilities,
  RuntimeContractInfo,
  RuntimeLifecycleState,
  WorkloadModelRuntimeDebugInfo,
  WaitForJobCompletionOptions,
  WorkerDebugInfo,
} from './types.js';
export { createHttpTelemetrySink } from './telemetry-http-sink.js';
export type { HttpTelemetrySinkOptions } from './telemetry-http-sink.js';
