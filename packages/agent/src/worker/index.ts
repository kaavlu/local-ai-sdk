import type { Database } from 'sql.js';
import { getCloudAvailable } from '../cloud-availability.js';
import {
  handleExecutionFailure,
  listQueuedJobsOrdered,
  tryMarkJobRunning,
  MAX_JOB_ATTEMPTS,
  type JobRecord,
} from '../jobs/index.js';
import { runMockJobPipeline, type MockExecutorTarget } from '../jobs/pipeline.js';
import { evaluateJobCapability, type CapabilityResult } from '../capability/index.js';
import { resolveExecutionDecision, type ExecutionDecision } from '../policy/index.js';
import { getLatestDeviceProfile } from '../profiler/index.js';
import { getLatestMachineState } from '../machine-state/index.js';
import { getEffectiveMachineReadiness } from './readiness.js';
import { getIsWorkerPaused } from './state.js';

/** Polling interval for queued jobs (ms). */
export const WORKER_POLL_INTERVAL_MS = 300;

/** Throttle repeated "all queued jobs blocked" logs (ms). */
const ALL_BLOCKED_LOG_THROTTLE_MS = 5000;

let lastAllBlockedLogAt = 0;
let lastAllBlockedCount: number | null = null;

/** True between successful claim and pipeline `finally` (in-flight execution). */
let jobInFlight = false;
let currentRunningJobId: string | null = null;

export function getWorkerRuntimeSnapshot(): {
  jobInFlight: boolean;
  currentRunningJobId: string | null;
  pollIntervalMs: number;
} {
  return {
    jobInFlight,
    currentRunningJobId,
    pollIntervalMs: WORKER_POLL_INTERVAL_MS,
  };
}

function decisionToTarget(d: ExecutionDecision): MockExecutorTarget | null {
  if (d === 'run_local') {
    return 'local_mock';
  }
  if (d === 'run_cloud') {
    return 'cloud_mock';
  }
  return null;
}

/**
 * Starts a single-threaded background loop: scan queued jobs in order, pick the first
 * whose policy resolves to local or cloud execution (avoids head-of-line blocking).
 * Returns `stop` to clear the timer (e.g. on shutdown).
 */
export function startWorker(db: Database, dbPath: string): () => void {
  let stopped = false;
  let processing = false;

  console.log('[agent] worker: started');

  const interval = setInterval(() => {
    if (stopped || processing) {
      return;
    }

    if (getIsWorkerPaused(db)) {
      return;
    }

    const queued = listQueuedJobsOrdered(db);
    if (queued.length === 0) {
      return;
    }

    const machineState = getLatestMachineState(db);
    const profile = getLatestDeviceProfile(db);
    const readiness = getEffectiveMachineReadiness(machineState, profile);
    const cloudAvailable = getCloudAvailable();

    let picked: JobRecord | null = null;
    let pickedCapability: CapabilityResult | null = null;
    let decision: ExecutionDecision = 'queue';
    const skippedHead: { job: JobRecord; capability: CapabilityResult }[] = [];

    for (const job of queued) {
      const capability = evaluateJobCapability({
        jobType: job.taskType,
        payload: job.payload,
        machineState,
      });
      decision = resolveExecutionDecision({
        executionPolicy: job.executionPolicy,
        localMode: job.localMode,
        capability,
        machineReadiness: readiness,
        cloudAvailable,
      });

      if (decision === 'queue') {
        skippedHead.push({ job, capability });
        continue;
      }

      picked = job;
      pickedCapability = capability;
      break;
    }

    if (!picked) {
      const now = Date.now();
      const shouldLog =
        lastAllBlockedCount !== queued.length ||
        now - lastAllBlockedLogAt >= ALL_BLOCKED_LOG_THROTTLE_MS;
      if (shouldLog) {
        console.log(
          '[agent] worker: no runnable job among ' +
            queued.length +
            ' queued (all resolve to queue this tick)',
        );
        lastAllBlockedLogAt = now;
        lastAllBlockedCount = queued.length;
      }
      return;
    }

    lastAllBlockedCount = null;

    for (const { job: j, capability: cap } of skippedHead) {
      console.log(
        '[agent] worker: skip queued job (decision=queue) id=' +
          j.id +
          ' taskType=' +
          j.taskType +
          ' canRunLocally=' +
          cap.canRunLocally +
          ' executionPolicy=' +
          j.executionPolicy +
          ' localMode=' +
          j.localMode,
      );
    }

    const target = decisionToTarget(decision);
    if (!target) {
      return;
    }

    console.log(
      '[agent] worker: picked job id=' +
        picked.id +
        ' taskType=' +
        picked.taskType +
        ' canRunLocally=' +
        pickedCapability!.canRunLocally,
    );

    let attempt: number | null;
    try {
      attempt = tryMarkJobRunning(db, dbPath, picked.id);
    } catch (err) {
      console.error('[agent] worker: tryMarkJobRunning failed id=' + picked.id, err);
      return;
    }

    if (attempt === null) {
      console.log('[agent] worker: lost claim (job no longer queued) id=' + picked.id);
      return;
    }

    console.log(
      '[agent] worker: attempt ' + attempt + '/' + MAX_JOB_ATTEMPTS + ' id=' + picked.id,
    );

    processing = true;
    jobInFlight = true;
    currentRunningJobId = picked.id;

    void (async () => {
      try {
        await runMockJobPipeline(db, dbPath, picked!, target);
      } catch (err) {
        console.error('[agent] worker: unexpected pipeline error id=' + picked!.id, err);
        try {
          handleExecutionFailure(db, dbPath, picked!.id, err);
        } catch (persistErr) {
          console.error(
            '[agent] worker: failure handler persist error id=' + picked!.id,
            persistErr,
          );
        }
      } finally {
        processing = false;
        jobInFlight = false;
        currentRunningJobId = null;
      }
    })();
  }, WORKER_POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
