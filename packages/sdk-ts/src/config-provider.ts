import type { DynoSdk } from './client.js';
import type { DynoSdkOptions, ExecutionPolicy, LocalMode } from './types.js';

/** Canonical use-case label from project config (dashboard-controlled). */
export type ProjectUseCaseType = 'embeddings' | string;
/** Matches dashboard strategy values; do not invent parallel enums. */
export type ProjectStrategyPreset = 'local_first' | 'balanced' | 'cloud_first';

/**
 * Temporary normalized dashboard config shape for Step 21 Stage 2.
 * This is intentionally small and easy to replace with a control-plane provider later.
 */
export interface ProjectConfig {
  projectId: string;
  use_case_type: ProjectUseCaseType;
  strategy_preset: ProjectStrategyPreset;
  local_model: string | null;
  cloud_model: string | null;
  /** Mirrors dashboard `fallback_enabled` when available; defaults to true when omitted. */
  fallback_enabled?: boolean;
  requires_charging: boolean;
  wifi_only: boolean;
  battery_min_percent: number | null;
  idle_min_seconds: number | null;
}

/** Primary config provider interface for SDK runtime orchestration. */
export interface ProjectConfigProvider {
  loadProjectConfig(projectId: string): Promise<ProjectConfig>;
}

export interface DemoProjectSdkContext {
  sdk: DynoSdk;
  projectConfig: ProjectConfig;
}

export interface DemoProjectSdkOptions {
  projectId: string;
  sdkOptions?: Omit<DynoSdkOptions, 'projectId'>;
  configProvider: ProjectConfigProvider;
}

export function mapStrategyPresetToScheduling(strategy: ProjectStrategyPreset): {
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

/** @deprecated Use `ProjectUseCaseType`. */
export type DemoProjectUseCaseType = ProjectUseCaseType;
/** @deprecated Use `ProjectStrategyPreset`. */
export type DemoStrategyPreset = ProjectStrategyPreset;
/** @deprecated Use `ProjectConfig`. */
export type DemoProjectConfig = ProjectConfig;
/** @deprecated Use `ProjectConfigProvider`. */
export type ConfigProvider = ProjectConfigProvider;
