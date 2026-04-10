import type { DynoSdk } from './client.js';
import type { DynoSdkOptions, ExecutionPolicy, LocalMode } from './types.js';

export type DemoProjectUseCaseType = 'embeddings' | string;
export type DemoStrategyPreset = 'local_first' | 'balanced' | 'cloud_first';

/**
 * Temporary normalized dashboard config shape for Step 21 Stage 2.
 * This is intentionally small and easy to replace with a control-plane provider later.
 */
export interface DemoProjectConfig {
  projectId: string;
  use_case_type: DemoProjectUseCaseType;
  strategy_preset: DemoStrategyPreset;
  local_model: string | null;
  cloud_model: string | null;
  requires_charging: boolean;
  wifi_only: boolean;
  battery_min_percent: number | null;
  idle_min_seconds: number | null;
}

export interface ConfigProvider {
  loadProjectConfig(projectId: string): Promise<DemoProjectConfig>;
}

export interface DemoProjectSdkContext {
  sdk: DynoSdk;
  projectConfig: DemoProjectConfig;
}

export interface DemoProjectSdkOptions {
  projectId: string;
  sdkOptions?: Omit<DynoSdkOptions, 'projectId'>;
  configProvider: ConfigProvider;
}

export function mapStrategyPresetToScheduling(strategy: DemoStrategyPreset): {
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
} {
  if (strategy === 'balanced') {
    return { executionPolicy: 'cloud_allowed', localMode: 'background' };
  }
  if (strategy === 'cloud_first') {
    return { executionPolicy: 'cloud_preferred', localMode: 'interactive' };
  }
  return { executionPolicy: 'local_only', localMode: 'interactive' };
}

export function assertEmbeddingsUseCase(config: DemoProjectConfig): void {
  if (config.use_case_type !== 'embeddings') {
    throw new Error(
      `Unsupported project use_case_type "${config.use_case_type}" for this demo path. ` +
        'Only "embeddings" is currently supported.',
    );
  }
}
