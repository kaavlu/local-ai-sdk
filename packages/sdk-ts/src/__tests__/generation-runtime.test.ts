import assert from 'node:assert/strict';
import test from 'node:test';
import { DynoGenerationRuntime } from '../generation-runtime.js';
import type { HealthResponse } from '../types.js';

function createGenerationConfig() {
  return {
    projectId: 'project-generate-test',
    use_case_type: 'text_generation' as const,
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
    createJob: overrides?.createJob ?? (async () => ({ id: 'job-generate-default' })),
    waitForJobCompletion: overrides?.waitForJobCompletion ?? (async () => ({ state: 'completed' })),
    getJobResult:
      overrides?.getJobResult ??
      (async () => ({
        output: {
          taskType: 'generate_text',
          output: 'hello from local',
          model: 'Xenova/distilgpt2',
          usage: { promptChars: 5, completionChars: 16, totalChars: 21 },
        },
      })),
  };
}

test('generation local success returns local decision and model output', async () => {
  const runtime = new DynoGenerationRuntime({
    projectId: 'project-generate-test',
    sdk: createSdkStub() as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createGenerationConfig(),
    },
    cloudFallback: async () => ({ output: 'fallback text' }),
  });

  const result = await runtime.generateText('hello');
  assert.equal(result.decision, 'local');
  assert.equal(result.reason, 'local_job_completed');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.equal(result.output, 'hello from local');
  assert.equal(result.model, 'Xenova/distilgpt2');
});

test('generation local failure falls back through adapter-first contract', async () => {
  const runtime = new DynoGenerationRuntime({
    projectId: 'project-generate-test',
    sdk: createSdkStub({
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createGenerationConfig(),
    },
    cloudFallback: async (request) => {
      assert.equal(request.reason, 'local_job_failed');
      assert.equal(request.reasonCategory, 'local_execution');
      assert.equal(request.payload.text, 'hello');
      return {
        output: 'fallback output',
        model: 'gpt-fallback',
        usage: { promptChars: 5, completionChars: 15, totalChars: 20 },
      };
    },
  });

  const result = await runtime.generateText('hello');
  assert.equal(result.decision, 'cloud');
  assert.equal(result.reason, 'local_job_failed');
  assert.equal(result.reasonCategory, 'local_execution');
  assert.equal(result.output, 'fallback output');
  assert.equal(result.model, 'gpt-fallback');
});

test('generation fallback timeout surfaces fallback_adapter_timeout', async () => {
  const runtime = new DynoGenerationRuntime({
    projectId: 'project-generate-test',
    sdk: createSdkStub({
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createGenerationConfig(),
    },
    cloudFallback: async () =>
      await new Promise((resolve) => {
        setTimeout(() => resolve({ output: 'late fallback' }), 350);
      }),
    cloudFallbackTimeoutMs: 150,
  });

  await assert.rejects(
    () => runtime.generateText('hello'),
    /Cloud fallback failed \(fallback_adapter_timeout\) after local reason local_job_failed/,
  );
});

test('generation fallback adapter errors surface fallback_adapter_error', async () => {
  const runtime = new DynoGenerationRuntime({
    projectId: 'project-generate-test',
    sdk: createSdkStub({
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => createGenerationConfig(),
    },
    cloudFallback: async () => {
      throw new Error('provider unavailable');
    },
  });

  await assert.rejects(
    () => runtime.generateText('hello'),
    /Cloud fallback failed \(fallback_adapter_error\) after local reason local_job_failed/,
  );
});

test('generation fallback disabled preserves local reason and surfaces fallback_disabled', async () => {
  const runtime = new DynoGenerationRuntime({
    projectId: 'project-generate-test',
    sdk: createSdkStub({
      waitForJobCompletion: async () => ({ state: 'failed' }),
    }) as never,
    projectConfigProvider: {
      loadProjectConfig: async () => ({
        ...createGenerationConfig(),
        fallback_enabled: false,
      }),
    },
    cloudFallback: async () => ({ output: 'unused' }),
  });

  await assert.rejects(
    () => runtime.generateText('hello'),
    /Local execution failed \(local_job_failed\) and cloud fallback is disabled in project config \(fallback_disabled\)/,
  );
});
