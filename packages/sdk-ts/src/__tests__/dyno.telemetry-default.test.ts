import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDynoTelemetrySinks } from '../dyno.js';
import type { TelemetryEvent } from '../embeddings-runtime.js';

const baseEvent: TelemetryEvent = {
  eventType: 'embeddings_execution',
  projectId: 'proj-default',
  useCase: 'embeddings',
  decision: 'local',
  reason: 'local_job_completed',
  reasonCategory: 'local_execution',
  durationMs: 10,
  fallbackInvoked: false,
};

test('resolveDynoTelemetrySinks keeps explicit sinks when telemetry env is unset', async () => {
  let called = false;
  const explicitSink = async () => {
    called = true;
  };
  const sinks = resolveDynoTelemetrySinks([explicitSink], {});
  assert.equal(Array.isArray(sinks), true);
  assert.equal(sinks?.length, 1);
  await sinks?.[0]?.(baseEvent);
  assert.equal(called, true);
});

test('resolveDynoTelemetrySinks appends default HTTP sink when DYNO_TELEMETRY_URL is set', async () => {
  const calls: Array<{ url: string; auth: string }> = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      auth: String(headers.Authorization ?? ''),
    });
    return new Response('{}', { status: 202 });
  }) as typeof fetch;
  try {
    const sinks = resolveDynoTelemetrySinks(undefined, {
      DYNO_TELEMETRY_URL: 'http://control-plane.test/telemetry/events',
      DYNO_TELEMETRY_API_KEY: 'telemetry-key',
    });
    assert.equal(Array.isArray(sinks), true);
    assert.equal(sinks?.length, 1);
    await sinks?.[0]?.(baseEvent);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'http://control-plane.test/telemetry/events');
    assert.equal(calls[0]?.auth, 'Bearer telemetry-key');
  } finally {
    global.fetch = originalFetch;
  }
});
