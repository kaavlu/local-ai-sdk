// Control plane API: project config resolution + telemetry ingestion; optional OpenAI-compatible `/v1/*` routes for sandbox/tooling (SDK + local runtime remain the default integration path — see repo AGENTS.md).
import { createServer } from './server.js';

const port = Number(process.env.DYNO_CONTROL_PLANE_PORT || process.env.PORT || '8788');
const host = process.env.DYNO_CONTROL_PLANE_HOST?.trim() || '127.0.0.1';

const server = createServer();

server.listen(port, host, () => {
  console.log(`[control-plane-api] listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[control-plane-api] server error:', error);
  process.exit(1);
});
