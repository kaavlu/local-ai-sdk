/**
 * Step 17 — second real workload: classify_text (Transformers.js sentiment).
 * Starts a temporary agent on STEP17_AGENT_PORT (default 18798) unless STEP17_USE_RUNNING_AGENT=1.
 *
 * Run from repo root: node scripts/step17-verify.mjs
 * Requires: npm run build -w @dyno/agent
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'packages', 'agent', 'dist', 'index.js');

let failures = [];
function fail(msg) {
  failures.push(msg);
  console.error('[step17] FAIL: ' + msg);
}
function pass(msg) {
  console.log('[step17] PASS: ' + msg);
}
function assert(cond, msg) {
  if (!cond) {
    fail(msg);
  } else {
    pass(msg);
  }
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

async function waitForAgent(base, maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const { res, body } = await fetchJson(`${base}/health`);
      if (res.ok && body && body.ok === true) {
        return true;
      }
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  return false;
}

function agentEnv(port) {
  const env = { ...process.env, PORT: String(port), DYNO_READINESS_BYPASS: '1' };
  delete env.LOCAL_AI_READINESS_BYPASS;
  env.MOCK_CLOUD_AVAILABLE = 'true';
  return env;
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
    if (st === 'completed' || st === 'failed' || st === 'cancelled') {
      return body;
    }
    await sleep(400);
  }
  return null;
}

async function runSuite(base) {
  {
    const { res } = await fetchJson(`${base}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        taskType: 'classify_text',
        payload: { text: '' },
        executionPolicy: 'local_only',
        localMode: 'interactive',
      }),
    });
    assert(res.status === 400, 'empty text rejected at POST /jobs (400)');
  }

  {
    const what = 'GET /debug/capability?jobType=classify_text';
    const { res, body } = await fetchJson(`${base}/debug/capability?jobType=classify_text`);
    assert(res.ok && body.ok === true, `${what}: ok`);
    const c = body.capability;
    assert(c?.jobType === 'classify_text', 'capability.jobType classify_text');
    assert(c?.canRunLocally === true, 'classify_text canRunLocally');
    assert(c?.requiresGpu === false, 'classify_text requiresGpu false');
    assert(c?.preferredExecution === 'local', 'classify_text preferredExecution local');
    assert(Array.isArray(c?.reasons), 'classify_text reasons array');
  }

  {
    const { res, body } = await fetchJson(`${base}/debug/models`);
    assert(res.ok, 'GET /debug/models ok');
    assert(body?.embed_text?.state, 'debug/models has embed_text.state');
    assert(body?.classify_text?.state, 'debug/models has classify_text.state');
  }

  {
    const { res, body } = await fetchJson(`${base}/models/classify-text/warmup`, {
      method: 'POST',
    });
    assert(res.ok, 'POST classify-text warmup 200');
    assert(body?.classify_text?.state === 'ready', 'warmup leaves classify_text ready');
  }

  const create = await fetchJson(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      taskType: 'classify_text',
      payload: { text: 'I love this product' },
      executionPolicy: 'local_only',
      localMode: 'interactive',
    }),
  });
  assert(create.res.status === 201, 'classify_text job created');
  const jobId = create.body?.id;
  assert(typeof jobId === 'string', 'job id string');

  const job = await waitJobCompleted(base, jobId, 360_000);
  assert(job?.state === 'completed', 'classify_text job completed (or timeout)');

  const result = await fetchJson(`${base}/jobs/${encodeURIComponent(jobId)}/result`);
  assert(result.res.ok, 'GET result ok');
  const out = result.body?.output;
  assert(out && typeof out === 'object', 'result output object');
  assert(out.executor === 'local_real', 'executor local_real');
  assert(out.taskType === 'classify_text', 'output.taskType classify_text');
  assert(typeof out.label === 'string' && out.label.length > 0, 'output.label non-empty');
  assert(typeof out.score === 'number' && out.score > 0 && out.score <= 1, 'output.score in (0,1]');

  const metrics = await fetchJson(`${base}/debug/metrics`);
  assert(metrics.res.ok, 'GET /debug/metrics ok');
  const jt = metrics.body?.metrics?.jobTypes?.classify_text;
  assert(jt && typeof jt === 'object', 'metrics.jobTypes.classify_text present');
  assert((jt.completed ?? 0) >= 1, 'metrics.jobTypes.classify_text.completed >= 1');
  const cls = metrics.body?.metrics?.models?.classifyText;
  assert(cls?.modelId && cls?.state === 'ready', 'metrics.models.classifyText snapshot');
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('[step17] Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  const useRunning = process.env.STEP17_USE_RUNNING_AGENT === '1';
  const port = useRunning
    ? Number(process.env.PORT) || 8787
    : Number(process.env.STEP17_AGENT_PORT) || 18798;
  const base = useRunning
    ? process.env.DYNO_AGENT_URL?.replace(/\/+$/, '') || `http://127.0.0.1:${port}`
    : `http://127.0.0.1:${port}`;

  let child = null;
  if (!useRunning) {
    child = spawn(process.execPath, [AGENT_ENTRY], {
      env: agentEnv(port),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const okListen = await waitForAgent(base);
    if (!okListen) {
      fail('agent did not become healthy in time');
      child.kill('SIGTERM');
      process.exit(1);
    }
    pass(`agent listening on ${base} (readiness bypass on)`);
  }

  try {
    await runSuite(base);
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await sleep(300);
    }
  }

  if (failures.length) {
    console.error(`\n[step17] ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log('\n[step17] All Step 17 checks passed.\n');
}

main().catch((e) => {
  console.error('[step17] fatal:', e);
  process.exit(1);
});
