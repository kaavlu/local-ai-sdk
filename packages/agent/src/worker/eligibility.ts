import type { MachineStateRecord } from '../machine-state/index.js';

/**
 * Minimum reported idle duration (seconds) required for background work.
 * Prototype-only; adjust here to tune scheduling.
 */
export const MIN_IDLE_SECONDS_FOR_BACKGROUND_WORK = 10;

/**
 * Step 7 rule: eligible when machine is idle, idle long enough, and on AC power.
 * Missing state → not eligible.
 */
export function isEligibleForBackgroundWork(record: MachineStateRecord | null): boolean {
  if (!record) {
    return false;
  }
  return (
    record.is_system_idle === 1 &&
    record.idle_seconds >= MIN_IDLE_SECONDS_FOR_BACKGROUND_WORK &&
    record.is_on_ac_power === 1
  );
}
