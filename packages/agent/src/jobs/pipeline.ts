import type { Database } from 'sql.js';
import { executeCloudMock, executeLocalMock } from '../executors/index.js';
import {
  beginLocalWorkloadExecution,
  endLocalWorkloadExecution,
  prepareWorkloadModelAccessForTask,
  runIdleEvictionAfterLocalJob,
  runWithLocalWorkloadTimeout,
} from '../models/workload-model-runtime.js';
import { getRealWorkloadDefinition, isLocalRealWorkloadTaskType } from '../workloads/registry.js';
import { completeJob, handleExecutionFailure, saveJobResult, type JobRecord } from './index.js';

export type MockExecutorTarget = 'local_mock' | 'cloud_mock';

function executorLabel(
  target: MockExecutorTarget,
  job: JobRecord,
): 'local_mock' | 'local_real' | 'cloud_mock' {
  if (target === 'cloud_mock') {
    return 'cloud_mock';
  }
  return isLocalRealWorkloadTaskType(job.taskType) ? 'local_real' : 'local_mock';
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
    let output: unknown;
    if (target === 'cloud_mock') {
      output = await executeCloudMock(job);
    } else {
      const wl = getRealWorkloadDefinition(job.taskType);
      if (wl) {
        prepareWorkloadModelAccessForTask(job.taskType);
        beginLocalWorkloadExecution(job.taskType);
        try {
          const { persistedOutput } = await runWithLocalWorkloadTimeout(job.taskType, () =>
            wl.executeLocal(job),
          );
          output = persistedOutput;
        } finally {
          endLocalWorkloadExecution();
          runIdleEvictionAfterLocalJob();
        }
      } else {
        output = await executeLocalMock(job);
      }
    }
    saveJobResult(db, dbPath, job.id, output, executor);
    completeJob(db, dbPath, job.id);
    console.log('[agent] job: execution completed id=' + job.id + ' executor=' + executor);
  } catch (err: unknown) {
    console.error('[agent] job: execution error id=' + job.id + ' executor=' + executor, err);
    handleExecutionFailure(db, dbPath, job.id, err);
  }
}
