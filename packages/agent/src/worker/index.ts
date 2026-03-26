import type { Database } from 'sql.js';
import { getCloudAvailable } from '../cloud-availability.js';
import { failJob, listQueuedJobsOrdered, markJobRunning, type JobRecord } from '../jobs/index.js';
import { runMockJobPipeline, type MockExecutorTarget } from '../jobs/pipeline.js';
import { resolveExecutionDecision, type ExecutionDecision } from '../policy/index.js';
import { getLatestDeviceProfile } from '../profiler/index.js';
import { getLatestMachineState } from '../machine-state/index.js';
import { evaluateMachineReadiness } from './readiness.js';

/** Polling interval for queued jobs (ms). */
const POLL_MS = 300;

/** Throttle repeated "all queued jobs blocked" logs (ms). */
const ALL_BLOCKED_LOG_THROTTLE_MS = 5000;

let lastAllBlockedLogAt = 0;
let lastAllBlockedCount: number | null = null;

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

    const queued = listQueuedJobsOrdered(db);
    if (queued.length === 0) {
      return;
    }

    const machineState = getLatestMachineState(db);
    const profile = getLatestDeviceProfile(db);
    const readiness = evaluateMachineReadiness(machineState, profile);
    const cloudAvailable = getCloudAvailable();

    let picked: JobRecord | null = null;
    let decision: ExecutionDecision = 'queue';
    const skippedHead: JobRecord[] = [];

    for (const job of queued) {
      decision = resolveExecutionDecision({
        executionPolicy: job.executionPolicy,
        localMode: job.localMode,
        machineReadiness: readiness,
        cloudAvailable,
      });

      if (decision === 'queue') {
        skippedHead.push(job);
        continue;
      }

      picked = job;
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

    for (const j of skippedHead) {
      console.log(
        '[agent] worker: skip queued job (decision=queue) id=' +
          j.id +
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
      '[agent] worker: selected job id=' +
        picked.id +
        ' executionPolicy=' +
        picked.executionPolicy +
        ' localMode=' +
        picked.localMode +
        ' decision=' +
        decision,
    );

    processing = true;

    try {
      markJobRunning(db, dbPath, picked.id);
    } catch (err) {
      processing = false;
      console.error('[agent] worker: markJobRunning failed id=' + picked.id, err);
      return;
    }

    void (async () => {
      try {
        await runMockJobPipeline(db, dbPath, picked!, target);
      } catch (err) {
        console.error('[agent] worker: job failed id=' + picked!.id, err);
        try {
          failJob(db, dbPath, picked!.id);
        } catch (persistErr) {
          console.error('[agent] worker: failJob persist error id=' + picked!.id, persistErr);
        }
      } finally {
        processing = false;
      }
    })();
  }, POLL_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
