/**
 * Step 19 — workload model runtime (idle eviction hooks, lastUsedAt, pipeline timeout, debug).
 *
 * Run from repo root: node scripts/step19-verify.mjs
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
  console.error('[step19] FAIL: ' + msg);
}
function pass(msg) {
  console.log('[step19] PASS: ' + msg);
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

async function runSuite(base) {
  console.log('\n--- Step 19: /debug/models + readiness + metrics shapes ---\n');

  {
    const { res, body } = await fetchJson(`${base}/debug/models`);
    assert(res.ok, 'GET /debug/models ok');
    const rt = body?.workloadModelRuntime;
    assert(rt && typeof rt === 'object', 'workloadModelRuntime object');
    assert(typeof rt.idleEvictAfterMs === 'number' && rt.idleEvictAfterMs > 0, 'idleEvictAfterMs');
    assert(typeof rt.maxResidentWorkloadModels === 'number', 'maxResidentWorkloadModels');
    assert(typeof rt.defaultExecutionTimeoutMs === 'number' && rt.defaultExecutionTimeoutMs > 0, 'defaultExecutionTimeoutMs');
    assert(rt.perWorkloadExecutionTimeoutMs && typeof rt.perWorkloadExecutionTimeoutMs === 'object', 'perWorkloadExecutionTimeoutMs');
    assert('lastUsedAt' in (body?.embed_text || {}), 'embed_text.lastUsedAt key');
    assert('lastUsedAt' in (body?.classify_text || {}), 'classify_text.lastUsedAt key');
  }

  {
    const { res, body } = await fetchJson(`${base}/debug/readiness`);
    assert(res.ok, 'GET /debug/readiness ok');
    assert('lastUsedAt' in (body?.embedTextModel || {}), 'readiness embedTextModel.lastUsedAt');
    assert('lastUsedAt' in (body?.classifyTextModel || {}), 'readiness classifyTextModel.lastUsedAt');
  }

  console.log('\n--- Warmup + lastUsedAt populated ---\n');

  {
    const { res, body } = await fetchJson(`${base}/models/embed-text/warmup`, { method: 'POST' });
    assert(res.ok, 'POST embed warmup ok');
    assert(body?.embed_text?.state === 'ready', 'embed warmup ready');
    assert(typeof body?.embed_text?.lastUsedAt === 'number', 'warmup response embed_text.lastUsedAt number');
  }

  {
    const { res, body } = await fetchJson(`${base}/debug/models`);
    assert(res.ok, 'GET /debug/models after embed warmup');
    assert(body?.embed_text?.state === 'ready', 'models embed_text ready');
    assert(typeof body?.embed_text?.lastUsedAt === 'number', 'models embed_text.lastUsedAt');
  }

  console.log('\n--- Real job + metrics lastUsedAt ---\n');

  {
    const { res, body } = await postJob(base, 'embed_text', { text: 'step19 embed' });
    assert(res.status === 201, 'embed_text job created');
    const job = await waitJobCompleted(base, body?.id, 360_000);
    assert(job?.state === 'completed', 'embed_text job completed');
  }

  {
    const { res, body } = await fetchJson(`${base}/debug/metrics`);
    assert(res.ok, 'GET /debug/metrics ok');
    assert(typeof body?.metrics?.models?.embedText?.lastUsedAt === 'number', 'metrics.embedText.lastUsedAt');
  }
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('[step19] Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  const port = Number(process.env.STEP19_AGENT_PORT) || 18819;
  const base = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-step19-'));

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
    console.error(`\n[step19] ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log('\n[step19] All automated Step 19 checks passed.\n');
}

main().catch((e) => {
  console.error('[step19] fatal:', e);
  process.exit(1);
});
