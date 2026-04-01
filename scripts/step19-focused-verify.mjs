/**
 * Step 19 focused verification plan (Tests 1–16): typecheck, in-process runtime selftest,
 * HTTP integration with short idle/timeout env overrides where needed.
 *
 * Run from repo root: node scripts/step19-focused-verify.mjs
 * Optional: STEP19_SKIP_TYPECHECK=1
 * Step 18 full E2E: set STEP19_RUN_STEP18=1 (heavy; model cache recommended).
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'packages', 'agent', 'dist', 'index.js');

const report = [];

function logResult(id, name, method, observed, passed, extra = '') {
  report.push({ id, name, method, observed, passed, extra });
  const st = passed ? 'PASS' : 'FAIL';
  console.log(`\n[${id}] ${st}: ${name}`);
  console.log(`    how: ${method}`);
  console.log(`    observed: ${observed}`);
  if (extra) console.log(`    note: ${extra}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  return { res, body };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAgent(base, maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const { res, body } = await fetchJson(`${base}/health`);
      if (res.ok && body?.ok === true) return true;
    } catch {
      /* */
    }
    await sleep(200);
  }
  return false;
}

async function waitJobTerminal(base, jobId, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { res, body } = await fetchJson(`${base}/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok || !body) {
      await sleep(250);
      continue;
    }
    if (['completed', 'failed', 'cancelled'].includes(body.state)) return body;
    await sleep(300);
  }
  return null;
}

function agentEnv(port, dataDir, extra = {}) {
  return {
    ...process.env,
    PORT: String(port),
    DYNO_AGENT_DATA_DIR: dataDir,
    DYNO_READINESS_BYPASS: '1',
    ...extra,
  };
}

async function postJob(base, taskType, payload) {
  return fetchJson(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType,
      payload,
      executionPolicy: 'local_only',
      localMode: 'interactive',
    }),
  });
}

function runTypecheck() {
  if (process.env.STEP19_SKIP_TYPECHECK === '1') {
    logResult(
      'Test 1a',
      'Typecheck (workspaces)',
      'skipped STEP19_SKIP_TYPECHECK=1',
      'skipped',
      true,
    );
    return true;
  }
  try {
    execSync('npm run typecheck --workspaces --if-present', {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    logResult(
      'Test 1a',
      'Typecheck (workspaces)',
      'execSync npm run typecheck --workspaces --if-present',
      'exit 0',
      true,
    );
    return true;
  } catch (e) {
    logResult(
      'Test 1a',
      'Typecheck (workspaces)',
      'execSync typecheck',
      String(e?.message ?? e),
      false,
    );
    return false;
  }
}

function runSelftestScript() {
  try {
    execSync(`node ${path.join(ROOT, 'scripts', 'step19-runtime-selftest.mjs')}`, {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    logResult(
      'Test 7+8',
      'In-process timeout + idle eligibility + active guard + idle eviction',
      'node scripts/step19-runtime-selftest.mjs (dynamic import dist with DYNO_* env)',
      'selftest exit 0',
      true,
    );
    return true;
  } catch (e) {
    logResult(
      'Test 7+8',
      'In-process runtime selftest',
      'node scripts/step19-runtime-selftest.mjs',
      String(e?.message ?? e),
      false,
    );
    return false;
  }
}

function runStep19VerifyQuick() {
  try {
    execSync(`node ${path.join(ROOT, 'scripts', 'step19-verify.mjs')}`, {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    logResult(
      'Test 1b',
      'Existing Step 19 HTTP smoke (step19-verify.mjs)',
      'node scripts/step19-verify.mjs',
      'exit 0',
      true,
    );
    return true;
  } catch (e) {
    logResult(
      'Test 1b',
      'step19-verify.mjs',
      'node scripts/step19-verify.mjs',
      String(e?.message ?? e),
      false,
    );
    return false;
  }
}

function runStep18Optional() {
  if (process.env.STEP19_RUN_STEP18 !== '1') {
    logResult(
      'Test 1c',
      'Step 18 full verify',
      'skipped (set STEP19_RUN_STEP18=1 to run step18-verify.mjs)',
      'skipped',
      true,
    );
    return true;
  }
  try {
    execSync(`node ${path.join(ROOT, 'scripts', 'step18-verify.mjs')}`, {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8',
      timeout: 600_000,
    });
    logResult(
      'Test 1c',
      'Step 18 regression (embed + classify + pause path)',
      'node scripts/step18-verify.mjs',
      'exit 0',
      true,
    );
    return true;
  } catch (e) {
    logResult(
      'Test 1c',
      'step18-verify.mjs',
      'node scripts/step18-verify.mjs',
      String(e?.message ?? e),
      false,
      'May be environment (model download/OOM); distinguish from Step 19 logic bugs',
    );
    return false;
  }
}

async function spawnAgent(port, dataDir, envExtra) {
  const child = spawn(process.execPath, [AGENT_ENTRY], {
    env: agentEnv(port, dataDir, envExtra),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  const up = await waitForAgent(base);
  if (!up) {
    child.kill('SIGTERM');
    return { ok: false, child, base: null };
  }
  return { ok: true, child, base };
}

async function httpMainFlow() {
  const port = Number(process.env.STEP19_HTTP_PORT) || 18831;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step19-focus-'));
  const { ok, child, base } = await spawnAgent(port, dataDir, {});
  if (!ok) {
    logResult('HTTP suite', 'Agent start', 'spawn + /health', 'unhealthy', false);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return false;
  }

  let allOk = true;
  try {
    // Test 2
    let { res, body } = await fetchJson(`${base}/debug/models`);
    const t2 =
      res.ok &&
      body?.embed_text &&
      body?.classify_text &&
      'lastUsedAt' in body.embed_text &&
      'lastUsedAt' in body.classify_text &&
      body.workloadModelRuntime?.idleEvictAfterMs > 0;
    logResult(
      'Test 2',
      '/debug/models exposes lastUsedAt + workloadModelRuntime',
      'GET /debug/models (cold)',
      JSON.stringify({
        ok: res.ok,
        embed_lastUsedAt: body?.embed_text?.lastUsedAt,
        hasRuntime: !!body?.workloadModelRuntime,
      }),
      t2,
    );
    allOk &&= t2;

    // Test 3
    const w1 = await fetchJson(`${base}/models/embed-text/warmup`, { method: 'POST' });
    const lu1 = w1.body?.embed_text?.lastUsedAt;
    await sleep(80);
    const w2 = await fetchJson(`${base}/models/embed-text/warmup`, { method: 'POST' });
    const lu2 = w2.body?.embed_text?.lastUsedAt;
    const t3 =
      w1.res.ok &&
      w2.res.ok &&
      typeof lu1 === 'number' &&
      typeof lu2 === 'number' &&
      lu2 >= lu1;
    logResult(
      'Test 3',
      'Warmup updates lastUsedAt',
      'POST warmup twice; compare lastUsedAt',
      `lu1=${lu1} lu2=${lu2}`,
      t3,
    );
    allOk &&= t3;

    const beforeJob = (await fetchJson(`${base}/debug/models`)).body?.embed_text?.lastUsedAt;
    const jobRes = await postJob(base, 'embed_text', { text: 't' });
    const jobId = jobRes.body?.id;
    const done = await waitJobTerminal(base, jobId, 120_000);
    const afterJob = (await fetchJson(`${base}/debug/models`)).body?.embed_text?.lastUsedAt;
    const t4 =
      jobRes.res.status === 201 &&
      done?.state === 'completed' &&
      typeof beforeJob === 'number' &&
      typeof afterJob === 'number' &&
      afterJob >= beforeJob;
    logResult(
      'Test 4',
      'Real embed_text execution updates lastUsedAt',
      'POST /jobs embed_text; GET /debug/models before/after',
      `state=${done?.state} before=${beforeJob} after=${afterJob}`,
      t4,
    );
    allOk &&= t4;

    // Test 15 (same job)
    logResult(
      'Test 15',
      'Tiny embed_text end-to-end',
      'same job as Test 4',
      `completed taskType embed_text`,
      done?.state === 'completed',
    );
    allOk &&= done?.state === 'completed';

    const cw = await fetchJson(`${base}/models/classify-text/warmup`, { method: 'POST' });
    const m = await fetchJson(`${base}/debug/models`);
    const t12 =
      cw.res.ok &&
      m.body?.embed_text?.state === 'ready' &&
      m.body?.classify_text?.state === 'ready' &&
      typeof m.body?.embed_text?.lastUsedAt === 'number' &&
      typeof m.body?.classify_text?.lastUsedAt === 'number';
    logResult(
      'Test 12',
      'Both workloads coexist with separate lastUsedAt',
      'warm classify; GET /debug/models',
      `embed=${m.body?.embed_text?.state} classify=${m.body?.classify_text?.state}`,
      t12,
    );
    allOk &&= t12;

    const cr = await postJob(base, 'classify_text', { text: 'good' });
    const cid = cr.body?.id;
    const cDone = await waitJobTerminal(base, cid, 120_000);
    const t15b = cr.res.status === 201 && cDone?.state === 'completed';
    logResult(
      'Test 15b',
      'Tiny classify_text end-to-end (models warm)',
      'POST /jobs classify_text',
      `state=${cDone?.state}`,
      t15b,
    );
    allOk &&= t15b;

    const rReady = await fetchJson(`${base}/debug/readiness`);
    const rMet = await fetchJson(`${base}/debug/metrics`);
    const rCap = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
    const t13 =
      rReady.res.ok &&
      rMet.res.ok &&
      rCap.res.ok &&
      'lastUsedAt' in (rReady.body?.embedTextModel || {}) &&
      typeof rMet.body?.metrics?.models?.embedText?.lastUsedAt === 'number';
    logResult(
      'Test 13',
      'readiness + metrics + capability still healthy',
      'GET /debug/readiness, /debug/metrics, /debug/capability',
      `readiness=${rReady.res.ok} metrics=${rMet.res.ok}`,
      t13,
    );
    allOk &&= t13;

    await fetchJson(`${base}/worker/pause`, { method: 'POST' });
    const pj = await postJob(base, 'classify_text', { text: 'ok' });
    await sleep(700);
    const jq = await fetchJson(`${base}/jobs/${encodeURIComponent(pj.body?.id)}`);
    const t14a = pj.res.status === 201 && jq.body?.state === 'queued';
    await fetchJson(`${base}/jobs/${encodeURIComponent(pj.body?.id)}/cancel`, { method: 'POST' });
    await fetchJson(`${base}/worker/resume`, { method: 'POST' });
    logResult(
      'Test 14',
      'Pause holds queue; cancel + resume',
      'POST pause; job; expect queued; cancel; resume',
      `queued=${t14a} id=${pj.body?.id}`,
      t14a,
    );
    allOk &&= t14a;
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
  return allOk;
}

async function httpIdleEviction() {
  const port = Number(process.env.STEP19_IDLE_PORT) || 18832;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step19-idle-'));
  const { ok, child, base } = await spawnAgent(port, dataDir, {
    DYNO_WORKLOAD_IDLE_EVICT_MS: '160',
  });
  if (!ok) {
    logResult('Test 5/6/11', 'Idle agent start', 'spawn', 'fail', false);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return false;
  }
  let allOk = true;
  try {
    await fetchJson(`${base}/models/embed-text/warmup`, { method: 'POST' });
    const fresh = await fetchJson(`${base}/debug/models`);
    const t6 =
      fresh.body?.embed_text?.state === 'ready' &&
      typeof fresh.body?.embed_text?.lastUsedAt === 'number';
    logResult(
      'Test 6',
      'No premature eviction before threshold',
      'warm embed; GET /debug/models immediately (idle < threshold)',
      `state=${fresh.body?.embed_text?.state}`,
      t6,
    );
    allOk &&= t6;

    await sleep(220);
    const evicted = await fetchJson(`${base}/debug/models`);
    const t5 = evicted.body?.embed_text?.state === 'not_loaded';
    logResult(
      'Test 5',
      'Idle eviction unloads after threshold via GET /debug/models sweep',
      'sleep > DYNO_WORKLOAD_IDLE_EVICT_MS; GET /debug/models',
      `embed_text.state=${evicted.body?.embed_text?.state}`,
      t5,
    );
    allOk &&= t5;

    const wAgain = await fetchJson(`${base}/models/embed-text/warmup`, { method: 'POST' });
    const t11 = wAgain.res.ok && wAgain.body?.embed_text?.state === 'ready';
    logResult(
      'Test 11',
      'Re-warm after eviction',
      'POST /models/embed-text/warmup',
      `state=${wAgain.body?.embed_text?.state}`,
      t11,
    );
    allOk &&= t11;
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
  return allOk;
}

async function httpTimeoutConfigAndPipelineWiring() {
  const port = Number(process.env.STEP19_TIMEOUT_PORT) || 18833;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step19-to-'));
  const expectedMs = 9876;
  const { ok, child, base } = await spawnAgent(port, dataDir, {
    DYNO_WORKLOAD_EXEC_TIMEOUT_MS: String(expectedMs),
  });
  if (!ok) {
    logResult('Test 9a', 'Timeout-config agent start', 'spawn', 'fail', false);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return false;
  }
  let allOk = true;
  try {
    const { res, body } = await fetchJson(`${base}/debug/models`);
    const rt = body?.workloadModelRuntime;
    const t9 =
      res.ok &&
      rt?.defaultExecutionTimeoutMs === expectedMs &&
      rt?.perWorkloadExecutionTimeoutMs?.embed_text === expectedMs &&
      rt?.perWorkloadExecutionTimeoutMs?.classify_text === expectedMs;
    logResult(
      'Test 9',
      'Execution timeout budget is env-configurable and visible on /debug/models',
      `DYNO_WORKLOAD_EXEC_TIMEOUT_MS=${expectedMs}; GET /debug/models workloadModelRuntime`,
      JSON.stringify({
        default: rt?.defaultExecutionTimeoutMs,
        embed: rt?.perWorkloadExecutionTimeoutMs?.embed_text,
      }),
      t9,
    );
    allOk &&= t9;

    const pipelineSrc = fs.readFileSync(
      path.join(ROOT, 'packages', 'agent', 'src', 'jobs', 'pipeline.ts'),
      'utf8',
    );
    const t10 =
      pipelineSrc.includes('runWithLocalWorkloadTimeout') &&
      pipelineSrc.includes('wl.executeLocal') &&
      pipelineSrc.includes('handleExecutionFailure');
    logResult(
      'Test 10',
      'Pipeline: timeout wrapper + failures to handleExecutionFailure (retry path)',
      'read packages/agent/src/jobs/pipeline.ts',
      'runWithLocalWorkloadTimeout + handleExecutionFailure in catch',
      t10,
    );
    allOk &&= t10;

    const jobsIdx = fs.readFileSync(path.join(ROOT, 'packages', 'agent', 'src', 'jobs', 'index.ts'), 'utf8');
    const t9b =
      jobsIdx.includes('handleExecutionFailure') &&
      jobsIdx.includes('requeueJob') &&
      jobsIdx.includes('MAX_JOB_ATTEMPTS');
    logResult(
      'Test 9b',
      'Retry/requeue machinery still present for execution failures (incl. timeout errors)',
      'read packages/agent/src/jobs/index.ts',
      'handleExecutionFailure + requeueJob + MAX_JOB_ATTEMPTS',
      t9b,
    );
    allOk &&= t9b;

    const health = await fetchJson(`${base}/debug/metrics`);
    logResult(
      'Test 9 follow-up',
      'Metrics still OK after timeout-config probe',
      'GET /debug/metrics',
      `ok=${health.res.ok}`,
      health.res.ok,
    );
    allOk &&= health.res.ok;
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
  return allOk;
}

function architectureCheck() {
  const p = path.join(ROOT, 'packages', 'agent', 'src', 'models', 'workload-model-runtime.ts');
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split('\n').length;
  const ok =
    lines < 320 &&
    raw.includes('runWithLocalWorkloadTimeout') &&
    raw.includes('prepareWorkloadModelAccessForTask') &&
    !raw.includes('setInterval');
  logResult(
    'Test 16',
    'Runtime module stays small; no interval scheduler',
    'read workload-model-runtime.ts structure',
    `~${lines} lines, has timeout+prepare, no setInterval`,
    ok,
  );
  return ok;
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  console.log('=== Step 19 focused verification ===\n');

  const results = [];
  results.push(runTypecheck());
  results.push(runStep19VerifyQuick());
  results.push(runSelftestScript());
  results.push(architectureCheck());

  results.push(await httpMainFlow());
  results.push(await httpIdleEviction());
  results.push(await httpTimeoutConfigAndPipelineWiring());

  results.push(runStep18Optional());

  const failed = results.some((x) => !x);
  const fails = report.filter((r) => !r.passed);
  console.log('\n=== Summary ===');
  console.log(`Checks logged: ${report.length}, failed: ${fails.length}`);
  if (fails.length) {
    for (const f of fails) {
      console.log(`  - ${f.id}: ${f.name}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('[step19-focused] fatal:', e);
  process.exit(1);
});
