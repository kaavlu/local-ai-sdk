// Dyno local runtime — HTTP service for on-device execution consumed by @dyno/sdk-ts (SDK-first; see repo AGENTS.md).
import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { getAgentDataDir, getDatabaseDebugInfo, initDatabase } from './db/index.js';
import {
  cancelJob,
  createJob,
  getJobById,
  getJobResult,
  jobCreatedResponse,
  jobResultToJson,
  jobToJson,
  recoverRunningJobsOnStartup,
  validateCreateJobRequest,
} from './jobs/index.js';
import { collectDeviceProfile, getLatestDeviceProfile, saveDeviceProfile } from './profiler/index.js';
import {
  getLatestMachineState,
  machineStateToDebugJson,
  maybeLogMachineStateUpdate,
  saveMachineState,
  validateMachineStatePostBody,
} from './machine-state/index.js';
import { getCloudAvailable } from './cloud-availability.js';
import { capabilityToDebugJson, evaluateJobCapability } from './capability/index.js';
import { resolveExecutionDecision, type ExecutionPolicy, type LocalMode } from './policy/index.js';
import { getWorkerRuntimeSnapshot, startWorker } from './worker/index.js';
import { getIsWorkerPaused, setWorkerPaused } from './worker/state.js';
import { getModelsDebugJson } from './models/models-debug.js';
import { prepareWorkloadModelAccessForTask } from './models/workload-model-runtime.js';
import {
  getReadinessModelFieldsFromWorkloads,
  listWarmupRoutes,
} from './workloads/registry.js';
import {
  getEffectiveMachineReadiness,
  isReadinessBypassActive,
  readinessToDebugJson,
} from './worker/readiness.js';
import { getDebugMetricsJson } from './metrics/index.js';

const PORT = Number(process.env.PORT) || 8787;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (raw.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw) as unknown);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function json(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseExecutionPolicyParam(raw: string | null): ExecutionPolicy | null {
  if (raw === 'local_only' || raw === 'cloud_allowed' || raw === 'cloud_preferred') {
    return raw;
  }
  return null;
}

function parseLocalModeParam(raw: string | null): LocalMode | null {
  if (raw === 'interactive' || raw === 'background' || raw === 'conservative') {
    return raw;
  }
  return null;
}

async function main(): Promise<void> {
  const { db, path: dbPath } = await initDatabase();

  recoverRunningJobsOnStartup(db, dbPath);

  const metrics = collectDeviceProfile({ diskPath: getAgentDataDir() });
  const profile = saveDeviceProfile(db, dbPath, metrics);
  console.log(
    '[agent] profiler: os=' +
      profile.os +
      ', arch=' +
      profile.arch +
      ', cpu_count=' +
      profile.cpu_count +
      ', ram_total_mb=' +
      profile.ram_total_mb +
      ', ram_free_mb=' +
      profile.ram_free_mb +
      ', disk_free_mb=' +
      profile.disk_free_mb,
  );

  if (isReadinessBypassActive()) {
    console.warn(
      '[agent] readiness bypass active: scheduling treats all local modes as ready (dev/testing only)',
    );
  }

  const stopWorker = startWorker(db, dbPath);

  console.log('[agent] phase=http: creating HTTP server');
  const server = http.createServer((req, res) => {
    const pathname = (req.url?.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/db') {
      const body = getDatabaseDebugInfo(db, dbPath);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/metrics') {
      const body = getDebugMetricsJson(db);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/profile') {
      const stored = getLatestDeviceProfile(db);
      if (!stored) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'device_profile row missing' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stored));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/machine-state') {
      const stored = getLatestMachineState(db);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(machineStateToDebugJson(stored)));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/models') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(getModelsDebugJson()));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/worker') {
      const paused = getIsWorkerPaused(db);
      const rt = getWorkerRuntimeSnapshot();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          isPaused: paused,
          jobInFlight: rt.jobInFlight,
          currentRunningJobId: rt.currentRunningJobId,
          pollIntervalMs: rt.pollIntervalMs,
        }),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/capability') {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const jobType = url.searchParams.get('jobType')?.trim();
      if (!jobType) {
        json(res, 400, {
          ok: false,
          error: 'missing_jobType',
          message: 'Query parameter jobType is required.',
        });
        return;
      }
      const ms = getLatestMachineState(db);
      const capability = evaluateJobCapability({
        jobType,
        payload: {},
        machineState: ms,
      });
      const body: Record<string, unknown> = {
        ok: true,
        capability: capabilityToDebugJson(capability),
      };
      if (url.searchParams.get('includePipeline') === '1') {
        const prof = getLatestDeviceProfile(db);
        const readiness = getEffectiveMachineReadiness(ms, prof);
        let executionPolicy: ExecutionPolicy = 'cloud_allowed';
        if (url.searchParams.has('executionPolicy')) {
          const p = parseExecutionPolicyParam(url.searchParams.get('executionPolicy'));
          if (p === null) {
            json(res, 400, {
              ok: false,
              error: 'invalid_executionPolicy',
              message: 'executionPolicy must be local_only, cloud_allowed, or cloud_preferred.',
            });
            return;
          }
          executionPolicy = p;
        }
        let localMode: LocalMode = 'interactive';
        if (url.searchParams.has('localMode')) {
          const m = parseLocalModeParam(url.searchParams.get('localMode'));
          if (m === null) {
            json(res, 400, {
              ok: false,
              error: 'invalid_localMode',
              message: 'localMode must be interactive, background, or conservative.',
            });
            return;
          }
          localMode = m;
        }
        const cloudAvailable = getCloudAvailable();
        const decision = resolveExecutionDecision({
          executionPolicy,
          localMode,
          capability,
          machineReadiness: readiness,
          cloudAvailable,
        });
        body.pipelinePreview = {
          executionPolicy,
          localMode,
          cloudAvailable,
          decision,
          readinessBypass: isReadinessBypassActive(),
          readiness: {
            interactiveLocalReady: readiness.interactiveLocalReady,
            backgroundLocalReady: readiness.backgroundLocalReady,
            conservativeLocalReady: readiness.conservativeLocalReady,
          },
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/readiness') {
      const ms = getLatestMachineState(db);
      const prof = getLatestDeviceProfile(db);
      const readiness = getEffectiveMachineReadiness(ms, prof);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ...readinessToDebugJson(readiness),
          readinessBypass: isReadinessBypassActive(),
          ...getReadinessModelFieldsFromWorkloads(),
        }),
      );
      return;
    }

    if (req.method === 'POST') {
      for (const ep of listWarmupRoutes()) {
        if (pathname !== ep.path) {
          continue;
        }
        void (async () => {
          try {
            prepareWorkloadModelAccessForTask(ep.taskType);
            await ep.warmup();
            const st = ep.getState();
            if (st.state === 'failed') {
              json(res, 503, {
                error: 'warmup_failed',
                message: st.lastError ?? ep.failureLabel,
                [ep.responseField]: st,
              });
              return;
            }
            json(res, 200, { [ep.responseField]: st });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[agent] ' + ep.logTag + ': warmup endpoint failed:', e);
            json(res, 500, { error: 'internal_error', message: msg });
          }
        })();
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/machine-state') {
      void (async () => {
        try {
          const body = await readJsonBody(req);
          const validated = validateMachineStatePostBody(body);
          if (!validated.ok) {
            json(res, 400, { error: 'validation_error', message: validated.message });
            return;
          }
          const prev = getLatestMachineState(db);
          const saved = saveMachineState(db, dbPath, validated.value);
          maybeLogMachineStateUpdate(prev, saved);
          json(res, 200, { ok: true, updatedAt: saved.updated_at });
        } catch (e) {
          if (e instanceof SyntaxError) {
            json(res, 400, { error: 'bad_request', message: 'invalid JSON body' });
            return;
          }
          console.error('[agent] machine-state: POST failed:', e);
          json(res, 500, { error: 'internal_error' });
        }
      })();
      return;
    }

    if (req.method === 'POST' && pathname === '/worker/pause') {
      setWorkerPaused(db, dbPath, true);
      json(res, 200, { ok: true, isPaused: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/worker/resume') {
      setWorkerPaused(db, dbPath, false);
      json(res, 200, { ok: true, isPaused: false });
      return;
    }

    const resultPath = /^\/jobs\/([^/]+)\/result$/.exec(pathname);
    if (req.method === 'GET' && resultPath) {
      const jobId = resultPath[1];
      const jobForResult = getJobById(db, jobId);
      if (!jobForResult) {
        json(res, 404, { error: 'job_not_found', id: jobId });
        return;
      }
      if (jobForResult.state === 'cancelled') {
        json(res, 409, {
          error: 'job_cancelled',
          message: 'Job was cancelled; no result is available.',
          id: jobId,
          state: 'cancelled',
        });
        return;
      }
      const row = getJobResult(db, jobId);
      if (!row) {
        console.log('[agent] job: result not found id=' + jobId);
        json(res, 404, { error: 'result_not_found' });
        return;
      }
      const out = row.output;
      if (
        out !== null &&
        typeof out === 'object' &&
        !Array.isArray(out) &&
        (out as Record<string, unknown>).taskType === 'embed_text'
      ) {
        const o = out as Record<string, unknown>;
        console.log(
          '[agent] job: result fetched id=' +
            jobId +
            ' embed_text dimensions=' +
            String(o.dimensions) +
            ' executor=' +
            row.executor +
            ' preview=' +
            JSON.stringify(o.embeddingPreview),
        );
      } else if (
        out !== null &&
        typeof out === 'object' &&
        !Array.isArray(out) &&
        (out as Record<string, unknown>).taskType === 'classify_text'
      ) {
        const o = out as Record<string, unknown>;
        console.log(
          '[agent] job: result fetched id=' +
            jobId +
            ' classify_text label=' +
            String(o.label) +
            ' score=' +
            String(o.score) +
            ' executor=' +
            row.executor,
        );
      } else {
        console.log('[agent] job: result fetched id=' + jobId);
      }
      json(res, 200, jobResultToJson(row));
      return;
    }

    const jobPath = /^\/jobs\/([^/]+)$/.exec(pathname);
    if (req.method === 'GET' && jobPath) {
      const jobId = jobPath[1];
      const job = getJobById(db, jobId);
      if (!job) {
        json(res, 404, { error: 'job_not_found', id: jobId });
        return;
      }
      console.log('[agent] job: fetched id=' + jobId);
      json(res, 200, jobToJson(job));
      return;
    }

    const cancelPath = /^\/jobs\/([^/]+)\/cancel$/.exec(pathname);
    if (req.method === 'POST' && cancelPath) {
      const jobId = cancelPath[1];
      const outcome = cancelJob(db, dbPath, jobId);
      if (!outcome) {
        json(res, 404, { error: 'job_not_found', id: jobId });
        return;
      }
      if (!outcome.ok) {
        json(res, 409, {
          error: 'running_job_cancel_not_supported',
          message: 'Cancellation of running jobs is not supported yet.',
          id: jobId,
          state: outcome.job.state,
        });
        return;
      }
      json(res, 200, {
        ok: true,
        id: outcome.job.id,
        state: outcome.job.state,
        outcome: outcome.outcome === 'cancelled' ? 'cancelled' : 'already_terminal',
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/jobs') {
      void (async () => {
        try {
          const body = await readJsonBody(req);
          const validated = validateCreateJobRequest(body);
          if (!validated.ok) {
            json(res, 400, { error: 'validation_error', message: validated.message });
            return;
          }
          const job = createJob(db, dbPath, validated.value);
          console.log('[agent] job: created id=' + job.id);

          json(res, 201, jobCreatedResponse(job));
        } catch (e) {
          if (e instanceof SyntaxError) {
            json(res, 400, { error: 'bad_request', message: 'invalid JSON body' });
            return;
          }
          console.error('[agent] job: POST /jobs failed:', e);
          json(res, 500, { error: 'internal_error' });
        }
      })();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  let shuttingDown = false;

  function shutdown(signal: string): void {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log('[agent] ' + signal + ' received, shutting down...');

    stopWorker();

    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }

    server.close((err) => {
      if (err) {
        console.error('[agent] server close error:', err);
      }
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(err ? 1 : 0);
    });

    setTimeout(() => {
      console.error('[agent] shutdown timed out, forcing exit');
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[agent] phase=http: FAILED (listen error):', err);
    if (err.code === 'EADDRINUSE') {
      console.error(
        '[agent] phase=http: port ' +
          PORT +
          ' is already in use. Another process (often a previous agent) is still bound to it.',
      );
      console.error(
        '[agent] phase=http: fix: stop that process, or set PORT. Windows: netstat -ano | findstr :' +
          PORT,
      );
    }
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });

  console.log('[agent] phase=http: binding to 127.0.0.1:' + PORT + ' (DB init finished before listen)');
  server.listen(PORT, '127.0.0.1', () => {
    const startupTime = new Date();
    const nodeEnv = process.env.NODE_ENV;
    console.log('[agent] phase=http: listening at http://127.0.0.1:' + PORT);
    console.log('[agent] ready: agent is ready to accept requests');
    console.log('[agent] startup: port=' + PORT);
    console.log('[agent] startup: pid=' + process.pid);
    console.log(
      '[agent] startup: environment=' + (nodeEnv !== undefined ? nodeEnv : '(NODE_ENV unset)'),
    );
    console.log('[agent] startup: time=' + startupTime.toISOString());
  });
}

main().catch((err) => {
  console.error('[agent] fatal: startup aborted (check phase=data or phase=db logs above):', err);
  process.exit(1);
});
