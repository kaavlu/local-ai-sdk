/**
 * In-process Step 19 checks (timeout helper + idle eligibility + active-use guard).
 * Sets env before loading agent modules so thresholds apply.
 *
 * Run: node scripts/step19-runtime-selftest.mjs
 * Requires: npm run build -w @dyno/agent
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIST = path.join(ROOT, 'packages', 'agent', 'dist');

const failures = [];
function fail(m) {
  failures.push(m);
  console.error('[step19-selftest] FAIL: ' + m);
}
function pass(m) {
  console.log('[step19-selftest] PASS: ' + m);
}
function assert(c, m) {
  if (!c) fail(m);
  else pass(m);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(path.join(AGENT_DIST, 'models', 'workload-model-runtime.js'))) {
    console.error('[step19-selftest] Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  process.env.DYNO_WORKLOAD_IDLE_EVICT_MS = '120';
  process.env.DYNO_WORKLOAD_EXEC_TIMEOUT_MS = '80';

  const rtHref = pathToFileURL(path.join(AGENT_DIST, 'models', 'workload-model-runtime.js')).href;
  const embedHref = pathToFileURL(path.join(AGENT_DIST, 'models', 'embed-text-model.js')).href;
  await import(rtHref);
  const embed = await import(embedHref);
  const rt = await import(rtHref);

  const {
    beginLocalWorkloadExecution,
    endLocalWorkloadExecution,
    isWorkloadModelIdleEvictionEligible,
    runWithLocalWorkloadTimeout,
    runIdleEvictionAfterLocalJob,
  } = rt;
  const { warmupEmbedTextModel, getEmbedTextModelState } = embed;

  console.log('\n--- Test 8: runWithLocalWorkloadTimeout (fast reject) ---\n');
  const t0 = Date.now();
  try {
    await runWithLocalWorkloadTimeout('embed_text', () => new Promise(() => {}));
    fail('timeout: expected rejection');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dt = Date.now() - t0;
    assert(msg.includes('timed out') && msg.includes('embed_text'), 'timeout message mentions embed_text + timed out');
    assert(dt < 500, `timeout fired quickly (${dt}ms)`);
  }

  console.log('\n--- Test 8b: runWithLocalWorkloadTimeout (fast resolve) ---\n');
  const v = await runWithLocalWorkloadTimeout('embed_text', async () => 42);
  assert(v === 42, 'non-hanging work completes under timeout');

  console.log('\n--- Warm embed once (cached weights; may be slow first CI run) ---\n');
  await warmupEmbedTextModel();
  assert(getEmbedTextModelState().state === 'ready', 'embed model ready after warmup');

  const now0 = Date.now();
  assert(
    !isWorkloadModelIdleEvictionEligible('embed_text', now0),
    'just-warmed embed is not idle-eviction eligible',
  );

  console.log('\n--- Test 7: active use blocks idle eligibility ---\n');
  beginLocalWorkloadExecution('embed_text');
  assert(
    !isWorkloadModelIdleEvictionEligible('embed_text', Date.now() + 999_999),
    'active embed_text never eligible while beginLocalWorkloadExecution holds',
  );
  endLocalWorkloadExecution();

  console.log('\n--- Test 5/6: eligibility tracks idle threshold ---\n');
  await sleep(130);
  assert(
    isWorkloadModelIdleEvictionEligible('embed_text', Date.now()),
    'after idle > DYNO_WORKLOAD_IDLE_EVICT_MS, embed becomes eligible',
  );

  runIdleEvictionAfterLocalJob();
  assert(getEmbedTextModelState().state === 'not_loaded', 'post-eligibility sweep evicted embed via runIdleEvictionAfterLocalJob');

  console.log('\n[step19-selftest] Done.');
  if (failures.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[step19-selftest] fatal:', e);
  process.exit(1);
});
