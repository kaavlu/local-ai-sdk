export type JobId = string;

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * Placeholder: enqueue work for the local agent. Not implemented yet.
 */
export async function enqueueJob(_input: unknown): Promise<JobId> {
  throw new Error('Not implemented');
}

/**
 * Placeholder: poll job state. Not implemented yet.
 */
export async function getJobStatus(_jobId: JobId): Promise<JobStatus> {
  throw new Error('Not implemented');
}

/**
 * Placeholder: fetch completed job output. Not implemented yet.
 */
export async function getJobResult(_jobId: JobId): Promise<unknown> {
  throw new Error('Not implemented');
}
