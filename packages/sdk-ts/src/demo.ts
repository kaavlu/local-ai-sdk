/** Demo-only exports. Prefer primary runtime APIs from the package root for production integrations. */
export {
  createDemoProjectSdkContext,
  deriveSchedulingFromDemoProject,
} from './demo-project-sdk.js';
export {
  ManagedProjectConfigProvider,
  ManagedResolverError,
} from './demo-http-config-provider.js';
export { SupabaseDemoConfigProvider } from './demo-supabase-config-provider.js';
export { createHttpTelemetrySink } from './telemetry-http-sink.js';
export type { HttpTelemetrySinkOptions } from './telemetry-http-sink.js';
export type {
  ConfigProvider,
  DemoProjectConfig,
  DemoProjectSdkContext,
  DemoProjectSdkOptions,
  DemoProjectUseCaseType,
  DemoStrategyPreset,
} from './config-provider.js';
export type { ManagedProjectConfigProviderOptions, ManagedResolverErrorCode } from './demo-http-config-provider.js';
