const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { embedWithGemini } = require('../src/old-gemini-embeddings.cjs');
const { embedWithDyno } = require('../src/new-dyno-embeddings.cjs');
const { Dyno } = require('@dyno/sdk-ts');

function createServer(handler) {
  const server = http.createServer(handler);
  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to bind server'));
            return;
          }
          resolve({
            close: () =>
              new Promise((done) => {
                server.close(() => done());
              }),
            baseUrl: `http://127.0.0.1:${address.port}`,
          });
        });
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createMockGeminiServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/v1beta/models/gemini-embedding-001:embedContent') {
      const body = await readJsonBody(req);
      requests.push(body);
      const input = String(body?.contents || '');
      const base = Math.max(1, input.length % 7);
      const payload = {
        embedding: {
          values: [base, base + 1, base + 2],
        },
      };
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return {
    requests,
    async start() {
      return server.start();
    },
  };
}

function createMockDynoResolverServer() {
  const configCalls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/v1/sdk/config') {
      configCalls.push(req.headers);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          projectId: 'proj_demo',
          use_case_type: 'embeddings',
          strategy_preset: 'local_first',
          fallback_enabled: true,
          local_model: null,
          cloud_model: 'text-embedding-3-small',
          requires_charging: false,
          wifi_only: false,
          battery_min_percent: null,
          idle_min_seconds: null,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return {
    configCalls,
    async start() {
      return server.start();
    },
  };
}

function createMockRuntimeServer(readiness = { ready: true }) {
  const jobs = new Map();
  const jobCreates = [];
  let nextId = 1;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          runtime: {
            contractVersion: 'runtime-lifecycle-v1',
            capabilities: { readinessDebugV1: true },
          },
        }),
      );
      return;
    }
    if (req.method === 'GET' && url.pathname === '/debug/readiness') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          interactiveLocalReady: readiness.ready,
          backgroundLocalReady: readiness.ready,
          conservativeLocalReady: readiness.ready,
        }),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === '/jobs') {
      const body = await readJsonBody(req);
      const id = `job_${nextId++}`;
      jobCreates.push(body);
      jobs.set(id, {
        output: { embedding: [11, 22, 33] },
      });
      res.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          id,
          state: 'queued',
          taskType: body.taskType,
          policy: body.policy || 'local',
          executionPolicy: body.executionPolicy || 'cloud_allowed',
          localMode: body.localMode || 'interactive',
          createdAt: Date.now(),
          startedAt: null,
          finishedAt: null,
          attemptCount: 1,
          lastError: null,
        }),
      );
      return;
    }
    if (req.method === 'GET' && /^\/jobs\/[^/]+$/.test(url.pathname)) {
      const id = url.pathname.split('/')[2];
      if (!jobs.has(id)) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          id,
          taskType: 'embed_text',
          payload: {},
          policy: 'local',
          executionPolicy: 'cloud_allowed',
          localMode: 'interactive',
          state: 'completed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          startedAt: Date.now(),
          finishedAt: Date.now(),
          attemptCount: 1,
          lastError: null,
        }),
      );
      return;
    }
    if (req.method === 'GET' && /^\/jobs\/[^/]+\/result$/.test(url.pathname)) {
      const id = url.pathname.split('/')[2];
      const job = jobs.get(id);
      if (!job) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          jobId: id,
          output: job.output,
          executor: 'mock-local-runtime',
          completedAt: Date.now(),
        }),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === '/shutdown') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return {
    jobCreates,
    async start() {
      return server.start();
    },
  };
}

function createMockFallbackServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/embeddings') {
      const body = await readJsonBody(req);
      requests.push({
        body,
        headers: req.headers,
      });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          data: [{ embedding: [91, 92, 93] }],
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return {
    requests,
    async start() {
      return server.start();
    },
  };
}

test('old Gemini file works against Gemini-compatible embedding endpoint', async () => {
  const gemini = createMockGeminiServer();
  const geminiServer = await gemini.start();
  try {
    const vectors = await embedWithGemini(['legacy flow'], {
      apiKey: 'test-gemini-key',
      baseUrl: `${geminiServer.baseUrl}/v1beta`,
    });
    assert.equal(vectors.length, 1);
    assert.deepEqual(vectors[0], [4, 5, 6]);
    assert.equal(gemini.requests.length, 1);
  } finally {
    await geminiServer.close();
  }
});

test('new Dyno file runs local path with minimal init config', async () => {
  const runtime = createMockRuntimeServer({ ready: true });
  const resolver = createMockDynoResolverServer();
  const fallback = createMockFallbackServer();
  const runtimeServer = await runtime.start();
  const resolverServer = await resolver.start();
  const fallbackServer = await fallback.start();

  try {
    const result = await embedWithDyno(['hello dyno'], {
      projectApiKey: 'dyno-project-key',
      configResolverUrl: resolverServer.baseUrl,
      agentBaseUrl: runtimeServer.baseUrl,
      fallbackBaseUrl: fallbackServer.baseUrl,
      fallbackApiKey: 'fallback-key',
    });
    assert.equal(result.vectors.length, 1);
    assert.deepEqual(result.vectors[0], [11, 22, 33]);
    assert.equal(result.batch.successCount, 1);
    assert.equal(result.status.runtime.healthy, true);
    assert.equal(runtime.jobCreates.length, 1);
    assert.equal(fallback.requests.length, 0);
    assert.equal(resolver.configCalls.length, 1);
  } finally {
    await runtimeServer.close();
    await resolverServer.close();
    await fallbackServer.close();
  }
});

test('new Dyno file falls back to app-owned cloud provider when readiness is false', async () => {
  const runtime = createMockRuntimeServer({ ready: false });
  const resolver = createMockDynoResolverServer();
  const fallback = createMockFallbackServer();
  const runtimeServer = await runtime.start();
  const resolverServer = await resolver.start();
  const fallbackServer = await fallback.start();

  try {
    const result = await embedWithDyno(['fallback please'], {
      projectApiKey: 'dyno-project-key',
      configResolverUrl: resolverServer.baseUrl,
      agentBaseUrl: runtimeServer.baseUrl,
      fallbackBaseUrl: fallbackServer.baseUrl,
      fallbackApiKey: 'fallback-key',
    });
    assert.equal(result.vectors.length, 1);
    assert.deepEqual(result.vectors[0], [91, 92, 93]);
    assert.equal(result.batch.successCount, 1);
    assert.equal(runtime.jobCreates.length, 0);
    assert.equal(fallback.requests.length, 1);
    assert.equal(
      fallback.requests[0].headers.authorization,
      'Bearer fallback-key',
    );
  } finally {
    await runtimeServer.close();
    await resolverServer.close();
    await fallbackServer.close();
  }
});

test('Dyno.init status + shutdown are safe to call repeatedly', async () => {
  const runtime = createMockRuntimeServer({ ready: true });
  const resolver = createMockDynoResolverServer();
  const fallback = createMockFallbackServer();
  const runtimeServer = await runtime.start();
  const resolverServer = await resolver.start();
  const fallbackServer = await fallback.start();

  try {
    const dyno = await Dyno.init({
      projectApiKey: 'dyno-project-key',
      configResolverUrl: resolverServer.baseUrl,
      agentBaseUrl: runtimeServer.baseUrl,
      fallback: {
        baseUrl: fallbackServer.baseUrl,
        apiKey: 'fallback-key',
      },
    });
    const status = await dyno.getStatus();
    assert.equal(status.runtime.healthy, true);
    assert.equal(status.runtime.state === 'healthy' || status.runtime.state === 'ready', true);

    await dyno.shutdown('test_cleanup_1');
    await dyno.shutdown('test_cleanup_2');
  } finally {
    await runtimeServer.close();
    await resolverServer.close();
    await fallbackServer.close();
  }
});
