import type { Database } from 'sql.js';
import { failJob, getNextQueuedJob, markJobRunning } from '../jobs/index.js';
import { runMockJobPipeline } from '../jobs/pipeline.js';
import { getLatestDeviceProfile } from '../profiler/index.js';
import { getLatestMachineState } from '../machine-state/index.js';
import { isEligibleForBackgroundWork } from './eligibility.js';

/** Polling interval for queued jobs (ms). */
const POLL_MS = 300;

/** Last computed eligibility (for transition logs only). */
let lastEligible: boolean | null = null;

/**
 * Starts a single-threaded background loop: poll for queued jobs, claim one at a time,
 * run the mock pipeline. Returns `stop` to clear the timer (e.g. on shutdown).
 */
export function startWorker(db: Database, dbPath: string): () => void {
  let stopped = false;
  let processing = false;

  console.log('[agent] worker: started');

  const interval = setInterval(() => {
    if (stopped || processing) {
      return;
    }

    const machineState = getLatestMachineState(db);
    const eligible = isEligibleForBackgroundWork(machineState);

    if (lastEligible !== eligible) {
      if (eligible) {
        console.log('[agent] worker: eligibility changed to allowed');
      } else {
        console.log('[agent] worker: eligibility changed to blocked');
      }
      lastEligible = eligible;
    }

    if (!eligible) {
      return;
    }

    processing = true;
    const job = getNextQueuedJob(db);
    if (!job) {
      processing = false;
      return;
    }

    try {
      markJobRunning(db, dbPath, job.id);
    } catch (err) {
      processing = false;
      console.error('[agent] worker: markJobRunning failed id=' + job.id, err);
      return;
    }

    console.log('[agent] worker: picked job id=' + job.id);

    void (async () => {
      try {
        const profile = getLatestDeviceProfile(db);
        await runMockJobPipeline(db, dbPath, job, profile);
      } catch (err) {
        console.error('[agent] worker: job failed id=' + job.id, err);
        try {
          failJob(db, dbPath, job.id);
        } catch (persistErr) {
          console.error('[agent] worker: failJob persist error id=' + job.id, persistErr);
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
