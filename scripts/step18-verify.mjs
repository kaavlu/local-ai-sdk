/**
 * Step 18 — workload registry / abstraction verification.
 * Spawns an isolated agent (temp data dir) on STEP18_AGENT_PORT (default 18807).
 *
 * Run from repo root: node scripts/step18-verify.mjs
 * Requires: npm run build -w @dyno/agent
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'packages', 'agent', 'dist', 'index.js');

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error('[step18] FAIL: ' + msg);
}
function pass(msg) {
  console.log('[step18] PASS: ' + msg);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
  else pass(msg);
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
  return { res, body, text };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAgent(base, maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const { res, body } = await fetchJson(`${base}/health`);
      if (res.ok && body && body.ok === true) return true;
    } catch {
      /* */
    }
    await sleep(200);
  }
  return false;
}

async function waitJobCompleted(base, jobId, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { res, body } = await fetchJson(`${base}/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok || !body) {
      await sleep(300);
      continue;
    }
    const st = body.state;
    if (st === 'completed' || st === 'failed' || st === 'cancelled') return body;
    await sleep(400);
  }
  return null;
}

function agentEnv(port, dataDir) {
  return {
    ...process.env,
    PORT: String(port),
    DYNO_AGENT_DATA_DIR: dataDir,
    DYNO_READINESS_BYPASS: '1',
    MOCK_CLOUD_AVAILABLE: 'true',
  };
}

async function postJob(base, taskType, payload) {
  return fetchJson(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      taskType,
      payload,
      executionPolicy: 'local_only',
      localMode: 'interactive',
    }),
  });
}

async function runSuite(base) {
  console.log('\n--- Test 2 & 6: registry-backed POST /jobs validation (embed + classify) ---\n');

  for (const tt of ['embed_text', 'classify_text']) {
    {
      const { res } = await postJob(base, tt, { text: '' });
      assert(res.status === 400, `${tt}: empty text → 400`);
    }
    {
      const { res } = await postJob(base, tt, { text: '   ' });
      assert(res.status === 400, `${tt}: whitespace-only text → 400`);
    }
    {
      const { res } = await postJob(base, tt, { text: 42 });
      assert(res.status === 400, `${tt}: non-string text → 400`);
    }
    {
      const { res } = await postJob(base, tt, []);
      assert(res.status === 400, `${tt}: array payload → 400`);
    }
    {
      const { res } = await postJob(base, tt, {});
      assert(res.status === 400, `${tt}: missing text → 400`);
    }
    {
      const { res, body } = await postJob(base, tt, { text: 'ok' });
      assert(res.status === 201, `${tt}: valid minimal text → 201`);
      assert(typeof body?.id === 'string', `${tt}: job id returned`);
    }
  }

  console.log('\n--- Test 3: unknown task → local_mock (not REAL_WORKLOADS) ---\n');

  {
    const { res, body } = await postJob(base, 'step18_unknown_task', { note: 1 });
    assert(res.status === 201, 'unknown task job created');
    const id = body?.id;
    const job = await waitJobCompleted(base, id, 60_000);
    assert(job?.state === 'completed', 'unknown task completes');
    const r = await fetchJson(`${base}/jobs/${encodeURIComponent(id)}/result`);
    assert(r.res.ok, 'unknown task result fetch ok');
    const out = r.body?.output;
    assert(out?.executor === 'local_mock', 'unknown task executor local_mock');
    assert(out?.taskType === 'step18_unknown_task', 'unknown taskType echoed');
    assert(!('persistedOutput' in (out || {})), 'no internal persistedOutput leaked to client JSON');
  }

  console.log('\n--- Test 7–9 & 4–5: warmups, debug endpoints, real workload jobs ---\n');

  {
    const { res, body } = await fetchJson(`${base}/debug/models`);
    assert(res.ok, 'GET /debug/models ok');
    assert(body?.embed_text?.state != null, 'models.embed_text.state present');
    assert(body?.classify_text?.state != null, 'models.classify_text.state present');
  }

  {
    const { res, body } = await fetchJson(`${base}/debug/readiness`);
    assert(res.ok, 'GET /debug/readiness ok');
    assert(body?.embedTextModel && typeof body.embedTextModel === 'object', 'embedTextModel section');
    assert(body?.classifyTextModel && typeof body.classifyTextModel === 'object', 'classifyTextModel section');
    assert('state' in body.embedTextModel, 'embedTextModel.state');
    assert('state' in body.classifyTextModel, 'classifyTextModel.state');
  }

  for (const ep of [
    ['/models/embed-text/warmup', 'embed_text'],
    ['/models/classify-text/warmup', 'classify_text'],
  ]) {
    const { res, body } = await fetchJson(`${base}${ep[0]}`, { method: 'POST' });
    assert(res.ok, `POST ${ep[0]} → 200`);
    assert(body?.[ep[1]]?.state === 'ready', `warmup ${ep[1]} ready`);
  }

  let embedJobId;
  {
    const { res, body } = await postJob(base, 'embed_text', { text: 'step18 embed' });
    assert(res.status === 201, 'embed_text job created');
    embedJobId = body?.id;
    const job = await waitJobCompleted(base, embedJobId, 360_000);
    assert(job?.state === 'completed', 'embed_text completed');
    const r = await fetchJson(`${base}/jobs/${encodeURIComponent(embedJobId)}/result`);
    assert(r.res.ok, 'embed result ok');
    const out = r.body?.output;
    assert(out?.taskType === 'embed_text', 'embed output.taskType');
    assert(out?.executor === 'local_real', 'embed executor local_real');
    assert(typeof out?.dimensions === 'number' && out.dimensions > 0, 'embed dimensions');
    assert(Array.isArray(out?.embedding) && out.embedding.length === out.dimensions, 'embed embedding array');
    assert(!('persistedOutput' in (out || {})), 'embed: no persistedOutput leak');
  }

  let classifyJobId;
  {
    const { res, body } = await postJob(base, 'classify_text', { text: 'I love it' });
    assert(res.status === 201, 'classify_text job created');
    classifyJobId = body?.id;
    const job = await waitJobCompleted(base, classifyJobId, 360_000);
    assert(job?.state === 'completed', 'classify_text completed');
    const r = await fetchJson(`${base}/jobs/${encodeURIComponent(classifyJobId)}/result`);
    assert(r.res.ok, 'classify result ok');
    const out = r.body?.output;
    assert(out?.taskType === 'classify_text', 'classify output.taskType');
    assert(out?.executor === 'local_real', 'classify executor local_real');
    assert(typeof out?.label === 'string' && out.label.length > 0, 'classify label');
    assert(typeof out?.score === 'number', 'classify score');
    assert(!('persistedOutput' in (out || {})), 'classify: no persistedOutput leak');
  }

  console.log('\n--- Test 10: /debug/metrics after real jobs ---\n');

  {
    const { res, body } = await fetchJson(`${base}/debug/metrics`);
    assert(res.ok, 'GET /debug/metrics ok');
    const jte = body?.metrics?.jobTypes?.embed_text;
    const jtc = body?.metrics?.jobTypes?.classify_text;
    assert(jte && (jte.completed ?? 0) >= 1, 'metrics.jobTypes.embed_text.completed');
    assert(jtc && (jtc.completed ?? 0) >= 1, 'metrics.jobTypes.classify_text.completed');
    assert(body?.metrics?.models?.embedText?.state, 'metrics.models.embedText');
    assert(body?.metrics?.models?.classifyText?.state, 'metrics.models.classifyText');
  }

  console.log('\n--- Test 11: /debug/capability unchanged ---\n');

  for (const jt of ['embed_text', 'classify_text']) {
    const { res, body } = await fetchJson(`${base}/debug/capability?jobType=${encodeURIComponent(jt)}`);
    assert(res.ok && body?.ok === true, `capability ${jt} ok`);
    assert(body?.capability?.jobType === jt, `capability.jobType ${jt}`);
    assert(body?.capability?.canRunLocally === true, `${jt} canRunLocally`);
  }

  console.log('\n--- Test 12: pause / cancel / resume ---\n');

  {
    const p = await fetchJson(`${base}/worker/pause`, { method: 'POST' });
    assert(p.res.ok, 'worker pause ok');

    const e = await postJob(base, 'embed_text', { text: 'pause flow embed' });
    const c = await postJob(base, 'classify_text', { text: 'pause flow classify' });
    assert(e.res.status === 201 && c.res.status === 201, 'both jobs created while paused');

    await sleep(900);
    const je = await fetchJson(`${base}/jobs/${encodeURIComponent(e.body.id)}`);
    const jc = await fetchJson(`${base}/jobs/${encodeURIComponent(c.body.id)}`);
    assert(je.body?.state === 'queued', 'embed still queued while paused');
    assert(jc.body?.state === 'queued', 'classify still queued while paused');

    const cancel = await fetchJson(`${base}/jobs/${encodeURIComponent(c.body.id)}/cancel`, {
      method: 'POST',
    });
    assert(cancel.res.ok, 'cancel classify ok');
    assert(cancel.body?.state === 'cancelled' || cancel.body?.outcome, 'cancel response');

    const r = await fetchJson(`${base}/worker/resume`, { method: 'POST' });
    assert(r.res.ok, 'worker resume ok');

    const done = await waitJobCompleted(base, e.body.id, 360_000);
    assert(done?.state === 'completed', 'embed ran after resume');

    const jf = await fetchJson(`${base}/jobs/${encodeURIComponent(c.body.id)}`);
    assert(jf.body?.state === 'cancelled', 'classify remains cancelled');

    const rr = await fetchJson(`${base}/jobs/${encodeURIComponent(e.body.id)}/result`);
    assert(rr.res.ok && rr.body?.output?.executor === 'local_real', 'paused-then-run embed still local_real');
  }
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('[step18] Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  const port = Number(process.env.STEP18_AGENT_PORT) || 18807;
  const base = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step18-'));

  const child = spawn(process.execPath, [AGENT_ENTRY], {
    env: agentEnv(port, dataDir),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const okListen = await waitForAgent(base);
  if (!okListen) {
    fail('agent did not become healthy in time');
    child.kill('SIGTERM');
    process.exit(1);
  }
  pass(`agent ${base} (dataDir=${dataDir})`);

  try {
    await runSuite(base);
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }

  if (failures.length) {
    console.error(`\n[step18] ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log('\n[step18] All automated Step 18 checks passed.\n');
}

main().catch((e) => {
  console.error('[step18] fatal:', e);
  process.exit(1);
});
