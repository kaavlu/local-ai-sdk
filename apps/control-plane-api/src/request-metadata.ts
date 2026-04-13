import { randomUUID } from 'node:crypto';

export interface RequestMetadata {
  requestId: string;
  startedAtMs: number;
}

export function createRequestMetadata(): RequestMetadata {
  return {
    requestId: randomUUID(),
    startedAtMs: Date.now(),
  };
}

export function calculateLatencyMs(startedAtMs: number): number {
  const latency = Date.now() - startedAtMs;
  return latency < 0 ? 0 : latency;
}

export function deriveInputCount(input: unknown): number | null {
  if (typeof input === 'string') {
    return 1;
  }
  if (Array.isArray(input)) {
    return input.length;
  }
  return null;
}
