/**
 * Quick SDK smoke test against a reachable local runtime endpoint.
 * Requires: npm run build -w @dynosdk/ts
 *
 * DYNO_AGENT_URL=http://127.0.0.1:9000 — full base URL (legacy LOCAL_AGENT_URL still honored)
 * PORT=9000 — shorthand for http://127.0.0.1:$PORT
 * SMOKE_SKIP_MACHINE_STATE=1 — skip getMachineState()
 * SMOKE_REQUIRE_LOCAL_GENERATION=0 — allow cloud decision for generation assertion (default requires local)
 * SMOKE_GENERATION_PROMPT="..." — prompt for generation probe
 * SMOKE_EXPECT_LOCAL_MODEL="Xenova/distilgpt2" — optional strict local model assertion
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK_ENTRY = path.join(ROOT, 'packages', 'sdk-ts', 'dist', 'index.js');

function resolveBaseUrl() {
  const explicit =
    process.env.DYNO_AGENT_URL?.trim() || process.env.LOCAL_AGENT_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const port = process.env.PORT?.trim();
  if (port) {
    return `http://127.0.0.1:${port}`;
  }
  return 'http://127.0.0.1:8787';
}

async function main() {
  if (!fs.existsSync(SDK_ENTRY)) {
    console.error('[smoke] SDK not built at packages/sdk-ts/dist/. Run: npm run build -w @dynosdk/ts');
    process.exit(1);
  }

  const baseUrl = resolveBaseUrl();
  const { DynoSdk, DynoGenerationRuntime } = await import(pathToFileURL(SDK_ENTRY).href);
  const sdk = new DynoSdk({ baseUrl });

  console.log('[smoke] baseUrl=' + baseUrl);

  const health = await sdk.healthCheck();
  console.log('[smoke] healthCheck:', health);

  const db = await sdk.getDbDebugInfo();
  console.log('[smoke] getDbDebugInfo:', JSON.stringify(db));

  if (process.env.SMOKE_SKIP_MACHINE_STATE === '1') {
    console.log('[smoke] skipped getMachineState (SMOKE_SKIP_MACHINE_STATE=1)');
  } else {
    const ms = await sdk.getMachineState();
    console.log('[smoke] getMachineState:', JSON.stringify(ms));
  }

  const generationPrompt =
    process.env.SMOKE_GENERATION_PROMPT?.trim() || 'Write one short sentence about local-first AI.';
  const expectLocalGeneration = process.env.SMOKE_REQUIRE_LOCAL_GENERATION !== '0';
  const expectedLocalModel = process.env.SMOKE_EXPECT_LOCAL_MODEL?.trim();

  const generationRuntime = new DynoGenerationRuntime({
    projectId: 'smoke_generation_project',
    projectConfigProvider: {
      async loadProjectConfig() {
        return {
          projectId: 'smoke_generation_project',
          use_case_type: 'text_generation',
          strategy_preset: 'local_first',
          local_model: 'Xenova/distilgpt2',
          cloud_model: null,
          fallback_enabled: true,
          requires_charging: false,
          wifi_only: false,
          battery_min_percent: null,
          idle_min_seconds: null,
        };
      },
    },
    sdk,
    cloudFallback: async () => ({
      output: 'fallback smoke output',
      model: 'smoke-fallback',
    }),
  });

  const generation = await generationRuntime.generateText(generationPrompt, {
    maxNewTokens: 32,
    temperature: 0.7,
  });
  if (!generation.output?.trim()) {
    throw new Error('generation probe returned empty output');
  }
  if (generation.decision !== 'local' && generation.decision !== 'cloud') {
    throw new Error(`generation probe returned unexpected decision "${String(generation.decision)}"`);
  }
  if (expectLocalGeneration && generation.decision !== 'local') {
    throw new Error(
      `generation probe expected local decision but received "${generation.decision}" (reason=${generation.reason})`,
    );
  }
  if (
    generation.decision === 'local' &&
    expectedLocalModel &&
    (generation.model ?? '').trim() !== expectedLocalModel
  ) {
    throw new Error(
      `generation probe expected local model "${expectedLocalModel}" but received "${generation.model ?? ''}"`,
    );
  }

  console.log(
    '[smoke] generateText:',
    JSON.stringify({
      decision: generation.decision,
      reason: generation.reason,
      reasonCategory: generation.reasonCategory,
      model: generation.model,
      outputPreview: generation.output.slice(0, 120),
    }),
  );

  try {
    const models = await sdk.getModelDebugInfo();
    console.log('[smoke] model.generate_text.state:', models.generate_text?.state ?? 'unknown');
  } catch (error) {
    console.log(
      '[smoke] model debug unavailable:',
      error instanceof Error ? error.message : String(error),
    );
  }

  console.log('[smoke] ok');
}

function printHintIfUnreachable(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    console.error(
      '[smoke] hint: nothing responded at the base URL. Start the demo app (runtime manager autostarts agent) or run legacy manual mode: npm run dev:agent',
    );
    console.error(
      '[smoke] hint: if the agent uses another port, set PORT or DYNO_AGENT_URL (see README Developer workflow).',
    );
  }
}

main().catch((e) => {
  console.error('[smoke] failed:', e instanceof Error ? e.message : e);
  printHintIfUnreachable(e);
  process.exit(1);
});
