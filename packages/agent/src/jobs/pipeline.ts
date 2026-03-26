import type { Database } from 'sql.js';
import type { DeviceProfile } from '../profiler/index.js';
import { executeCloudMock, executeLocalMock } from '../executors/index.js';
import { routeJob, type ExecutionTarget } from '../router/index.js';
import { completeJob, failJob, saveJobResult, type JobRecord } from './index.js';

function executorLabel(target: ExecutionTarget): 'local_mock' | 'cloud_mock' {
  return target === 'cloud_mock' ? 'cloud_mock' : 'local_mock';
}

/**
 * After the worker marks the job `running`, route by profile, run the mock executor,
 * persist `results`, and set job state to `completed` or `failed`.
 */
export async function runMockJobPipeline(
  db: Database,
  dbPath: string,
  job: JobRecord,
  profile: DeviceProfile | null,
): Promise<void> {
  const target = routeJob(profile, job);
  const executor = executorLabel(target);
  console.log('[agent] job: route chosen id=' + job.id + ' executor=' + executor);

  console.log('[agent] job: execution started id=' + job.id + ' executor=' + executor);

  try {
    const output =
      target === 'cloud_mock' ? await executeCloudMock(job) : await executeLocalMock(job);
    saveJobResult(db, dbPath, job.id, output, executor);
    completeJob(db, dbPath, job.id);
    console.log('[agent] job: execution completed id=' + job.id + ' executor=' + executor);
  } catch (err) {
    failJob(db, dbPath, job.id);
    console.error(
      '[agent] job: execution failed id=' + job.id + ' executor=' + executor,
      err,
    );
  }
}
