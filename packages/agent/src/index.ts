import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { getAgentDataDir, getDatabaseDebugInfo, initDatabase } from './db/index.js';
import {
  createJob,
  getJobById,
  getJobResult,
  jobCreatedResponse,
  jobResultToJson,
  jobToJson,
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
import { startWorker } from './worker/index.js';
import { evaluateMachineReadiness, readinessToDebugJson } from './worker/readiness.js';

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

async function main(): Promise<void> {
  const { db, path: dbPath } = await initDatabase();

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

    if (req.method === 'GET' && pathname === '/debug/readiness') {
      const ms = getLatestMachineState(db);
      const prof = getLatestDeviceProfile(db);
      const readiness = evaluateMachineReadiness(ms, prof);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(readinessToDebugJson(readiness)));
      return;
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

    const resultPath = /^\/jobs\/([^/]+)\/result$/.exec(pathname);
    if (req.method === 'GET' && resultPath) {
      const jobId = resultPath[1];
      const row = getJobResult(db, jobId);
      if (!row) {
        console.log('[agent] job: result not found id=' + jobId);
        json(res, 404, { error: 'result_not_found' });
        return;
      }
      console.log('[agent] job: result fetched id=' + jobId);
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
