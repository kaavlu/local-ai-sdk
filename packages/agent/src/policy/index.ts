import type { CapabilityResult } from '../capability/index.js';
import type { MachineReadiness, ReadinessSignalsSnapshot } from '../worker/readiness.js';

export type ExecutionPolicy = 'local_only' | 'cloud_allowed' | 'cloud_preferred';

export type LocalMode = 'interactive' | 'background' | 'conservative';

export type ExecutionDecision = 'run_local' | 'run_cloud' | 'queue';

/** When a job requires GPU, local execution needs a reported free VRAM signal above this floor. */
const DEFAULT_MIN_GPU_FREE_MB_FOR_GPU_JOB = 256;

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

function gpuSignalUsableForJob(capability: CapabilityResult, signals: ReadinessSignalsSnapshot): boolean {
  if (!capability.requiresGpu) {
    return true;
  }
  const free = signals.gpuMemoryFreeMb;
  if (free == null) {
    return false;
  }
  const minMb = capability.constraints?.minGpuMemoryMb ?? DEFAULT_MIN_GPU_FREE_MB_FOR_GPU_JOB;
  return free >= minMb;
}

function policyAllowsCloud(executionPolicy: ExecutionPolicy): boolean {
  return executionPolicy === 'cloud_allowed' || executionPolicy === 'cloud_preferred';
}

/**
 * Capability → readiness → policy. Does not re-evaluate readiness gates; uses Step 15 result as-is.
 */
export function resolveExecutionDecision(input: {
  executionPolicy: ExecutionPolicy;
  localMode: LocalMode;
  capability: CapabilityResult;
  machineReadiness: MachineReadiness;
  cloudAvailable: boolean;
}): ExecutionDecision {
  const signals = input.machineReadiness.byMode.interactive.signals;
  const gpuOk = gpuSignalUsableForJob(input.capability, signals);
  const capabilityAllowsLocal = input.capability.canRunLocally && gpuOk;
  const localOk = localReadyForMode(input.localMode, input.machineReadiness);
  const cloudOk = policyAllowsCloud(input.executionPolicy) && input.cloudAvailable;
  const preferCloud =
    input.capability.preferredExecution === 'cloud' && cloudOk && input.executionPolicy !== 'local_only';

  if (!capabilityAllowsLocal) {
    if (cloudOk) {
      return 'run_cloud';
    }
    return 'queue';
  }

  switch (input.executionPolicy) {
    case 'local_only':
      return localOk ? 'run_local' : 'queue';
    case 'cloud_allowed':
      if (preferCloud) {
        return 'run_cloud';
      }
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
