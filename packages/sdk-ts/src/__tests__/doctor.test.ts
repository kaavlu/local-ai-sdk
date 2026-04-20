import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { runDynoDoctor } from '../doctor.js';

async function getFreePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('unable to allocate free port');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startRuntimeServer(port: number, ready = true): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          runtime: {
            contractVersion: 'v1',
            capabilities: {
              readinessDebugV1: true,
            },
          },
        }),
      );
      return;
    }
    if (req.method === 'GET' && pathname === '/debug/readiness') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          interactiveLocalReady: ready,
          backgroundLocalReady: ready,
          conservativeLocalReady: ready,
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return server;
}

async function startResolverAuthFailureServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && pathname === '/api/v1/sdk/config') {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 'invalid_api_key' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return server;
}

async function startSlowFallbackServer(port: number, delayMs: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'POST' && pathname === '/embeddings') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }));
      }, delayMs);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return server;
}

test('returns explicit runtime_unreachable code when runtime cannot be reached', async () => {
  const port = await getFreePort();
  const report = await runDynoDoctor({
    runtimeBaseUrl: `http://127.0.0.1:${port}`,
    runtimeTimeoutMs: 250,
  });

  assert.equal(report.ok, false);
  assert.equal(report.runtime.ok, false);
  assert.equal(report.runtime.code, 'runtime_unreachable');
});

test('returns explicit resolver auth failure code', async () => {
  const runtimePort = await getFreePort();
  const resolverPort = await getFreePort();
  const runtimeServer = await startRuntimeServer(runtimePort, true);
  const resolverServer = await startResolverAuthFailureServer(resolverPort);

  try {
    const report = await runDynoDoctor({
      runtimeBaseUrl: `http://127.0.0.1:${runtimePort}`,
      resolver: {
        configResolverUrl: `http://127.0.0.1:${resolverPort}`,
        projectApiKey: 'invalid-key',
      },
    });

    assert.equal(report.ok, false);
    assert.equal(report.resolver.ok, false);
    assert.equal(report.resolver.code, 'invalid_project_api_key');
  } finally {
    await closeServer(runtimeServer);
    await closeServer(resolverServer);
  }
});

test('returns explicit fallback timeout code', async () => {
  const runtimePort = await getFreePort();
  const fallbackPort = await getFreePort();
  const runtimeServer = await startRuntimeServer(runtimePort, true);
  const fallbackServer = await startSlowFallbackServer(fallbackPort, 1_500);

  try {
    const report = await runDynoDoctor({
      runtimeBaseUrl: `http://127.0.0.1:${runtimePort}`,
      fallback: {
        baseUrl: `http://127.0.0.1:${fallbackPort}`,
        apiKey: 'test-key',
        timeoutMs: 100,
      },
    });

    assert.equal(report.ok, false);
    assert.equal(report.fallback.ok, false);
    assert.equal(report.fallback.code, 'fallback_timeout');
  } finally {
    await closeServer(runtimeServer);
    await closeServer(fallbackServer);
  }
});

test('passes runtime check when health and readiness are healthy', async () => {
  const runtimePort = await getFreePort();
  const runtimeServer = await startRuntimeServer(runtimePort, true);
  try {
    const report = await runDynoDoctor({
      runtimeBaseUrl: `http://127.0.0.1:${runtimePort}`,
      localMode: 'interactive',
    });

    assert.equal(report.runtime.ok, true);
    assert.equal(report.runtime.code, 'runtime_ready');
    assert.deepEqual(report.runtime.probeOrder, ['GET /health', 'GET /debug/readiness']);
  } finally {
    await closeServer(runtimeServer);
  }
});
