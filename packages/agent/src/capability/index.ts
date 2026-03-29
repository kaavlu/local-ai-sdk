import type { MachineStateRecord } from '../machine-state/index.js';

export type PreferredExecution = 'local' | 'cloud';

/** What the machine can do for a job type, separate from readiness and policy. */
export interface CapabilityResult {
  jobType: string;
  canRunLocally: boolean;
  requiresGpu: boolean;
  preferredExecution: PreferredExecution;
  reasons: string[];
  constraints?: {
    minMemoryMb?: number;
    minGpuMemoryMb?: number;
  };
}

/** Optional memory hint when reporting is extremely low (does not block local by itself). */
const VERY_LOW_MEMORY_AVAILABLE_MB = 128;

export interface EvaluateJobCapabilityInput {
  jobType: string;
  payload: unknown;
  machineState: MachineStateRecord | null;
}

/**
 * Rule-based capability for a job type. No registry/DSL — add cases in the switch.
 * Readiness and policy are applied later in {@link resolveExecutionDecision}.
 */
export function evaluateJobCapability(input: EvaluateJobCapabilityInput): CapabilityResult {
  const { jobType, machineState } = input;

  switch (jobType) {
    case 'embed_text':
    case 'classify_text': {
      const reasons: string[] = [];
      const mem = machineState?.memory_available_mb;
      if (mem != null && mem < VERY_LOW_MEMORY_AVAILABLE_MB) {
        reasons.push('very_low_reported_memory_available');
      }
      return {
        jobType,
        canRunLocally: true,
        requiresGpu: false,
        preferredExecution: 'local',
        reasons,
      };
    }
    default:
      return {
        jobType,
        canRunLocally: true,
        requiresGpu: false,
        preferredExecution: 'local',
        reasons: [],
      };
  }
}

/** Stable JSON shape for `/debug/capability` and logs. */
export function capabilityToDebugJson(c: CapabilityResult): Record<string, unknown> {
  return {
    jobType: c.jobType,
    canRunLocally: c.canRunLocally,
    requiresGpu: c.requiresGpu,
    preferredExecution: c.preferredExecution,
    reasons: c.reasons,
    constraints: c.constraints ?? {},
  };
}
