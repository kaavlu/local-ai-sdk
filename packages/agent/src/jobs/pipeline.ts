import type { Database } from 'sql.js';
import { executeCloudMock, executeLocalMock } from '../executors/index.js';
import { completeJob, failJob, saveJobResult, type JobRecord } from './index.js';

export type MockExecutorTarget = 'local_mock' | 'cloud_mock';

function executorLabel(target: MockExecutorTarget): 'local_mock' | 'cloud_mock' {
  return target === 'cloud_mock' ? 'cloud_mock' : 'local_mock';
}

/**
 * After the worker marks the job `running`, run the chosen mock executor (policy already decided),
 * persist `results`, and set job state to `completed` or `failed`.
 */
export async function runMockJobPipeline(
  db: Database,
  dbPath: string,
  job: JobRecord,
  target: MockExecutorTarget,
): Promise<void> {
  const executor = executorLabel(target);
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
