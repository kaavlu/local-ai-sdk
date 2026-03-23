import type { DeviceProfile } from '../profiler/index.js';

/** Mock execution backends for Step 5 (no real inference). */
export type ExecutionTarget = 'local_mock' | 'cloud_mock';

/**
 * Free RAM threshold (MiB): when `ram_free_mb` is defined and below this value,
 * jobs route to `cloud_mock`; otherwise `local_mock`.
 * Tune this constant for experiments without adding config files yet.
 */
export const ROUTE_RAM_FREE_MB_THRESHOLD = 4000;

/**
 * Deterministic routing stub: uses latest device profile RAM to pick a mock executor.
 */
export function routeJob(
  profile: DeviceProfile | null,
  _job: { id: string },
): ExecutionTarget {
  const free = profile?.ram_free_mb;
  if (typeof free === 'number' && free < ROUTE_RAM_FREE_MB_THRESHOLD) {
    return 'cloud_mock';
  }
  return 'local_mock';
}
