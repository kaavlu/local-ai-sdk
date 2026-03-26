import type { MachineReadiness } from '../worker/readiness.js';

export type ExecutionPolicy = 'local_only' | 'cloud_allowed' | 'cloud_preferred';

export type LocalMode = 'interactive' | 'background' | 'conservative';

export type ExecutionDecision = 'run_local' | 'run_cloud' | 'queue';

function localReadyForMode(
  localMode: LocalMode,
  machineReadiness: MachineReadiness,
): boolean {
  switch (localMode) {
    case 'interactive':
      return machineReadiness.interactiveLocalReady;
    case 'background':
      return machineReadiness.backgroundLocalReady;
    case 'conservative':
      return machineReadiness.conservativeLocalReady;
    default:
      return false;
  }
}

export function resolveExecutionDecision(input: {
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
  machineReadiness: MachineReadiness;
  cloudAvailable: boolean;
}): ExecutionDecision {
  const localOk = localReadyForMode(input.localMode, input.machineReadiness);

  switch (input.executionPolicy) {
    case 'local_only':
      return localOk ? 'run_local' : 'queue';
    case 'cloud_allowed':
      if (localOk) {
        return 'run_local';
      }
      if (input.cloudAvailable) {
        return 'run_cloud';
      }
      return 'queue';
    case 'cloud_preferred':
      if (input.cloudAvailable) {
        return 'run_cloud';
      }
      if (localOk) {
        return 'run_local';
      }
      return 'queue';
    default:
      return 'queue';
  }
}
