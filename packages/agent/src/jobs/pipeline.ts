import type { Database } from 'sql.js';
import { executeLocalEmbedText } from '../executors/embed-text.js';
import { executeCloudMock, executeLocalMock } from '../executors/index.js';
import { completeJob, handleExecutionFailure, saveJobResult, type JobRecord } from './index.js';

export type MockExecutorTarget = 'local_mock' | 'cloud_mock';

function executorLabel(
  target: MockExecutorTarget,
  job: JobRecord,
): 'local_mock' | 'local_real' | 'cloud_mock' {
  if (target === 'cloud_mock') {
    return 'cloud_mock';
  }
  return job.taskType === 'embed_text' ? 'local_real' : 'local_mock';
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
  const executor = executorLabel(target, job);
  console.log('[agent] job: execution started id=' + job.id + ' executor=' + executor);

  try {
    const output =
      target === 'cloud_mock'
        ? await executeCloudMock(job)
        : job.taskType === 'embed_text'
          ? await executeLocalEmbedText(job)
          : await executeLocalMock(job);
    saveJobResult(db, dbPath, job.id, output, executor);
    completeJob(db, dbPath, job.id);
    console.log('[agent] job: execution completed id=' + job.id + ' executor=' + executor);
  } catch (err: unknown) {
    console.error('[agent] job: execution error id=' + job.id + ' executor=' + executor, err);
    handleExecutionFailure(db, dbPath, job.id, err);
  }
}
