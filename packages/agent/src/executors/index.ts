import type { JobRecord } from '../jobs/index.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInclusiveMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Mock local run: short delay, JSON result tagged with `local_mock`.
 */
export async function executeLocalMock(job: JobRecord): Promise<Record<string, unknown>> {
  await delay(randomInclusiveMs(150, 300));
  return {
    message: 'Mock result generated',
    taskType: job.taskType,
    executor: 'local_mock',
    payloadEcho: job.payload,
  };
}

/**
 * Mock cloud run: longer delay, JSON result tagged with `cloud_mock`.
 */
export async function executeCloudMock(job: JobRecord): Promise<Record<string, unknown>> {
  await delay(randomInclusiveMs(400, 700));
  return {
    message: 'Mock result generated',
    taskType: job.taskType,
    executor: 'cloud_mock',
    payloadEcho: job.payload,
  };
}
