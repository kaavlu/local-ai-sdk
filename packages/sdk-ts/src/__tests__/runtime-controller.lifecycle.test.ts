import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDefaultRuntimeController } from '../host-adapters/default-runtime-controller.js';

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

async function startServer(
  port: number,
  handlers?: {
    healthStatus?: number;
    supportShutdown?: boolean;
  },
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(handlers?.healthStatus ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: handlers?.healthStatus === undefined || handlers.healthStatus < 400 }));
      return;
    }
    if (handlers?.supportShutdown && req.method === 'POST' && pathname === '/shutdown') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setImmediate(() => {
        server.close();
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return server;
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function createRuntimeHelperScript(): { helperPath: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dyno-runtime-helper-'));
  const helperPath = path.join(tempDir, 'helper.mjs');
  fs.writeFileSync(
    helperPath,
    `
import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const server = http.createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0];
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'POST' && pathname === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    setImmediate(() => {
      server.close(() => process.exit(0));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '127.0.0.1');
server.on('error', () => {
  process.exit(1);
});
`,
    'utf8',
  );
  return {
    helperPath,
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test('reuses existing healthy runtime without owning process', async () => {
  const port = await getFreePort();
  const server = await startServer(port, { healthStatus: 200, supportShutdown: false });
  const controller = createDefaultRuntimeController({
    agentBaseUrl: `http://127.0.0.1:${port}`,
    startupTimeoutMs: 1000,
    startupPollIntervalMs: 50,
  });

  try {
    await controller.ensureStarted();
    const status = controller.getStatus();
    assert.equal(status.state, 'healthy');
    assert.equal(status.runtimeSource, 'external');
    assert.equal(status.ownsProcess, false);
    assert.equal(controller.getAgentBaseUrl(), `http://127.0.0.1:${port}`);

    await controller.shutdown('test_shutdown');
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.ok, true);
  } finally {
    await closeServer(server);
  }
});

test('retries port candidates and starts sdk-owned runtime process', async () => {
  const firstPort = await getFreePort();
  const secondPort = await getFreePort();
  const blocker = await startServer(firstPort, { healthStatus: 503, supportShutdown: false });
  const { helperPath, cleanup } = createRuntimeHelperScript();
  const previousHelperPath = process.env.DYNO_RUNTIME_HELPER_PATH;
  process.env.DYNO_RUNTIME_HELPER_PATH = helperPath;

  const controller = createDefaultRuntimeController({
    candidateBaseUrls: [`http://127.0.0.1:${firstPort}`, `http://127.0.0.1:${secondPort}`],
    startupTimeoutMs: 3000,
    startupPollIntervalMs: 50,
  });

  try {
    await controller.ensureStarted();
    const status = controller.getStatus();
    assert.equal(status.state, 'healthy');
    assert.equal(status.ownsProcess, true);
    assert.equal(status.runtimeSource, 'development');
    assert.equal(controller.getAgentBaseUrl(), `http://127.0.0.1:${secondPort}`);
    const response = await fetch(`http://127.0.0.1:${secondPort}/health`);
    assert.equal(response.ok, true);

    await controller.shutdown('test_shutdown');
    const stopped = await fetch(`http://127.0.0.1:${secondPort}/health`).catch(() => null);
    assert.equal(stopped, null);
  } finally {
    await closeServer(blocker);
    if (previousHelperPath === undefined) {
      delete process.env.DYNO_RUNTIME_HELPER_PATH;
    } else {
      process.env.DYNO_RUNTIME_HELPER_PATH = previousHelperPath;
    }
    cleanup();
  }
});

test('throws runtime_unavailable when all candidate ports fail', async () => {
  const firstPort = await getFreePort();
  const secondPort = await getFreePort();
  const blockerOne = await startServer(firstPort, { healthStatus: 503, supportShutdown: false });
  const blockerTwo = await startServer(secondPort, { healthStatus: 503, supportShutdown: false });
  const { helperPath, cleanup } = createRuntimeHelperScript();
  const previousHelperPath = process.env.DYNO_RUNTIME_HELPER_PATH;
  process.env.DYNO_RUNTIME_HELPER_PATH = helperPath;

  const controller = createDefaultRuntimeController({
    candidateBaseUrls: [`http://127.0.0.1:${firstPort}`, `http://127.0.0.1:${secondPort}`],
    startupTimeoutMs: 1000,
    startupPollIntervalMs: 50,
  });

  try {
    await assert.rejects(() => controller.ensureStarted(), /runtime_unavailable/);
    const status = controller.getStatus();
    assert.equal(status.state, 'unavailable');
    assert.equal(status.ownsProcess, false);
    assert.equal(controller.getAgentBaseUrl(), `http://127.0.0.1:${firstPort}`);
  } finally {
    await closeServer(blockerOne);
    await closeServer(blockerTwo);
    if (previousHelperPath === undefined) {
      delete process.env.DYNO_RUNTIME_HELPER_PATH;
    } else {
      process.env.DYNO_RUNTIME_HELPER_PATH = previousHelperPath;
    }
    cleanup();
  }
});
