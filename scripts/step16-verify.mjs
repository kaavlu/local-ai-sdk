/**
 * Step 16 — capability classification: HTTP integration + decision-path unit checks.
 * Starts a temporary agent on STEP16_AGENT_PORT (default 18799) unless STEP16_USE_RUNNING_AGENT=1
 * (then uses PORT or DYNO_AGENT_URL / http://127.0.0.1:8787).
 *
 * Run from repo root: node scripts/step16-verify.mjs
 * Requires: npm run build -w @dyno/agent
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'packages', 'agent', 'dist', 'index.js');

let failures = [];
function fail(msg) {
  failures.push(msg);
  console.error('[step16] FAIL: ' + msg);
}
function pass(msg) {
  console.log('[step16] PASS: ' + msg);
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

/** @param {string} base */
async function postMachineState(base, body) {
  const { res, body: out } = await fetchJson(`${base}/machine-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    fail(`POST /machine-state should succeed (got ${res.status})`);
    throw new Error('machine-state_post_failed');
  }
  return out;
}

function agentEnv(port) {
  const env = { ...process.env, PORT: String(port) };
  delete env.DYNO_READINESS_BYPASS;
  delete env.LOCAL_AI_READINESS_BYPASS;
  env.MOCK_CLOUD_AVAILABLE = 'true';
  return env;
}

async function runHttpSuite(base) {
  console.log('\n========== HTTP: /debug/capability & machine-state ==========\n');

  // Test 1 — shape
  {
    const what = 'GET /debug/capability?jobType=embed_text returns stable structured JSON';
    const { res, body } = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
    assert(res.ok && body.ok === true, `${what}: status/json.ok`);
    const c = body.capability;
    assert(c && typeof c === 'object', `${what}: capability object`);
    assert(c.jobType === 'embed_text', 'capability.jobType === embed_text');
    assert(c.canRunLocally === true, 'capability.canRunLocally === true');
    assert(c.requiresGpu === false, 'capability.requiresGpu === false');
    assert(c.preferredExecution === 'local', 'capability.preferredExecution === local');
    assert(Array.isArray(c.reasons), 'capability.reasons is array');
    assert(c.constraints && typeof c.constraints === 'object' && !Array.isArray(c.constraints), 'capability.constraints is object');
    const allowed = new Set(['jobType', 'canRunLocally', 'requiresGpu', 'preferredExecution', 'reasons', 'constraints']);
    const extra = Object.keys(c).filter((k) => !allowed.has(k));
    assert(extra.length === 0, `capability has no extra keys (got ${extra.join(',')})`);
  }

  // Test 2 — missing jobType
  {
    const { res, body } = await fetchJson(`${base}/debug/capability`);
    assert(res.status === 400, 'missing jobType returns HTTP 400');
    assert(body && body.ok === false, 'missing jobType: body.ok === false');
    assert(body && body.error === 'missing_jobType', 'missing jobType: structured error code');
  }

  // Test 3 — capability vs readiness separation (healthy state)
  await postMachineState(base, {
    isSystemIdle: true,
    isOnAcPower: true,
    idleSeconds: 300,
    cpuUtilizationPercent: 12,
    memoryAvailableMb: 12000,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  const capHealthy = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
  const readHealthy = await fetchJson(`${base}/debug/readiness`);
  assert(capHealthy.body.capability.canRunLocally === true, 'Test 3: embed_text capable under healthy state');
  assert(readHealthy.body.readiness != null, 'Test 3: readiness payload present');
  // Stress machine; capability for embed_text should stay structurally the same (no new forbids)
  await postMachineState(base, {
    isSystemIdle: false,
    isOnAcPower: false,
    idleSeconds: 0,
    cpuUtilizationPercent: 99,
    memoryAvailableMb: 50,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  const capStressed = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
  const readStressed = await fetchJson(`${base}/debug/readiness`);
  assert(
    capStressed.body.capability.canRunLocally === true && capStressed.body.capability.requiresGpu === false,
    'Test 3: capability unchanged when readiness should worsen (still local-capable)',
  );
  const r1i = readHealthy.body.interactiveLocalReady;
  const r2i = readStressed.body.interactiveLocalReady;
  const m1 = readHealthy.body.readiness?.modes?.interactive?.isReady;
  const m2 = readStressed.body.readiness?.modes?.interactive?.isReady;
  assert(
    r1i !== r2i || m1 !== m2,
    'Test 3: readiness differs between healthy and stressed machine-state posts',
  );
  pass('Test 3: capability stays permissive for embed_text while readiness can differ');

  // Test 4 — very low memory reason only
  await postMachineState(base, {
    isSystemIdle: true,
    isOnAcPower: true,
    idleSeconds: 60,
    memoryAvailableMb: 64,
    cpuUtilizationPercent: 5,
    gpuMemoryFreeMb: 4000,
    thermalState: 'nominal',
  });
  {
    const { body } = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
    const c = body.capability;
    assert(c.canRunLocally === true, 'Test 4: low mem still canRunLocally');
    assert(c.reasons.includes('very_low_reported_memory_available'), 'Test 4: reason very_low_reported_memory_available');
    assert(c.requiresGpu === false && c.preferredExecution === 'local', 'Test 4: GPU/preferred unchanged');
  }

  // Test 5 — unknown job type
  {
    const { res, body } = await fetchJson(`${base}/debug/capability?jobType=unknown_test_job_type`);
    assert(res.ok && body.ok === true, 'Test 5: unknown jobType succeeds');
    const c = body.capability;
    assert(c.jobType === 'unknown_test_job_type', 'Test 5: jobType echoed');
    assert(c.canRunLocally === true && c.requiresGpu === false && c.preferredExecution === 'local', 'Test 5: permissive default');
  }

  // Restore healthier state for pipeline tests
  await postMachineState(base, {
    isSystemIdle: true,
    isOnAcPower: true,
    idleSeconds: 300,
    cpuUtilizationPercent: 10,
    memoryAvailableMb: 12000,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });

  // Test 6 — includePipeline
  {
    const { res, body } = await fetchJson(`${base}/debug/capability?jobType=embed_text&includePipeline=1`);
    assert(res.ok && body.capability && body.pipelinePreview, 'Test 6: includePipeline adds pipelinePreview');
    const p = body.pipelinePreview;
    assert(['run_local', 'run_cloud', 'queue'].includes(p.decision), `Test 6: decision valid (${p.decision})`);
    assert(typeof p.cloudAvailable === 'boolean', 'Test 6: cloudAvailable boolean');
    assert(p.readiness && typeof p.readiness.interactiveLocalReady === 'boolean', 'Test 6: readiness summary');
    assert(p.executionPolicy === 'cloud_allowed' && p.localMode === 'interactive', 'Test 6: defaults');
  }

  // Test 6b — invalid query when includePipeline
  {
    const { res } = await fetchJson(
      `${base}/debug/capability?jobType=embed_text&includePipeline=1&executionPolicy=not_a_policy`,
    );
    assert(res.status === 400, 'Test 6b: bad executionPolicy returns 400');
  }

  // Test 7 — policy × readiness via preview
  await postMachineState(base, {
    isSystemIdle: true,
    isOnAcPower: true,
    idleSeconds: 300,
    cpuUtilizationPercent: 10,
    memoryAvailableMb: 12000,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  const healthyPreview = async (policy, mode = 'interactive') => {
    const q = new URLSearchParams({
      jobType: 'embed_text',
      includePipeline: '1',
      executionPolicy: policy,
      localMode: mode,
    });
    const { body } = await fetchJson(`${base}/debug/capability?${q}`);
    return body.pipelinePreview;
  };
  {
    const p = await healthyPreview('local_only');
    assert(p.decision === 'run_local', 'Test 7 healthy: local_only → run_local');
  }
  {
    const p = await healthyPreview('cloud_allowed');
    assert(p.decision === 'run_local', 'Test 7 healthy: cloud_allowed + preferred local → run_local');
  }
  {
    const p = await healthyPreview('cloud_preferred');
    assert(p.decision === 'run_cloud', 'Test 7 healthy: cloud_preferred + cloud available → run_cloud');
  }

  await postMachineState(base, {
    isSystemIdle: false,
    isOnAcPower: false,
    idleSeconds: 0,
    cpuUtilizationPercent: 95,
    memoryAvailableMb: 100,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  {
    const p = await healthyPreview('local_only');
    assert(p.decision === 'queue', 'Test 7 blocked: local_only → queue');
  }
  {
    const p = await healthyPreview('cloud_allowed');
    assert(p.decision === 'run_cloud', 'Test 7 blocked: cloud_allowed → run_cloud');
  }
  {
    const p = await healthyPreview('cloud_preferred');
    assert(p.decision === 'run_cloud', 'Test 7 blocked: cloud_preferred → run_cloud');
  }

  // Test 13 — readiness responds to state; capability stable for embed_text
  await postMachineState(base, {
    isSystemIdle: true,
    isOnAcPower: true,
    idleSeconds: 300,
    memoryAvailableMb: 12000,
    cpuUtilizationPercent: 10,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  const rOk = await fetchJson(`${base}/debug/readiness`);
  await postMachineState(base, {
    isSystemIdle: false,
    isOnAcPower: false,
    idleSeconds: 0,
    memoryAvailableMb: 12000,
    cpuUtilizationPercent: 10,
    gpuMemoryFreeMb: 8000,
    thermalState: 'nominal',
  });
  const rBad = await fetchJson(`${base}/debug/readiness`);
  const capAgain = await fetchJson(`${base}/debug/capability?jobType=embed_text`);
  assert(
    capAgain.body.capability.canRunLocally === true,
    'Test 13: embed_text capability still allows local after readiness-affecting POST',
  );
  assert(
    rOk.body.interactiveLocalReady !== rBad.body.interactiveLocalReady ||
      rOk.body.readiness?.modes?.interactive?.blockingReasons?.length !==
        rBad.body.readiness?.modes?.interactive?.blockingReasons?.length,
    'Test 13: readiness differs between healthy and ac/idle-stress states',
  );
}

async function runDecisionUnitTests() {
  console.log('\n========== Unit: resolveExecutionDecision (dist imports) ==========\n');

  const policyUrl = pathToFileURL(path.join(ROOT, 'packages', 'agent', 'dist', 'policy', 'index.js')).href;
  const readinessUrl = pathToFileURL(path.join(ROOT, 'packages', 'agent', 'dist', 'worker', 'readiness.js')).href;

  const { resolveExecutionDecision } = await import(policyUrl);
  const { evaluateMachineReadiness } = await import(readinessUrl);

  const baseMs = {
    id: 1,
    is_system_idle: 1,
    idle_seconds: 300,
    is_on_ac_power: 1,
    updated_at: Date.now(),
    cpu_utilization_percent: 10,
    memory_available_mb: 12000,
    memory_used_percent: 40,
    gpu_utilization_percent: 10,
    gpu_memory_free_mb: 4000,
    gpu_memory_used_mb: 500,
    battery_percent: 90,
    thermal_state: 'nominal',
  };

  const ready = evaluateMachineReadiness(baseMs, null);
  const blockedMs = {
    ...baseMs,
    is_system_idle: 0,
    is_on_ac_power: 0,
    idle_seconds: 0,
    cpu_utilization_percent: 95,
    memory_available_mb: 200,
  };
  const blocked = evaluateMachineReadiness(blockedMs, null);

  const capLocal = {
    jobType: 'embed_text',
    canRunLocally: true,
    requiresGpu: false,
    preferredExecution: 'local',
    reasons: [],
  };
  const capForbidden = {
    jobType: 'future',
    canRunLocally: false,
    requiresGpu: false,
    preferredExecution: 'local',
    reasons: ['not_on_device'],
  };
  const capPreferCloud = {
    jobType: 'x',
    canRunLocally: true,
    requiresGpu: false,
    preferredExecution: 'cloud',
    reasons: [],
  };

  // Test 8 — canRunLocally false
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_allowed',
      localMode: 'interactive',
      capability: capForbidden,
      machineReadiness: ready,
      cloudAvailable: true,
    }) === 'run_cloud',
    'Test 8: forbid local + cloud_allowed + cloud → run_cloud',
  );
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_allowed',
      localMode: 'interactive',
      capability: capForbidden,
      machineReadiness: ready,
      cloudAvailable: false,
    }) === 'queue',
    'Test 8: forbid local + cloud down → queue',
  );
  assert(
    resolveExecutionDecision({
      executionPolicy: 'local_only',
      localMode: 'interactive',
      capability: capForbidden,
      machineReadiness: ready,
      cloudAvailable: true,
    }) === 'queue',
    'Test 8: forbid local + local_only → queue',
  );

  // Test 9 — requiresGpu, missing signal
  const msNoGpuSignal = { ...baseMs, gpu_memory_free_mb: null, gpu_memory_used_mb: null };
  const readinessNoGpu = evaluateMachineReadiness(msNoGpuSignal, null);
  const capGpu = {
    jobType: 'gpu_job',
    canRunLocally: true,
    requiresGpu: true,
    preferredExecution: 'local',
    reasons: [],
  };
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_allowed',
      localMode: 'interactive',
      capability: capGpu,
      machineReadiness: readinessNoGpu,
      cloudAvailable: true,
    }) === 'run_cloud',
    'Test 9: requiresGpu + null gpuMemoryFreeMb → run_cloud when cloud allowed',
  );
  assert(
    resolveExecutionDecision({
      executionPolicy: 'local_only',
      localMode: 'interactive',
      capability: capGpu,
      machineReadiness: readinessNoGpu,
      cloudAvailable: true,
    }) === 'queue',
    'Test 9: requiresGpu + no signal + local_only → queue',
  );

  // Test 10 — insufficient VRAM vs constraint
  const msLowVram = { ...baseMs, gpu_memory_free_mb: 100 };
  const readinessLowVram = evaluateMachineReadiness(msLowVram, null);
  const capGpu512 = {
    jobType: 'gpu_job',
    canRunLocally: true,
    requiresGpu: true,
    preferredExecution: 'local',
    reasons: [],
    constraints: { minGpuMemoryMb: 512 },
  };
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_allowed',
      localMode: 'interactive',
      capability: capGpu512,
      machineReadiness: readinessLowVram,
      cloudAvailable: true,
    }) === 'run_cloud',
    'Test 10: requiresGpu + free VRAM below minGpuMemoryMb → run_cloud',
  );

  // Test 11 — preferredExecution cloud
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_allowed',
      localMode: 'interactive',
      capability: capPreferCloud,
      machineReadiness: ready,
      cloudAvailable: true,
    }) === 'run_cloud',
    'Test 11: preferred cloud + cloud_allowed + ready + cloud → run_cloud',
  );
  assert(
    resolveExecutionDecision({
      executionPolicy: 'local_only',
      localMode: 'interactive',
      capability: capPreferCloud,
      machineReadiness: ready,
      cloudAvailable: true,
    }) === 'run_local',
    'Test 11: preferred cloud + local_only → run_local (policy authority)',
  );
  assert(
    resolveExecutionDecision({
      executionPolicy: 'cloud_preferred',
      localMode: 'interactive',
      capability: capPreferCloud,
      machineReadiness: ready,
      cloudAvailable: true,
    }) === 'run_cloud',
    'Test 11: preferred cloud + cloud_preferred → run_cloud',
  );

  // Test 15 — matrix (documented)
  console.log('\n--- Decision matrix (synthetic) ---');
  const rows = [
    {
      name: 'allow+ready+local_only',
      d: resolveExecutionDecision({
        executionPolicy: 'local_only',
        localMode: 'interactive',
        capability: capLocal,
        machineReadiness: ready,
        cloudAvailable: true,
      }),
      expect: 'run_local',
    },
    {
      name: 'allow+blocked+cloud_allowed',
      d: resolveExecutionDecision({
        executionPolicy: 'cloud_allowed',
        localMode: 'interactive',
        capability: capLocal,
        machineReadiness: blocked,
        cloudAvailable: true,
      }),
      expect: 'run_cloud',
    },
    {
      name: 'forbid+cloud_allowed+cloud',
      d: resolveExecutionDecision({
        executionPolicy: 'cloud_allowed',
        localMode: 'interactive',
        capability: capForbidden,
        machineReadiness: ready,
        cloudAvailable: true,
      }),
      expect: 'run_cloud',
    },
    {
      name: 'forbid+local_only',
      d: resolveExecutionDecision({
        executionPolicy: 'local_only',
        localMode: 'interactive',
        capability: capForbidden,
        machineReadiness: ready,
        cloudAvailable: true,
      }),
      expect: 'queue',
    },
    {
      name: 'requiresGpu+no signal',
      d: resolveExecutionDecision({
        executionPolicy: 'cloud_allowed',
        localMode: 'interactive',
        capability: capGpu,
        machineReadiness: readinessNoGpu,
        cloudAvailable: true,
      }),
      expect: 'run_cloud',
    },
    {
      name: 'preferCloud+cloud_allowed',
      d: resolveExecutionDecision({
        executionPolicy: 'cloud_allowed',
        localMode: 'interactive',
        capability: capPreferCloud,
        machineReadiness: ready,
        cloudAvailable: true,
      }),
      expect: 'run_cloud',
    },
  ];
  for (const row of rows) {
    const ok = row.d === row.expect;
    console.log(`  ${ok ? 'OK' : 'XX'} ${row.name}: got ${row.d} (expect ${row.expect})`);
    assert(ok, `Matrix row "${row.name}": expected ${row.expect}, got ${row.d}`);
  }
}

async function runWorkerAndE2E(base, getAgentLog) {
  console.log('\n========== Worker log + tiny job ==========\n');

  await postMachineState(base, {
    isSystemIdle: false,
    isOnAcPower: false,
    idleSeconds: 0,
    cpuUtilizationPercent: 90,
    memoryAvailableMb: 500,
    gpuMemoryFreeMb: 4000,
    thermalState: 'nominal',
  });

  const jobA = await fetchJson(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      taskType: 'embed_text',
      payload: { text: 'hi' },
      executionPolicy: 'local_only',
      localMode: 'interactive',
    }),
  });
  assert(jobA.res.status === 201, 'Test 14: job A created');
  const jobB = await fetchJson(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      taskType: 'embed_text',
      payload: { text: 'yo' },
      executionPolicy: 'cloud_preferred',
      localMode: 'interactive',
    }),
  });
  assert(jobB.res.status === 201, 'Test 14: job B created');

  await sleep(2500);

  const logBuf = typeof getAgentLog === 'function' ? getAgentLog() : '';
  if (typeof getAgentLog === 'function') {
    const hasCapLog =
      /canRunLocally=(true|false)/.test(logBuf) &&
      /skip queued job \(decision=queue\)/.test(logBuf) &&
      /taskType=embed_text/.test(logBuf);
    assert(hasCapLog, 'Test 12: worker logs include canRunLocally and taskType on queued skip');
  } else {
    pass('Test 12: skipped (no agent log capture; re-run without STEP16_USE_RUNNING_AGENT for full check)');
  }

  const idB = jobB.body?.id;
  if (idB) {
    const st = await fetchJson(`${base}/jobs/${idB}`);
    assert(
      st.body.state === 'queued' || st.body.state === 'running' || st.body.state === 'completed',
      `Test 14: job B reachable state=${st.body.state}`,
    );
  }
  pass('Test 14: jobs accepted; worker exercised (no crash from capability path)');
}

async function main() {
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.error('[step16] Build agent first: npm run build -w @dyno/agent');
    process.exit(1);
  }

  const useRunning = process.env.STEP16_USE_RUNNING_AGENT === '1';
  const port = useRunning
    ? Number(process.env.PORT) || 8787
    : Number(process.env.STEP16_AGENT_PORT) || 18799;
  const base = useRunning
    ? process.env.DYNO_AGENT_URL?.replace(/\/+$/, '') || `http://127.0.0.1:${port}`
    : `http://127.0.0.1:${port}`;

  let child = null;
  let agentLog = '';
  if (!useRunning) {
    child = spawn(process.execPath, [AGENT_ENTRY], {
      env: agentEnv(port),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const appendLog = (chunk) => {
      agentLog += chunk.toString();
    };
    child.stdout?.on('data', appendLog);
    child.stderr?.on('data', appendLog);
    const okListen = await waitForAgent(base);
    if (!okListen) {
      fail('agent did not become healthy in time');
      child.kill('SIGTERM');
      process.exit(1);
    }
    pass(`agent listening on ${base}`);
  }

  try {
    await runHttpSuite(base);
    await runDecisionUnitTests();
    await runWorkerAndE2E(base, useRunning ? null : () => agentLog);
  } catch (e) {
    if (e && e.message === 'machine-state_post_failed') {
      /* already recorded */
    } else {
      throw e;
    }
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await sleep(300);
    }
  }

  if (failures.length) {
    console.error(`\n[step16] ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log('\n[step16] All Step 16 checks passed.\n');
}

main().catch((e) => {
  console.error('[step16] fatal:', e);
  process.exit(1);
});
