import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK_ENTRY = path.join(ROOT, 'packages', 'sdk-ts', 'dist', 'index.js');

const baseUrl = process.env.DYNO_AGENT_URL?.trim() || 'http://127.0.0.1:8787';

function makeConfig(overrides = {}) {
  return {
    projectId: 'sdk-live-matrix',
    use_case_type: 'embeddings',
    strategy_preset: 'local_first',
    local_model: null,
    cloud_model: 'developer-cloud',
    fallback_enabled: true,
    requires_charging: false,
    wifi_only: false,
    battery_min_percent: null,
    idle_min_seconds: null,
    ...overrides,
  };
}

function jsonResult(name, payload) {
  console.log(`[matrix] ${name}: ${JSON.stringify(payload)}`);
}

async function run() {
  const { DynoSdk, DynoEmbeddingsRuntime, CachedProjectConfigProvider } = await import(
    pathToFileURL(SDK_ENTRY).href
  );

  const telemetry = [];
  const primarySdk = new DynoSdk({ baseUrl, projectId: 'sdk-live-matrix' });
  const primaryProvider = new CachedProjectConfigProvider(
    {
      loadProjectConfig: async () => makeConfig(),
    },
    { ttlMs: 30_000 },
  );

  const runtime = new DynoEmbeddingsRuntime({
    projectId: 'sdk-live-matrix',
    sdk: primarySdk,
    projectConfigProvider: primaryProvider,
    cloudFallback: async () => ({ embedding: [9, 9, 9] }),
    telemetrySinks: [
      (event) => {
        telemetry.push(event);
      },
    ],
    localTimeoutMs: 25_000,
  });

  // Scenario 1: live local attempt (may still fallback depending on runtime readiness)
  const liveAttempt = await runtime.embedText('dyno live local-or-cloud probe');
  jsonResult('scenario_live_single', {
    decision: liveAttempt.decision,
    reason: liveAttempt.reason,
    reasonCategory: liveAttempt.reasonCategory,
    embeddingLength: liveAttempt.embedding.length,
  });

  // Scenario 2: force cloud fallback by pointing SDK to unreachable agent endpoint
  const unreachableSdk = new DynoSdk({ baseUrl: 'http://127.0.0.1:9998', projectId: 'sdk-live-matrix' });
  const cloudRuntime = new DynoEmbeddingsRuntime({
    projectId: 'sdk-live-matrix',
    sdk: unreachableSdk,
    projectConfigProvider: {
      loadProjectConfig: async () => makeConfig(),
    },
    cloudFallback: async (request) => ({
      embedding: [request.reason === 'agent_unavailable' ? 7 : 3],
    }),
  });
  const forcedCloud = await cloudRuntime.embedText('force cloud path');
  jsonResult('scenario_forced_cloud', {
    decision: forcedCloud.decision,
    reason: forcedCloud.reason,
    reasonCategory: forcedCloud.reasonCategory,
    embedding: forcedCloud.embedding,
  });

  // Scenario 3: fallback disabled should fail explicitly.
  const noFallbackRuntime = new DynoEmbeddingsRuntime({
    projectId: 'sdk-live-matrix',
    sdk: unreachableSdk,
    projectConfigProvider: {
      loadProjectConfig: async () => makeConfig({ fallback_enabled: false }),
    },
    cloudFallback: async () => ({ embedding: [1, 1, 1] }),
  });
  try {
    await noFallbackRuntime.embedText('fallback disabled path');
    jsonResult('scenario_fallback_disabled', { ok: false, unexpected: 'no error thrown' });
  } catch (error) {
    jsonResult('scenario_fallback_disabled', {
      ok: true,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Scenario 4: batch path with partial failures.
  const batch = await runtime.embedTexts(['first batch item', '   ', 'third batch item']);
  jsonResult('scenario_batch_partial', {
    itemCount: batch.itemCount,
    successCount: batch.successCount,
    failureCount: batch.failureCount,
    failedIndexes: batch.results.filter((result) => !result.ok).map((result) => result.index),
  });

  jsonResult('telemetry_summary', {
    total: telemetry.length,
    batchEvents: telemetry.filter((event) => event.eventType === 'embeddings_batch_execution').length,
    localEvents: telemetry.filter((event) => event.decision === 'local').length,
    cloudEvents: telemetry.filter((event) => event.decision === 'cloud').length,
    mixedEvents: telemetry.filter((event) => event.decision === 'mixed').length,
  });
}

run().catch((error) => {
  console.error(
    '[matrix] failed:',
    error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
  );
  process.exit(1);
});
