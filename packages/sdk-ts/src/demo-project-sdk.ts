import { DynoSdk } from './client.js';
import {
  assertEmbeddingsUseCase,
  mapStrategyPresetToScheduling,
  type DemoProjectSdkContext,
  type DemoProjectSdkOptions,
} from './config-provider.js';
import type { ExecutionPolicy, LocalMode } from './types.js';

export async function createDemoProjectSdkContext(
  options: DemoProjectSdkOptions,
): Promise<DemoProjectSdkContext> {
  const projectId = options.projectId.trim();
  if (!projectId) {
    throw new Error('projectId is required for createDemoProjectSdkContext');
  }

  const projectConfig = await options.configProvider.loadProjectConfig(projectId);
  assertEmbeddingsUseCase(projectConfig);

  const sdk = new DynoSdk({
    ...options.sdkOptions,
    projectId: projectConfig.projectId,
  });

  return { sdk, projectConfig };
}

export function deriveSchedulingFromDemoProject(projectConfig: {
  strategy_preset: 'local_first' | 'balanced' | 'cloud_first';
}): { executionPolicy: ExecutionPolicy; localMode: LocalMode } {
  return mapStrategyPresetToScheduling(projectConfig.strategy_preset);
}
