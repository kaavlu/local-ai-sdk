/**
 * Step 17 extended verification (HTTP + SDK). Spawns isolated agent(s) with temp data dirs.
 * Run: node scripts/step17-comprehensive-verify.mjs
 * Requires: npm run build -w @dyno/agent && npm run build -w @dyno/sdk-ts
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'packages', 'agent', 'dist', 'index.js');
const SDK_ENTRY = path.join(ROOT, 'packages', 'sdk-ts', 'dist', 'index.js');

const results = [];

function log(t, ok, detail) {
  const line = `[comp17] ${ok ? 'PASS' : 'FAIL'} — ${t}${detail ? ': ' + detail : ''}`;
  console.log(line);
  results.push({ t, ok, detail });
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

async function waitHealth(base, maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const { res, body } = await fetchJson(`${base}/health`);
      if (res.ok && body?.ok) return true;
    } catch {
      /* */
    }
    await sleep(150);
  }
  return false;
}

async function waitJobState(base, id, want, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { res, body } = await fetchJson(`${base}/jobs/${encodeURIComponent(id)}`);
    if (res.ok && body?.state && want.includes(body.state)) return body;
    await sleep(250);
  }
  return null;
}

function spawnAgent(port, dataDir, opts = {}) {
  const env = {
    ...process.env,
    PORT: String(port),
    DYNO_AGENT_DATA_DIR: dataDir,
    MOCK_CLOUD_AVAILABLE: 'true',
  };
  if (opts.readinessBypass) {
    env.DYNO_READINESS_BYPASS = '1';
  } else {
    delete env.DYNO_READINESS_BYPASS;
    delete env.LOCAL_AI_READINESS_BYPASS;
  }
  const child = spawn(process.execPath, [AGENT_ENTRY], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function killAgent(child) {
  if (!child) return;
  child.kill('SIGTERM');
  await sleep(400);
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }
  if (!fs.existsSync(SDK_ENTRY)) {
    console.error('Build SDK first: npm run build -w @dyno/sdk-ts');
    process.exit(1);
  }

  const dataA = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step17-a-'));
  const dataB = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step17-b-'));
  const portA = 18871;
  const portB = 18872;
  const baseA = `http://127.0.0.1:${portA}`;
  const baseB = `http://127.0.0.1:${portB}`;

  let childA = null;
  let childB = null;

  try {
    // ——— Agent A: main suite (readiness bypass, one classify warmup, minimal extra loads) ———
    childA = spawnAgent(portA, dataA, { readinessBypass: true });
    if (!(await waitHealth(baseA))) {
      log('Agent A health', false, 'timeout');
      process.exit(1);
    }
    log('Agent A online', true, baseA);

    // Test 2 — payload validation (classify + embed parity)
    const badCases = [
      {
        name: 'classify missing text key',
        body: { taskType: 'classify_text', payload: {}, executionPolicy: 'local_only', localMode: 'interactive' },
        want: 400,
      },
      {
        name: 'classify empty text',
        body: {
          taskType: 'classify_text',
          payload: { text: '' },
          executionPolicy: 'local_only',
          localMode: 'interactive',
        },
        want: 400,
      },
      {
        name: 'classify text number',
        body: {
          taskType: 'classify_text',
          payload: { text: 42 },
          executionPolicy: 'local_only',
          localMode: 'interactive',
        },
        want: 400,
      },
      {
        name: 'classify text object',
        body: {
          taskType: 'classify_text',
          payload: { text: { x: 1 } },
          executionPolicy: 'local_only',
          localMode: 'interactive',
        },
        want: 400,
      },
      {
        name: 'embed empty text (parity)',
        body: {
          taskType: 'embed_text',
          payload: { text: '' },
          executionPolicy: 'local_only',
          localMode: 'interactive',
        },
        want: 400,
      },
    ];
    for (const c of badCases) {
      const { res, body } = await fetchJson(`${baseA}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(c.body),
      });
      const ok = res.status === c.want && res.status !== 500;
      log(`Test2 invalid: ${c.name}`, ok, `status=${res.status} msg=${body?.message ?? ''}`);
    }

    const validCreate = await fetchJson(`${baseA}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        taskType: 'classify_text',
        payload: { text: 'ok' },
        executionPolicy: 'local_only',
        localMode: 'interactive',
      }),
    });
    {
      const j = validCreate.body;
      const ok =
        validCreate.res.status === 201 &&
        j?.state === 'queued' &&
        j?.taskType === 'classify_text';
      log('Test2 valid classify_text create', ok, `id=${j?.id}`);
    }
    const firstJobId = validCreate.body?.id;

    // Test 4 — models before warmup
    const modelsBefore = await fetchJson(`${baseA}/debug/models`);
    {
      const m = modelsBefore.body;
      const ok =
        modelsBefore.res.ok &&
        m?.embed_text?.state &&
        m?.classify_text?.state &&
        (m.classify_text.state === 'not_loaded' || m.classify_text.state === 'ready');
      log('Test4 /debug/models before warmup (shape + classify_text)', ok, JSON.stringify(m?.classify_text));
    }

    const warm = await fetchJson(`${baseA}/models/classify-text/warmup`, { method: 'POST' });
    {
      const ok = warm.res.ok && warm.body?.classify_text?.state === 'ready';
      log('Test4 warmup classify-text', ok, warm.body?.classify_text?.state);
    }

    const modelsAfterWarm = await fetchJson(`${baseA}/debug/models`);
    {
      const emb = modelsAfterWarm.body?.embed_text;
      const cls = modelsAfterWarm.body?.classify_text;
      const ok =
        modelsAfterWarm.res.ok &&
        cls?.state === 'ready' &&
        cls?.loadedAt != null &&
        emb?.state !== undefined;
      log('Test4 models after warmup (independent embed vs classify)', ok, `classify=${cls?.state} embed=${emb?.state}`);
    }

    // Test 3 — wait first job, result shape
    const done1 = await waitJobState(baseA, firstJobId, ['completed', 'failed'], 300_000);
    {
      const ok = done1?.state === 'completed';
      log('Test3 job lifecycle → completed', ok, done1?.state);
    }
    const res1 = await fetchJson(`${baseA}/jobs/${encodeURIComponent(firstJobId)}/result`);
    {
      const o = res1.body?.output;
      const forbidden = ['logits', 'all_scores', 'attentions'];
      const hasBlob =
        o &&
        forbidden.some((k) => Object.prototype.hasOwnProperty.call(o, k));
      const ok =
        res1.res.ok &&
        o?.taskType === 'classify_text' &&
        o?.executor === 'local_real' &&
        typeof o?.label === 'string' &&
        typeof o?.score === 'number' &&
        o.score >= 0 &&
        o.score <= 1 &&
        !hasBlob;
      log('Test3 result shape (minimal, score in [0,1])', ok, `label=${o?.label} score=${o?.score}`);
    }

    // Test 5 — second classify job, metrics
    const j2 = await fetchJson(`${baseA}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        taskType: 'classify_text',
        payload: { text: 'terrible waste of time' },
        executionPolicy: 'local_only',
        localMode: 'interactive',
      }),
    });
    await waitJobState(baseA, j2.body?.id, ['completed', 'failed'], 120_000);

    const met = await fetchJson(`${baseA}/debug/metrics`);
    {
      const jt = met.body?.metrics?.jobTypes?.classify_text;
      const emb = met.body?.metrics?.jobTypes?.embed_text;
      const ct = met.body?.metrics?.models?.classifyText;
      const et = met.body?.metrics?.models?.embedText;
      const ok =
        met.res.ok &&
        jt &&
        (jt.completed ?? 0) >= 2 &&
        ct?.modelId &&
        et?.modelId;
      log('Test5 metrics jobTypes + models.classifyText', ok, `classify_completed=${jt?.completed} embed_jobs=${emb?.total ?? 0}`);
    }

    // Test 6 — capability
    const cap = await fetchJson(`${baseA}/debug/capability?jobType=classify_text`);
    {
      const c = cap.body?.capability;
      const ok =
        cap.res.ok &&
        c?.canRunLocally === true &&
        c?.requiresGpu === false &&
        c?.preferredExecution === 'local';
      log('Test6 capability classify_text', ok, JSON.stringify(c));
    }
    const capEmb = await fetchJson(`${baseA}/debug/capability?jobType=embed_text`);
    {
      const c = capEmb.body?.capability;
      const ok =
        capEmb.res.ok &&
        c?.canRunLocally === true &&
        c?.requiresGpu === false &&
        c?.preferredExecution === 'local';
      log('Test6 capability embed_text (match behavior)', ok, '');
    }

    // Test 11 — multi-workload (one embed job)
    const je = await fetchJson(`${baseA}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        taskType: 'embed_text',
        payload: { text: 'multi workload check' },
        executionPolicy: 'local_only',
        localMode: 'interactive',
      }),
    });
    await waitJobState(baseA, je.body?.id, ['completed', 'failed'], 300_000);
    const met2 = await fetchJson(`${baseA}/debug/metrics`);
    {
      const e = met2.body?.metrics?.jobTypes?.embed_text;
      const c = met2.body?.metrics?.jobTypes?.classify_text;
      const modelsJson = await fetchJson(`${baseA}/debug/models`);
      const ok =
        (e?.completed ?? 0) >= 1 &&
        (c?.completed ?? 0) >= 2 &&
        modelsJson.body?.embed_text?.state &&
        modelsJson.body?.classify_text?.state;
      log('Test11 coexistence metrics + /debug/models', ok, `embed_done=${e?.completed} classify_done=${c?.completed}`);
    }

    // Test 9 — pause / cancel / resume
    await fetchJson(`${baseA}/worker/pause`, { method: 'POST' });
    const jq = await fetchJson(`${baseA}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        taskType: 'classify_text',
        payload: { text: 'paused queue' },
        executionPolicy: 'local_only',
        localMode: 'interactive',
      }),
    });
    const pauseId = jq.body?.id;
    await sleep(900);
    const whilePause = await fetchJson(`${baseA}/jobs/${encodeURIComponent(pauseId)}`);
    {
      const ok = whilePause.body?.state === 'queued';
      log('Test9 while paused job stays queued', ok, whilePause.body?.state);
    }
    const can = await fetchJson(`${baseA}/jobs/${encodeURIComponent(pauseId)}/cancel`, {
      method: 'POST',
    });
    {
      const ok = can.res.ok && can.body?.state === 'cancelled';
      log('Test9 cancel while queued', ok, can.body?.state);
    }
    await fetchJson(`${baseA}/worker/resume`, { method: 'POST' });
    await sleep(400);
    log('Test9 resume worker', true, 'no throw');

    // Test 12 — readiness payload
    const readi = await fetchJson(`${baseA}/debug/readiness`);
    {
      const ctm = readi.body?.classifyTextModel;
      const etm = readi.body?.embedTextModel;
      const ok =
        readi.res.ok &&
        ctm?.state &&
        etm?.state &&
        'loadedAt' in ctm &&
        'lastError' in ctm;
      log('Test12 /debug/readiness classifyTextModel', ok, ctm?.state);
    }

    // Test 10 — SDK
    const { DynoSdk } = await import(pathToFileURL(SDK_ENTRY).href);
    const sdk = new DynoSdk({ baseUrl: baseA });
    const w = await sdk.warmupClassifyTextModel();
    {
      const ok = w.state === 'ready';
      log('Test10 SDK warmupClassifyTextModel', ok, w.state);
    }
    const sdkJob = await sdk.createJob({
      taskType: 'classify_text',
      payload: { text: 'sdk path' },
      executionPolicy: 'local_only',
      localMode: 'interactive',
    });
    await sdk.waitForJobCompletion(sdkJob.id, { timeoutMs: 120_000, pollIntervalMs: 300 });
    const sdkRes = await sdk.getJobResult(sdkJob.id);
    {
      const o = sdkRes.output;
      const ok =
        typeof o === 'object' &&
        o &&
        o.taskType === 'classify_text' &&
        o.executor === 'local_real';
      log('Test10 SDK createJob + result', ok, '');
    }
  } finally {
    await killAgent(childA);
  }

  // ——— Agent B: readiness without bypass (no local model load if jobs queue or cloud) ———
  try {
    childB = spawnAgent(portB, dataB, { readinessBypass: false });
    if (!(await waitHealth(baseB))) {
      log('Agent B health', false, 'timeout');
    } else {
      log('Agent B online (no readiness bypass)', true, baseB);

      await fetchJson(`${baseB}/machine-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          isSystemIdle: false,
          isOnAcPower: false,
          idleSeconds: 0,
          cpuUtilizationPercent: 95,
          memoryAvailableMb: 200,
          gpuMemoryFreeMb: 4000,
          thermalState: 'nominal',
        }),
      });

      const qLocal = await fetchJson(`${baseB}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          taskType: 'classify_text',
          payload: { text: 'blocked local' },
          executionPolicy: 'local_only',
          localMode: 'interactive',
        }),
      });
      const qid = qLocal.body?.id;
      await sleep(2500);
      const stQ = await fetchJson(`${baseB}/jobs/${encodeURIComponent(qid)}`);
      {
        const ok = stQ.body?.state === 'queued';
        log('Test7 constrained + local_only stays queued', ok, stQ.body?.state);
      }

      const capB = await fetchJson(`${baseB}/debug/capability?jobType=classify_text`);
      {
        const c = capB.body?.capability;
        const ok = c?.canRunLocally === true && c?.preferredExecution === 'local';
        log('Test7 capability unchanged under stress', ok, '');
      }

      const qCloud = await fetchJson(`${baseB}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          taskType: 'classify_text',
          payload: { text: 'cloud path' },
          executionPolicy: 'cloud_allowed',
          localMode: 'interactive',
        }),
      });
      const cid = qCloud.body?.id;
      const doneC = await waitJobState(baseB, cid, ['completed', 'failed'], 60_000);
      const resC = await fetchJson(`${baseB}/jobs/${encodeURIComponent(cid)}/result`);
      {
        const o = resC.body?.output;
        const ok =
          doneC?.state === 'completed' &&
          resC.res.ok &&
          o?.executor === 'cloud_mock' &&
          o?.taskType === 'classify_text';
        log('Test7 cloud_allowed when local blocked → cloud_mock', ok, o?.executor);
      }
    }
  } finally {
    await killAgent(childB);
  }

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log('\n========== summary ==========');
  console.log(`PASS ${results.filter((r) => r.ok).length} / ${results.length}`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(' -', f.t, f.detail);
    process.exit(1);
  }
  console.log('All extended checks passed.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
