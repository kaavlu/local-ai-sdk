import type { DeviceProfile } from '../profiler/index.js';
import type { MachineStateRecord } from '../machine-state/index.js';
import type { LocalMode } from '../policy/index.js';

/** Minimum idle seconds for background local readiness. */
export const READINESS_IDLE_SECONDS_BACKGROUND = 10;

/** Minimum idle seconds for conservative local readiness. */
export const READINESS_IDLE_SECONDS_CONSERVATIVE = 30;

/**
 * Primary env var: when set to `1`, `true`, or `yes` (case-insensitive),
 * {@link getEffectiveMachineReadiness} treats all per-mode readiness flags as true
 * for scheduling (dev/testing only).
 */
export const READINESS_BYPASS_ENV = 'DYNO_READINESS_BYPASS';

/** @deprecated Use {@link READINESS_BYPASS_ENV}; honored until tooling migrates. */
const READINESS_BYPASS_ENV_LEGACY = 'LOCAL_AI_READINESS_BYPASS';

function envTruthy(key: string): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isReadinessBypassActive(): boolean {
  return envTruthy(READINESS_BYPASS_ENV) || envTruthy(READINESS_BYPASS_ENV_LEGACY);
}

/** Live snapshot used for decisions and `/debug/readiness`. */
export interface ReadinessSignalsSnapshot {
  machineStateMissing: boolean;
  idleSeconds: number;
  isSystemIdle: boolean;
  onAcPower: boolean;
  cpuUtilizationPercent: number | null;
  memoryAvailableMb: number | null;
  memoryUsedPercent: number | null;
  gpuUtilizationPercent: number | null;
  gpuMemoryFreeMb: number | null;
  gpuMemoryUsedMb: number | null;
  batteryPercent: number | null;
  thermalState: string | null;
  deviceRamFreeMb: number | null;
  deviceRamTotalMb: number | null;
}

export interface ReadinessThresholdsSnapshot {
  requiresSystemIdle: boolean;
  minIdleSeconds: number;
  requiresAcPower: boolean;
  minMemoryAvailableMb: number;
  maxMemoryUsedPercent: number;
  maxCpuUtilizationPercent: number;
  minGpuMemoryFreeMb: number | null;
  maxGpuUtilizationPercent: number;
  relaxedPowerOrIdle: boolean;
  blockOnSevereThermal: boolean;
}

export interface ModeReadinessDetail {
  isReady: boolean;
  localMode: LocalMode;
  blockingReasons: string[];
  warnings: string[];
  signals: ReadinessSignalsSnapshot;
  thresholds: ReadinessThresholdsSnapshot;
}

export interface MachineReadiness {
  interactiveLocalReady: boolean;
  backgroundLocalReady: boolean;
  conservativeLocalReady: boolean;
  byMode: Record<LocalMode, ModeReadinessDetail>;
}

interface ModeGateConfig {
  requiresSystemIdle: boolean;
  minIdleSeconds: number;
  requiresAcPower: boolean;
  /** When true, `onAcPower || isSystemIdle` is enough (interactive-style). */
  relaxedPowerOrIdle: boolean;
  minMemoryAvailableMb: number;
  maxMemoryUsedPercent: number;
  maxCpuUtilizationPercent: number;
  minGpuMemoryFreeMb: number;
  maxGpuUtilizationPercent: number;
  blockOnSevereThermal: boolean;
}

const MODE_CONFIG: Record<LocalMode, ModeGateConfig> = {
  interactive: {
    requiresSystemIdle: false,
    minIdleSeconds: 0,
    requiresAcPower: false,
    relaxedPowerOrIdle: true,
    minMemoryAvailableMb: 1800,
    maxMemoryUsedPercent: 88,
    maxCpuUtilizationPercent: 58,
    minGpuMemoryFreeMb: 1536,
    maxGpuUtilizationPercent: 82,
    blockOnSevereThermal: false,
  },
  background: {
    requiresSystemIdle: true,
    minIdleSeconds: READINESS_IDLE_SECONDS_BACKGROUND,
    requiresAcPower: true,
    relaxedPowerOrIdle: false,
    minMemoryAvailableMb: 1200,
    maxMemoryUsedPercent: 93,
    maxCpuUtilizationPercent: 78,
    minGpuMemoryFreeMb: 1024,
    maxGpuUtilizationPercent: 90,
    blockOnSevereThermal: false,
  },
  conservative: {
    requiresSystemIdle: true,
    minIdleSeconds: READINESS_IDLE_SECONDS_CONSERVATIVE,
    requiresAcPower: true,
    relaxedPowerOrIdle: false,
    minMemoryAvailableMb: 2400,
    maxMemoryUsedPercent: 82,
    maxCpuUtilizationPercent: 48,
    minGpuMemoryFreeMb: 2560,
    maxGpuUtilizationPercent: 72,
    blockOnSevereThermal: true,
  },
};

const THERMAL_SEVERE = new Set(['serious', 'critical']);

function buildSignals(
  machineState: MachineStateRecord | null,
  deviceProfile: DeviceProfile | null,
): ReadinessSignalsSnapshot {
  const deviceRamFreeMb =
    deviceProfile != null && typeof deviceProfile.ram_free_mb === 'number'
      ? deviceProfile.ram_free_mb
      : null;
  const deviceRamTotalMb =
    deviceProfile != null && typeof deviceProfile.ram_total_mb === 'number'
      ? deviceProfile.ram_total_mb
      : null;

  let memoryUsedPercent = machineState?.memory_used_percent ?? null;
  if (
    memoryUsedPercent === null &&
    deviceRamTotalMb != null &&
    deviceRamFreeMb != null &&
    deviceRamTotalMb > 0
  ) {
    memoryUsedPercent = Math.round(100 * (1 - deviceRamFreeMb / deviceRamTotalMb));
  }

  const memoryAvailableMb =
    machineState?.memory_available_mb != null ? machineState.memory_available_mb : deviceRamFreeMb;

  return {
    machineStateMissing: machineState == null,
    idleSeconds: machineState != null ? machineState.idle_seconds : 0,
    isSystemIdle: machineState?.is_system_idle === 1,
    onAcPower: machineState?.is_on_ac_power === 1,
    cpuUtilizationPercent: machineState?.cpu_utilization_percent ?? null,
    memoryAvailableMb,
    memoryUsedPercent,
    gpuUtilizationPercent: machineState?.gpu_utilization_percent ?? null,
    gpuMemoryFreeMb: machineState?.gpu_memory_free_mb ?? null,
    gpuMemoryUsedMb: machineState?.gpu_memory_used_mb ?? null,
    batteryPercent: machineState?.battery_percent ?? null,
    thermalState: machineState?.thermal_state ?? null,
    deviceRamFreeMb,
    deviceRamTotalMb,
  };
}

function thresholdsFromConfig(mode: LocalMode, cfg: ModeGateConfig): ReadinessThresholdsSnapshot {
  return {
    requiresSystemIdle: cfg.requiresSystemIdle,
    minIdleSeconds: cfg.minIdleSeconds,
    requiresAcPower: cfg.requiresAcPower,
    minMemoryAvailableMb: cfg.minMemoryAvailableMb,
    maxMemoryUsedPercent: cfg.maxMemoryUsedPercent,
    maxCpuUtilizationPercent: cfg.maxCpuUtilizationPercent,
    minGpuMemoryFreeMb: cfg.minGpuMemoryFreeMb,
    maxGpuUtilizationPercent: cfg.maxGpuUtilizationPercent,
    relaxedPowerOrIdle: cfg.relaxedPowerOrIdle,
    blockOnSevereThermal: cfg.blockOnSevereThermal,
  };
}

function thermalSeverity(thermal: string | null): 'none' | 'warn' | 'severe' {
  if (!thermal) {
    return 'none';
  }
  const t = thermal.trim().toLowerCase();
  if (t.length === 0 || t === 'unknown' || t === 'nominal') {
    return 'none';
  }
  if (THERMAL_SEVERE.has(t)) {
    return 'severe';
  }
  if (t === 'fair') {
    return 'warn';
  }
  return 'none';
}

function evaluateMode(
  mode: LocalMode,
  cfg: ModeGateConfig,
  s: ReadinessSignalsSnapshot,
): ModeReadinessDetail {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (s.machineStateMissing) {
    warnings.push('machine_state_missing');
  }

  if (s.cpuUtilizationPercent == null) {
    warnings.push('cpu_utilization_unavailable');
  } else if (s.cpuUtilizationPercent > cfg.maxCpuUtilizationPercent) {
    blockingReasons.push('high_cpu_utilization');
  }

  const memAvail = s.memoryAvailableMb;
  const memUsedPct = s.memoryUsedPercent;
  if (memAvail != null) {
    if (memAvail < cfg.minMemoryAvailableMb) {
      blockingReasons.push('low_available_memory');
    }
  } else if (memUsedPct != null) {
    if (memUsedPct > cfg.maxMemoryUsedPercent) {
      blockingReasons.push('high_memory_used_percent');
    }
  } else {
    warnings.push('memory_pressure_unavailable');
    if (mode === 'conservative') {
      blockingReasons.push('memory_context_unavailable');
    }
  }

  if (s.gpuMemoryFreeMb == null) {
    warnings.push('gpu_memory_unavailable');
  } else if (s.gpuMemoryFreeMb < cfg.minGpuMemoryFreeMb) {
    blockingReasons.push('low_gpu_memory_free');
  }

  if (s.gpuUtilizationPercent == null) {
    warnings.push('gpu_utilization_unavailable');
  } else if (s.gpuUtilizationPercent > cfg.maxGpuUtilizationPercent) {
    blockingReasons.push('high_gpu_utilization');
  }

  const th = thermalSeverity(s.thermalState);
  if (th === 'severe') {
    if (cfg.blockOnSevereThermal) {
      blockingReasons.push('thermal_constraint');
    } else {
      warnings.push('thermal_constrained');
    }
  } else if (th === 'warn') {
    warnings.push('thermal_elevated');
  }

  if (s.batteryPercent != null && s.batteryPercent < 20 && !s.onAcPower) {
    warnings.push('low_battery');
  }

  if (cfg.relaxedPowerOrIdle) {
    if (!s.onAcPower && !s.isSystemIdle) {
      blockingReasons.push('needs_ac_or_idle');
    }
  } else {
    if (cfg.requiresSystemIdle && !s.isSystemIdle) {
      blockingReasons.push('not_idle');
    }
    if (cfg.minIdleSeconds > 0 && s.idleSeconds < cfg.minIdleSeconds) {
      blockingReasons.push('idle_seconds_below_threshold');
    }
    if (cfg.requiresAcPower && !s.onAcPower) {
      blockingReasons.push('not_on_ac_power');
    }
  }

  const isReady = blockingReasons.length === 0;
  return {
    isReady,
    localMode: mode,
    blockingReasons,
    warnings,
    signals: s,
    thresholds: thresholdsFromConfig(mode, cfg),
  };
}

/**
 * Admission-style readiness from machine state + device profile. Missing optional signals
 * produce warnings; only configured gates hard-block. Conservative mode is strictest.
 */
export function evaluateMachineReadiness(
  machineState: MachineStateRecord | null,
  deviceProfile: DeviceProfile | null,
): MachineReadiness {
  const signals = buildSignals(machineState, deviceProfile);
  const modes: LocalMode[] = ['interactive', 'background', 'conservative'];
  const byMode = {} as Record<LocalMode, ModeReadinessDetail>;
  for (const m of modes) {
    byMode[m] = evaluateMode(m, MODE_CONFIG[m], signals);
  }
  return {
    interactiveLocalReady: byMode.interactive.isReady,
    backgroundLocalReady: byMode.background.isReady,
    conservativeLocalReady: byMode.conservative.isReady,
    byMode,
  };
}

/**
 * Readiness used by the worker and `GET /debug/readiness`. When {@link isReadinessBypassActive}
 * is true, every mode is treated as ready for scheduling (`localMode` on each job unchanged).
 */
export function getEffectiveMachineReadiness(
  machineState: MachineStateRecord | null,
  deviceProfile: DeviceProfile | null,
): MachineReadiness {
  const base = evaluateMachineReadiness(machineState, deviceProfile);
  if (!isReadinessBypassActive()) {
    return base;
  }

  const modes: LocalMode[] = ['interactive', 'background', 'conservative'];
  const byMode = {} as Record<LocalMode, ModeReadinessDetail>;
  for (const m of modes) {
    const d = base.byMode[m];
    byMode[m] = {
      ...d,
      isReady: true,
      blockingReasons: [],
      warnings: [
        'readiness_bypass_active',
        ...d.warnings.filter((w) => w !== 'readiness_bypass_active'),
      ],
    };
  }
  return {
    interactiveLocalReady: true,
    backgroundLocalReady: true,
    conservativeLocalReady: true,
    byMode,
  };
}

/** JSON for `GET /debug/readiness` (Step 15 structured + legacy booleans). */
export function readinessToDebugJson(readiness: MachineReadiness): Record<string, unknown> {
  const signals = readiness.byMode.interactive.signals;
  return {
    ok: true,
    readiness: {
      signals: {
        machineStateMissing: signals.machineStateMissing,
        idleSeconds: signals.idleSeconds,
        isSystemIdle: signals.isSystemIdle,
        onAcPower: signals.onAcPower,
        cpuUtilizationPercent: signals.cpuUtilizationPercent,
        memoryAvailableMb: signals.memoryAvailableMb,
        memoryUsedPercent: signals.memoryUsedPercent,
        gpuUtilizationPercent: signals.gpuUtilizationPercent,
        gpuMemoryFreeMb: signals.gpuMemoryFreeMb,
        gpuMemoryUsedMb: signals.gpuMemoryUsedMb,
        batteryPercent: signals.batteryPercent,
        thermalState: signals.thermalState,
        deviceRamFreeMb: signals.deviceRamFreeMb,
        deviceRamTotalMb: signals.deviceRamTotalMb,
      },
      modes: {
        interactive: {
          isReady: readiness.byMode.interactive.isReady,
          localMode: 'interactive',
          blockingReasons: readiness.byMode.interactive.blockingReasons,
          warnings: readiness.byMode.interactive.warnings,
          thresholds: readiness.byMode.interactive.thresholds,
        },
        background: {
          isReady: readiness.byMode.background.isReady,
          localMode: 'background',
          blockingReasons: readiness.byMode.background.blockingReasons,
          warnings: readiness.byMode.background.warnings,
          thresholds: readiness.byMode.background.thresholds,
        },
        conservative: {
          isReady: readiness.byMode.conservative.isReady,
          localMode: 'conservative',
          blockingReasons: readiness.byMode.conservative.blockingReasons,
          warnings: readiness.byMode.conservative.warnings,
          thresholds: readiness.byMode.conservative.thresholds,
        },
      },
    },
    interactiveLocalReady: readiness.interactiveLocalReady,
    backgroundLocalReady: readiness.backgroundLocalReady,
    conservativeLocalReady: readiness.conservativeLocalReady,
  };
}
