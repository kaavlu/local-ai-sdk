import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DynoSdkError } from '../client.js';
import { CachedProjectConfigProvider, DynoEmbeddingsRuntime } from '../embeddings-runtime.js';
import { createHttpTelemetrySink } from '../telemetry-http-sink.js';
import type { HealthResponse } from '../types.js';

function createEmbeddingsConfig() {
  return {
    projectId: 'project-test',
    use_case_type: 'embeddings' as const,
    strategy_preset: 'local_first' as const,
    fallback_enabled: true,
    local_model: null,
    cloud_model: 'cloud-model',
    requires_charging: false,
    wifi_only: false,
    battery_min_percent: null,
    idle_min_seconds: null,
  };
}

function createManagedResolverFetch(config?: {
  configStatus?: number;
  configBody?: Record<string, unknown>;
  failConfigRequest?: boolean;
  failConfigWithTimeout?: boolean;
}) {
  let configCalls = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/sdk/config')) {
      configCalls += 1;
      if (config?.failConfigRequest) {
        throw new Error('resolver network down');
      }
      if (config?.failConfigWithTimeout) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return new Response(JSON.stringify(config?.configBody ?? createEmbeddingsConfig()), {
        status: config?.configStatus ?? 200,
      });
    }
    throw new Error(`Unexpected resolver URL: ${url} (${init?.method ?? 'GET'})`);
  }) as typeof fetch;
  return {
    fetchImpl,
    getCounts: () => ({ configCalls }),
  };
}

function createSdkStub(overrides?: {
  healthCheck?: () => Promise<HealthResponse>;
  getReadinessDebug?: () => Promise<{
    ok: boolean;
    interactiveLocalReady: boolean;
    backgroundLocalReady: boolean;
    conservativeLocalReady: boolean;
  }>;
  createJob?: () => Promise<{ id: string }>;
  waitForJobCompletion?: () => Promise<{ state: string }>;
  getJobResult?: () => Promise<{ output: unknown }>;
}) {
  return {
    healthCheck:
      overrides?.healthCheck ??
      (async () => ({
        ok: true,
        runtime: {
          contractVersion: 'runtime-lifecycle-v1',
          capabilities: {
            readinessDebugV1: true,
          },
        },
      })),
    getReadinessDebug:
      overrides?.getReadinessDebug ??
      (async () => ({
        ok: true,
        interactiveLocalReady: true,
        backgroundLocalReady: true,
        conservativeLocalReady: true,
      })),
    createJob: overrides?.createJob ?? (async () => ({ id: 'job-default' })),
    waitForJobCompletion: overrides?.waitForJobCompletion ?? (async () => ({ state: 'completed' })),
    getJobResult: overrides?.getJobResult ?? (async () => ({ output: { embedding: [1, 2, 3] } })),
  };
}

test('telemetry sync throw does not break successful local execution', async () => {
  let syncSinkCalled = false;

  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-1' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [1, 2, 3] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [9, 9, 9] }),
    telemetrySinks: [
      () => {
        syncSinkCalled = true;
        throw new Error('sync telemetry sink failure');
      },
    ],
  });

  const result = await runtime.embedText('hello');
  assert.equal(syncSinkCalled, true);
  assert.equal(result.decision, 'local');
  assert.equal(result.reason, 'local_job_completed');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.deepEqual(result.embedding, [1, 2, 3]);
});

test('telemetry async rejection does not break fallback execution', async () => {
  let asyncSinkCalled = false;

  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-2' }),
      waitForJobCompletion: async () => ({ state: 'failed' }),
      getJobResult: async () => ({ output: { embedding: [0] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'local_job_failed');
      return { embedding: [4, 5, 6] };
    },
    telemetrySinks: [
      async () => {
        asyncSinkCalled = true;
        throw new Error('async telemetry sink failure');
      },
    ],
  });

  const result = await runtime.embedText('hello');
  assert.equal(asyncSinkCalled, true);
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'local_job_failed');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.deepEqual(result.embedding, [4, 5, 6]);
});

test('falls back when preflight health probe fails', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      healthCheck: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'agent_unavailable');
      assert.equal(request.reasonCategory, 'preflight');
      return { embedding: [7, 7, 7] };
    },
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'agent_unavailable');
  assert.equal(result.reasonCategory, 'preflight');
  assert.deepEqual(result.embedding, [7, 7, 7]);
});

test('uses runtime manager preflight hooks when configured', async () => {
  let ensureStartedCalls = 0;
  let waitHealthyCalls = 0;
  let waitReadyCalls = 0;
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    runtimeManager: {
      async ensureStarted() {
        ensureStartedCalls += 1;
      },
      async waitUntilHealthy() {
        waitHealthyCalls += 1;
        return { ok: true };
      },
      async waitUntilReady() {
        waitReadyCalls += 1;
        return {
          ok: true,
          interactiveLocalReady: true,
          backgroundLocalReady: true,
          conservativeLocalReady: true,
        };
      },
      getStatus() {
        return {
          state: 'ready',
          lastError: null,
          lastCheckedAt: Date.now(),
          startedAt: Date.now(),
          healthy: true,
          ready: true,
        };
      },
    },
    sdk: createSdkStub({
      healthCheck: async () => {
        throw new Error('runtime manager path should own preflight');
      },
      createJob: async () => ({ id: 'job-runtime-manager' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [3, 1, 4] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [0] }),
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'local');
  assert.equal(ensureStartedCalls, 1);
  assert.equal(waitHealthyCalls, 1);
  assert.equal(waitReadyCalls, 1);
  assert.deepEqual(result.embedding, [3, 1, 4]);
});

test('falls back when runtime manager startup fails', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    runtimeManager: {
      async ensureStarted() {
        throw new Error('spawn failed');
      },
      async waitUntilHealthy() {
        return { ok: true };
      },
      async waitUntilReady() {
        return null;
      },
      getStatus() {
        return {
          state: 'unavailable',
          lastError: 'spawn failed',
          lastCheckedAt: Date.now(),
          startedAt: null,
          healthy: false,
          ready: false,
        };
      },
    },
    sdk: createSdkStub() as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'agent_unavailable');
      assert.equal(request.reasonCategory, 'preflight');
      return { embedding: [9, 9, 1] };
    },
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'agent_unavailable');
  assert.equal(result.reasonCategory, 'preflight');
  assert.deepEqual(result.embedding, [9, 9, 1]);
});

test('falls back when readiness gate blocks requested local mode', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      getReadinessDebug: async () => ({
        ok: true,
        interactiveLocalReady: false,
        backgroundLocalReady: true,
        conservativeLocalReady: true,
      }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'local_not_ready_interactive');
      assert.equal(request.reasonCategory, 'preflight');
      return { embedding: [8, 8, 8] };
    },
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'local_not_ready_interactive');
  assert.equal(result.reasonCategory, 'preflight');
  assert.deepEqual(result.embedding, [8, 8, 8]);
});

test('keeps direct-agent compatibility when runtime manager is not configured', async () => {
  let healthCheckCalls = 0;
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      healthCheck: async () => {
        healthCheckCalls += 1;
        return {
          ok: true,
          runtime: {
            contractVersion: 'runtime-lifecycle-v1',
            capabilities: { readinessDebugV1: true },
          },
        };
      },
      createJob: async () => ({ id: 'job-direct-agent' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [5, 5, 5] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [0] }),
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'local');
  assert.equal(healthCheckCalls, 1);
  assert.deepEqual(result.embedding, [5, 5, 5]);
});

test('falls back with bounded local timeout reason', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-timeout' }),
      waitForJobCompletion: async () => {
        throw new Error('waitForJobCompletion timed out after 25ms (jobId=job-timeout)');
      },
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'local_job_timeout');
      return { embedding: [6, 6, 6] };
    },
    localTimeoutMs: 25,
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'local_job_timeout');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.deepEqual(result.embedding, [6, 6, 6]);
});

test('opens local failure cooldown circuit after repeated failures', async () => {
  let healthCheckCalls = 0;
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      healthCheck: async () => {
        healthCheckCalls += 1;
        throw new Error('agent unavailable');
      },
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [2, 2, 2] }),
    localFailureOpenAfter: 2,
    localFailureCooldownMs: 60_000,
  });

  const first = await runtime.embedText('hello-one');
  const second = await runtime.embedText('hello-two');
  const third = await runtime.embedText('hello-three');
  assert.equal(first.decision, 'cloud');
  assert.equal(second.decision, 'cloud');
  assert.equal(third.decision, 'cloud');
  assert.equal(healthCheckCalls, 2);
});

test('keeps local attempt when readiness endpoint is unavailable (404)', async () => {
  let createJobCalled = false;
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      getReadinessDebug: async () => {
        throw new DynoSdkError('Not found', 404, '{"error":"not_found"}');
      },
      createJob: async () => {
        createJobCalled = true;
        return { id: 'job-404' };
      },
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [3, 3, 3] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [0] }),
  });

  const result = await runtime.embedText('hello');
  assert.equal(createJobCalled, true);
  assert.equal(result.decision, 'local');
  assert.equal(result.reason, 'local_job_completed');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.deepEqual(result.embedding, [3, 3, 3]);
});

test('keeps local attempt for legacy runtime without readiness capability handshake', async () => {
  let readinessCalled = false;
  let createJobCalled = false;
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      healthCheck: async () => ({ ok: true }),
      getReadinessDebug: async () => {
        readinessCalled = true;
        throw new Error('legacy runtime should not call readiness');
      },
      createJob: async () => {
        createJobCalled = true;
        return { id: 'job-legacy-handshake' };
      },
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [9, 9, 9] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [0, 0, 0] }),
  });

  const result = await runtime.embedText('hello');
  assert.equal(readinessCalled, false);
  assert.equal(createJobCalled, true);
  assert.equal(result.decision, 'local');
  assert.equal(result.reason, 'local_job_completed');
  assert.deepEqual(result.embedding, [9, 9, 9]);
});

test('falls back when readiness probe times out', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      getReadinessDebug: async () =>
        await new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                interactiveLocalReady: true,
                backgroundLocalReady: true,
                conservativeLocalReady: true,
              }),
            300,
          ),
        ),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'readiness_probe_failed');
      return { embedding: [5, 5, 5] };
    },
    preflightTimeoutMs: 200,
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'readiness_probe_failed');
  assert.equal(result.reasonCategory, 'preflight');
  assert.deepEqual(result.embedding, [5, 5, 5]);
});

test('falls back when readiness payload is malformed for advertised capability', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      getReadinessDebug: async () =>
        ({
          ok: true,
          interactiveLocalReady: undefined,
          backgroundLocalReady: undefined,
          conservativeLocalReady: undefined,
        }) as never,
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'readiness_probe_failed');
      assert.equal(request.reasonCategory, 'preflight');
      return { embedding: [2, 2, 2] };
    },
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'readiness_probe_failed');
  assert.equal(result.reasonCategory, 'preflight');
  assert.deepEqual(result.embedding, [2, 2, 2]);
});

test('createHttpTelemetrySink posts normalized telemetry payload', async () => {
  let called = false;
  let receivedUrl = '';
  let receivedMethod = '';
  let receivedBody: Record<string, unknown> | null = null;

  const sink = createHttpTelemetrySink({
    endpointUrl: 'http://control-plane.test/telemetry/events',
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      called = true;
      receivedUrl = String(input);
      receivedMethod = String(init?.method ?? '');
      receivedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response('{}', { status: 202 });
    }) as typeof fetch,
  });

  await sink({
    eventType: 'embeddings_execution',
    projectId: 'proj-1',
    useCase: 'embeddings',
    decision: 'local',
    reason: 'local_job_completed',
    reasonCategory: 'local_execution',
    durationMs: 44,
    fallbackInvoked: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(called, true);
  assert.equal(receivedUrl, 'http://control-plane.test/telemetry/events');
  assert.equal(receivedMethod, 'POST');
  assert.equal(receivedBody?.['projectId'], 'proj-1');
  assert.equal(receivedBody?.['decision'], 'local');
  assert.equal(receivedBody?.['reasonCategory'], 'local_execution');
  assert.equal(receivedBody?.['durationMs'], 44);
  assert.equal(receivedBody?.['endpoint'], '/sdk/embeddings');
  assert.equal(receivedBody?.['status'], 'success');
});

test('createHttpTelemetrySink maps generation and batch telemetry payload fields', async () => {
  const payloads: Record<string, unknown>[] = [];
  const sink = createHttpTelemetrySink({
    endpointUrl: 'http://control-plane.test/telemetry/events',
    fetchImpl: (async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response('{}', { status: 202 });
    }) as typeof fetch,
  });

  await sink({
    eventType: 'generate_text_execution',
    projectId: 'proj-g',
    useCase: 'text_generation',
    decision: 'cloud',
    reason: 'agent_unavailable',
    reasonCategory: 'preflight',
    durationMs: 55,
    fallbackInvoked: true,
  });
  await sink({
    eventType: 'embeddings_batch_execution',
    projectId: 'proj-b',
    useCase: 'embeddings',
    decision: 'mixed',
    reason: 'batch_partial_failure',
    reasonCategory: 'fallback',
    durationMs: 60,
    fallbackInvoked: 'mixed',
    itemCount: 3,
    successCount: 2,
    failureCount: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0]?.['endpoint'], '/sdk/generate-text');
  assert.equal(payloads[1]?.['endpoint'], '/sdk/embeddings');
  assert.equal(payloads[1]?.['inputCount'], 3);
  assert.equal(payloads[1]?.['itemCount'], 3);
});

test('createHttpTelemetrySink swallows transport failures', async () => {
  const sink = createHttpTelemetrySink({
    endpointUrl: 'http://control-plane.test/telemetry/events',
    fetchImpl: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
  });

  await assert.doesNotReject(async () => {
    await sink({
      eventType: 'embeddings_execution',
      projectId: 'proj-2',
      useCase: 'embeddings',
      decision: 'cloud',
      reason: 'agent_unavailable',
      reasonCategory: 'preflight',
      durationMs: 12,
      fallbackInvoked: true,
    });
  });
});

test('cached provider uses stale config after refresh failure', async () => {
  let callCount = 0;
  const provider = new CachedProjectConfigProvider(
    {
      loadProjectConfig: async () => {
        callCount += 1;
        if (callCount === 1) {
          return createEmbeddingsConfig();
        }
        throw new Error('network unavailable');
      },
    },
    {
      ttlMs: 1,
      allowStaleOnError: true,
      maxStaleMs: 60_000,
    },
  );

  const first = await provider.loadProjectConfig('project-test');
  assert.equal(first.projectId, 'project-test');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await provider.loadProjectConfig('project-test');
  assert.equal(second.projectId, 'project-test');
  assert.equal(callCount, 2);
});

test('cached provider with ttlMs=0 keeps no-cache semantics', async () => {
  const provider = new CachedProjectConfigProvider(
    {
      loadProjectConfig: async () => {
        throw new Error('cold-start resolver unavailable');
      },
    },
    { ttlMs: 0 },
  );

  await assert.rejects(
    () => provider.loadProjectConfig('project-test'),
    /cold-start resolver unavailable/,
  );
});

test('cached provider persists LKG to disk and reloads after process restart', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-config-cache-'));
  let online = true;
  let resolverCalls = 0;
  try {
    const networkProvider = {
      loadProjectConfig: async () => {
        resolverCalls += 1;
        if (!online) {
          throw new Error('resolver offline');
        }
        return createEmbeddingsConfig();
      },
    };

    const firstProcess = new CachedProjectConfigProvider(networkProvider, {
      ttlMs: 1,
      allowStaleOnError: true,
      maxStaleMs: 60_000,
      persistence: 'disk',
      diskPath: cacheDir,
      cacheNamespace: 'http://resolver.test',
    });
    await firstProcess.loadProjectConfig('project-test');
    await new Promise((resolve) => setTimeout(resolve, 5));

    online = false;
    const secondProcess = new CachedProjectConfigProvider(networkProvider, {
      ttlMs: 1,
      allowStaleOnError: true,
      maxStaleMs: 60_000,
      persistence: 'disk',
      diskPath: cacheDir,
      cacheNamespace: 'http://resolver.test',
    });
    const fromDisk = await secondProcess.loadProjectConfig('project-test');
    assert.equal(fromDisk.projectId, 'project-test');
    assert.equal(resolverCalls, 2);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('embedTexts reports aggregate batch telemetry', async () => {
  const telemetryEvents: Array<Record<string, unknown>> = [];
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-batch' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [1, 1, 1] } }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => ({ embedding: [8, 8, 8] }),
    telemetrySinks: [
      async (event) => {
        telemetryEvents.push(event as unknown as Record<string, unknown>);
      },
    ],
  });

  const batch = await runtime.embedTexts(['hello', 'world']);
  assert.equal(batch.itemCount, 2);
  assert.equal(batch.successCount, 2);
  assert.equal(batch.failureCount, 0);
  assert.equal(telemetryEvents.some((event) => event['eventType'] === 'embeddings_batch_execution'), true);
});

test('cloud fallback timeout surfaces fallback_adapter_timeout', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-fallback-timeout' }),
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () =>
      await new Promise((resolve) => {
        setTimeout(() => resolve({ embedding: [0, 0, 0] }), 400);
      }),
    cloudFallbackTimeoutMs: 200,
  });

  await assert.rejects(
    () => runtime.embedText('hello'),
    /Cloud fallback failed \(fallback_adapter_timeout\) after local reason local_job_failed/,
  );
});

test('cloud fallback adapter errors surface fallback_adapter_error', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-fallback-error' }),
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    cloudFallback: async () => {
      throw new Error('provider rejected request');
    },
  });

  await assert.rejects(
    () => runtime.embedText('hello'),
    /Cloud fallback failed \(fallback_adapter_error\) after local reason local_job_failed/,
  );
});

test('disabled fallback preserves local failure reason and surfaces fallback_disabled', async () => {
  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-fallback-disabled' }),
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => ({
        ...createEmbeddingsConfig(),
        fallback_enabled: false,
      }),
    },
    cloudFallback: async () => ({ embedding: [1, 2, 3] }),
  });

  await assert.rejects(
    () => runtime.embedText('hello'),
    /Local execution failed \(local_job_failed\) and cloud fallback is disabled in project config \(fallback_disabled\)/,
  );
});

test('managed onboarding works with projectApiKey and cloud fallback only', async () => {
  const resolver = createManagedResolverFetch();
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_live_example',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    sdk: createSdkStub({
      createJob: async () => ({ id: 'managed-job' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [2, 4, 6] } }),
    }) as never,
    cloudFallback: async () => ({ embedding: [9, 9, 9] }),
  });

  const result = await runtime.embedText('hello');
  assert.equal(result.decision, 'local');
  assert.equal(result.reason, 'local_job_completed');
  assert.deepEqual(result.embedding, [2, 4, 6]);
  assert.equal(result.projectConfig.projectId, 'project-test');
  assert.deepEqual(resolver.getCounts(), { configCalls: 1 });
});

test('managed onboarding reports invalid project API key', async () => {
  const resolver = createManagedResolverFetch({
    configStatus: 401,
    configBody: { error: 'unauthorized', code: 'invalid_api_key' },
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_invalid',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /invalid_project_api_key/);
});

test('managed onboarding reports revoked project API key', async () => {
  const resolver = createManagedResolverFetch({
    configStatus: 401,
    configBody: { error: 'unauthorized', code: 'revoked_api_key' },
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_revoked',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /revoked_project_api_key/);
});

test('managed onboarding reuses stale cache when resolver refresh fails', async () => {
  let allowConfigFailures = false;
  const resolver = createManagedResolverFetch({
    failConfigRequest: false,
  });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (allowConfigFailures && url.includes('/api/v1/sdk/config')) {
      throw new Error('network unavailable during refresh');
    }
    return resolver.fetchImpl(input, init);
  }) as typeof fetch;

  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_stale',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: fetchImpl,
    projectConfigCache: {
      ttlMs: 1,
      allowStaleOnError: true,
      maxStaleMs: 60_000,
    },
    sdk: createSdkStub({
      createJob: async () => ({ id: 'stale-job' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [1, 1, 2] } }),
    }) as never,
    cloudFallback: async () => ({ embedding: [0, 0, 0] }),
  });

  await runtime.embedText('first');
  await new Promise((resolve) => setTimeout(resolve, 5));
  allowConfigFailures = true;
  const second = await runtime.embedText('second');
  assert.equal(second.decision, 'local');
  assert.deepEqual(second.embedding, [1, 1, 2]);
});

test('managed onboarding reuses disk LKG across runtime restart when resolver is down', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-managed-cache-'));
  let failConfigRequest = false;
  const resolver = createManagedResolverFetch();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (failConfigRequest && url.includes('/api/v1/sdk/config')) {
      throw new Error('resolver unavailable after restart');
    }
    return resolver.fetchImpl(input, init);
  }) as typeof fetch;
  try {
    const firstRuntime = new DynoEmbeddingsRuntime({
      projectApiKey: 'dyno_pk_disk_warmup',
      configResolverUrl: 'http://resolver.test',
      resolverFetch: fetchImpl,
      projectConfigCache: {
        ttlMs: 1,
        allowStaleOnError: true,
        maxStaleMs: 60_000,
        persistence: 'disk',
        diskPath: cacheDir,
      },
      sdk: createSdkStub({
        createJob: async () => ({ id: 'disk-warmup-job' }),
        waitForJobCompletion: async () => ({ state: 'completed' }),
        getJobResult: async () => ({ output: { embedding: [4, 2, 0] } }),
      }) as never,
      cloudFallback: async () => ({ embedding: [0, 0, 0] }),
    });
    await firstRuntime.embedText('warm');
    await new Promise((resolve) => setTimeout(resolve, 5));

    failConfigRequest = true;
    const secondRuntime = new DynoEmbeddingsRuntime({
      projectApiKey: 'dyno_pk_disk_warmup',
      configResolverUrl: 'http://resolver.test',
      resolverFetch: fetchImpl,
      projectConfigCache: {
        ttlMs: 1,
        allowStaleOnError: true,
        maxStaleMs: 60_000,
        persistence: 'disk',
        diskPath: cacheDir,
      },
      sdk: createSdkStub({
        createJob: async () => ({ id: 'disk-restart-job' }),
        waitForJobCompletion: async () => ({ state: 'completed' }),
        getJobResult: async () => ({ output: { embedding: [4, 2, 0] } }),
      }) as never,
      cloudFallback: async () => ({ embedding: [0, 0, 0] }),
    });

    const second = await secondRuntime.embedText('after-restart');
    assert.equal(second.decision, 'local');
    assert.deepEqual(second.embedding, [4, 2, 0]);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('managed onboarding fails cold start with disk mode when resolver is down and no cache exists', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-managed-cache-cold-'));
  try {
    const resolver = createManagedResolverFetch({
      failConfigRequest: true,
    });
    const runtime = new DynoEmbeddingsRuntime({
      projectApiKey: 'dyno_pk_disk_cold_start',
      configResolverUrl: 'http://resolver.test',
      resolverFetch: resolver.fetchImpl,
      projectConfigCache: {
        ttlMs: 30_000,
        allowStaleOnError: true,
        maxStaleMs: 60_000,
        persistence: 'disk',
        diskPath: cacheDir,
      },
      sdk: createSdkStub() as never,
      cloudFallback: async () => ({ embedding: [1] }),
    });

    await assert.rejects(() => runtime.embedText('hello'), /resolver_unreachable/);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('managed onboarding in no-cache mode fails cold start when resolver is unreachable', async () => {
  const resolver = createManagedResolverFetch({
    failConfigRequest: true,
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_nocache',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    projectConfigCache: { ttlMs: 0 },
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /resolver_unreachable/);
});

test('managed onboarding maps project config 404 to project_config_not_found', async () => {
  const resolver = createManagedResolverFetch({
    configStatus: 404,
    configBody: { error: 'not_found' },
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_not_found',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    projectConfigCache: { ttlMs: 0 },
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /project_config_not_found/);
});

test('managed onboarding maps malformed config payload to resolver_payload_invalid', async () => {
  const resolver = createManagedResolverFetch({
    configBody: { projectId: 'project-test' },
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_bad_payload',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    projectConfigCache: { ttlMs: 0 },
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /resolver_payload_invalid/);
});

test('managed onboarding maps resolver timeout to resolver_timeout', async () => {
  const resolver = createManagedResolverFetch({
    failConfigWithTimeout: true,
  });
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_timeout',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    resolverRequestTimeoutMs: 250,
    projectConfigCache: { ttlMs: 0 },
    sdk: createSdkStub() as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await assert.rejects(() => runtime.embedText('hello'), /resolver_timeout/);
});

test('managed onboarding resolves auth once across config refreshes', async () => {
  const resolver = createManagedResolverFetch();
  const runtime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_cache_auth',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    projectConfigCache: {
      ttlMs: 1,
      allowStaleOnError: false,
      maxStaleMs: 60_000,
    },
    sdk: createSdkStub({
      createJob: async () => ({ id: 'job-cache-auth' }),
      waitForJobCompletion: async () => ({ state: 'completed' }),
      getJobResult: async () => ({ output: { embedding: [9, 8, 7] } }),
    }) as never,
    cloudFallback: async () => ({ embedding: [1] }),
  });

  await runtime.embedText('hello');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await runtime.embedText('world');
  const counts = resolver.getCounts();
  assert.equal(counts.configCalls, 2);
});

test('managed and explicit-provider modes keep reason parity', async () => {
  const resolver = createManagedResolverFetch();
  const sdk = createSdkStub({
    healthCheck: async () => {
      throw new Error('agent offline');
    },
  }) as never;

  const managedRuntime = new DynoEmbeddingsRuntime({
    projectApiKey: 'dyno_pk_parity',
    configResolverUrl: 'http://resolver.test',
    resolverFetch: resolver.fetchImpl,
    sdk,
    cloudFallback: async () => ({ embedding: [6, 7, 8] }),
  });

  const explicitRuntime = new DynoEmbeddingsRuntime({
    projectId: 'project-test',
    projectConfigProvider: {
      loadProjectConfig: async () => createEmbeddingsConfig(),
    },
    sdk,
    cloudFallback: async () => ({ embedding: [6, 7, 8] }),
  });

  const managed = await managedRuntime.embedText('hello');
  const explicit = await explicitRuntime.embedText('hello');
  assert.equal(managed.decision, explicit.decision);
  assert.equal(managed.reason, explicit.reason);
  assert.equal(managed.reasonCategory, explicit.reasonCategory);
});

test('telemetry sink retries and exhausts retry budget without throwing', async () => {
  let attempts = 0;
  const sink = createHttpTelemetrySink({
    endpointUrl: 'http://control-plane.test/telemetry/events',
    maxRetries: 1,
    retryBaseDelayMs: 10,
    fetchImpl: (async () => {
      attempts += 1;
      throw new Error('transient network outage');
    }) as typeof fetch,
  });

  await sink({
    eventType: 'embeddings_execution',
    projectId: 'proj-3',
    useCase: 'embeddings',
    decision: 'cloud',
    reason: 'agent_unavailable',
    reasonCategory: 'preflight',
    durationMs: 20,
    fallbackInvoked: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(attempts, 2);
});
