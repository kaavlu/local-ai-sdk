import type { DeviceProfile } from '../profiler/index.js';
import type { MachineStateRecord } from '../machine-state/index.js';

/** Minimum free RAM (MiB) for interactive local execution. */
export const READINESS_RAM_FREE_MB_INTERACTIVE = 2000;

/** Minimum free RAM (MiB) for background local execution. */
export const READINESS_RAM_FREE_MB_BACKGROUND = 2000;

/** Minimum free RAM (MiB) for conservative local execution. */
export const READINESS_RAM_FREE_MB_CONSERVATIVE = 3000;

/** Minimum idle seconds for background local readiness. */
export const READINESS_IDLE_SECONDS_BACKGROUND = 10;

/** Minimum idle seconds for conservative local readiness. */
export const READINESS_IDLE_SECONDS_CONSERVATIVE = 30;

export interface MachineReadiness {
  interactiveLocalReady: boolean;
  backgroundLocalReady: boolean;
  conservativeLocalReady: boolean;
  reasons: string[];
}

/**
 * Prototype readiness from machine state + device profile only (no GPU metrics).
 * Missing machine state is treated as not idle and not on AC.
 */
export function evaluateMachineReadiness(
  machineState: MachineStateRecord | null,
  deviceProfile: DeviceProfile | null,
): MachineReadiness {
  const reasons: string[] = [];

  const ramFree =
    deviceProfile != null && typeof deviceProfile.ram_free_mb === 'number'
      ? deviceProfile.ram_free_mb
      : null;

  if (ramFree === null) {
    reasons.push('ram_free_mb unavailable');
  } else {
    reasons.push('ram_free_mb=' + ramFree);
  }

  const idle = machineState?.is_system_idle === 1;
  const idleSeconds = machineState != null ? machineState.idle_seconds : 0;
  const onAc = machineState?.is_on_ac_power === 1;

  if (!machineState) {
    reasons.push('machine_state missing');
  } else {
    reasons.push(
      'isSystemIdle=' +
        (idle ? 'true' : 'false') +
        ', idleSeconds=' +
        idleSeconds +
        ', isOnAcPower=' +
        (onAc ? 'true' : 'false'),
    );
  }

  const ramOkInteractive = ramFree !== null && ramFree >= READINESS_RAM_FREE_MB_INTERACTIVE;
  const ramOkBackground = ramFree !== null && ramFree >= READINESS_RAM_FREE_MB_BACKGROUND;
  const ramOkConservative = ramFree !== null && ramFree >= READINESS_RAM_FREE_MB_CONSERVATIVE;

  const interactiveLocalReady =
    ramOkInteractive && (onAc || idle);
  if (!interactiveLocalReady) {
    if (!ramOkInteractive) {
      reasons.push('interactive: need ram_free_mb>=' + READINESS_RAM_FREE_MB_INTERACTIVE);
    } else if (!onAc && !idle) {
      reasons.push('interactive: need on AC or system idle');
    }
  }

  const backgroundLocalReady =
    idle &&
    idleSeconds >= READINESS_IDLE_SECONDS_BACKGROUND &&
    onAc &&
    ramOkBackground;
  if (!backgroundLocalReady) {
    if (!idle) {
      reasons.push('background: need isSystemIdle=true');
    } else if (idleSeconds < READINESS_IDLE_SECONDS_BACKGROUND) {
      reasons.push(
        'background: need idleSeconds>=' + READINESS_IDLE_SECONDS_BACKGROUND + ' (got ' + idleSeconds + ')',
      );
    } else if (!onAc) {
      reasons.push('background: need on AC power');
    } else if (!ramOkBackground) {
      reasons.push('background: need ram_free_mb>=' + READINESS_RAM_FREE_MB_BACKGROUND);
    }
  }

  const conservativeLocalReady =
    idle &&
    idleSeconds >= READINESS_IDLE_SECONDS_CONSERVATIVE &&
    onAc &&
    ramOkConservative;
  if (!conservativeLocalReady) {
    if (!idle) {
      reasons.push('conservative: need isSystemIdle=true');
    } else if (idleSeconds < READINESS_IDLE_SECONDS_CONSERVATIVE) {
      reasons.push(
        'conservative: need idleSeconds>=' +
          READINESS_IDLE_SECONDS_CONSERVATIVE +
          ' (got ' +
          idleSeconds +
          ')',
      );
    } else if (!onAc) {
      reasons.push('conservative: need on AC power');
    } else if (!ramOkConservative) {
      reasons.push('conservative: need ram_free_mb>=' + READINESS_RAM_FREE_MB_CONSERVATIVE);
    }
  }

  return {
    interactiveLocalReady,
    backgroundLocalReady,
    conservativeLocalReady,
    reasons,
  };
}

/** JSON for `GET /debug/readiness`. */
export function readinessToDebugJson(readiness: MachineReadiness): Record<string, unknown> {
  return {
    interactiveLocalReady: readiness.interactiveLocalReady,
    backgroundLocalReady: readiness.backgroundLocalReady,
    conservativeLocalReady: readiness.conservativeLocalReady,
    reasons: readiness.reasons,
  };
}
