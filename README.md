# Local-first AI SDK (prototype)

Monorepo scaffolding for a local-first AI SDK: a TypeScript client library, a small Node HTTP “agent” service, and a minimal Electron demo app. Nothing here performs real AI work yet; the agent uses mock execution.

## Packages

| Location | Purpose |
|----------|---------|
| `packages/sdk-ts` | TypeScript SDK (`@local-ai/sdk-ts`). Thin HTTP client for the local agent: **`LocalAiSdk`** with typed methods (`healthCheck`, `createJob`, `getJob`, `getJobResult`, `reportMachineState`, `getMachineState`, `getDeviceProfile`, `getDbDebugInfo`, `waitForJobCompletion`). Default base URL **`http://127.0.0.1:8787`**; override via `new LocalAiSdk({ baseUrl: "..." })`. Built to `dist/` as a normal library. |
| `packages/agent` | Node + TypeScript service (`@local-ai/agent`). Listens on `127.0.0.1:${PORT}` (default `8787`). Serves `GET /health` with `{ "ok": true }`. On startup it creates/opens a local **SQLite** database (via **sql.js**, WASM) and runs idempotent schema DDL. After the DB is ready, it collects a **basic device profile** (OS + release, CPU arch, logical CPU count, total/free RAM in MiB, free disk space in MiB on the agent data volume when available) and upserts it into the `device_profile` table (`id = 1`). Inspect the stored row with `GET /debug/profile`. |
| `apps/demo-electron` | Minimal Electron app (`demo-electron`). Compiles TypeScript in `src/`, loads `index.html` at the app root, and uses **`@local-ai/sdk-ts` from the main process only** for agent I/O: periodic machine-state reporting (`LocalAiSdk.reportMachineState`), startup health check (`LocalAiSdk.healthCheck`), and a small **Create Demo Job** button (IPC → main → SDK job + wait + result). |

### SDK usage (Node / TypeScript)

```typescript
import { LocalAiSdk } from '@local-ai/sdk-ts';

const sdk = new LocalAiSdk(); // default http://127.0.0.1:8787

await sdk.healthCheck();

const job = await sdk.createJob({
  taskType: 'echo',
  payload: { text: 'hi' },
  policy: 'local',
});

const done = await sdk.waitForJobCompletion(job.id);
const result = done.state === 'completed' ? await sdk.getJobResult(job.id) : null;
```

## Prerequisites

- **Node.js** 18 or newer (LTS recommended).
- **npm** (ships with Node). npm **workspaces** are used at the repo root; the demo app depends on `@local-ai/sdk-ts` via the matching workspace version (`0.0.1`).

Electron downloads its own Chromium binary on first `npm install` (no separate browser install).

## Install dependencies

From the repository root:

```bash
cd local-ai-sdk
npm install
```

## Build the workspace

Compiles TypeScript in all packages that define a `build` script:

```bash
npm run build
```

Build the SDK alone (required before running the Electron app so `main` can load `dist/`):

```bash
npm run build -w @local-ai/sdk-ts
```

## Typecheck

```bash
npm run typecheck
```

## Run the agent (dev)

Compiles the agent, then starts the server (default port **8787**):

```bash
npm run dev:agent
```

Before starting, the dev script tries to **stop any process still listening on the agent port** (default `8787`), so a previous run that did not release the port (e.g. orphan `node.exe`) is less likely to block the next start. `npm start` in the agent package does not do this.

Override the port:

```bash
set PORT=9000&& npm run dev:agent
```

(On PowerShell: `$env:PORT=9000; npm run dev:agent`.)

Health check:

```bash
curl http://127.0.0.1:8787/health
```

### Agent database (dev)

- **Library:** [sql.js](https://github.com/sql-js/sql.js/) (SQLite compiled to WebAssembly). It avoids native addons so `npm install` works without Visual Studio / `node-gyp` on Windows; the schema and SQL are the same as with a native driver.
- **File location (default):** `packages/agent/.local-agent-data/agent.sqlite` (directory is created on first run). Override the directory with env **`LOCAL_AGENT_DATA_DIR`** (absolute path, or resolved from the process cwd).
- **Inspect:** `GET http://127.0.0.1:8787/debug/db` returns JSON: DB path, table names, row counts for `jobs` / `results`, `schema_version` from `agent_state` (currently `2` after Step 7 bootstrap), whether a `device_profile` row exists (`device_profile_row`), and whether a `machine_state` row exists (`machine_state_row`).
- **Device profile:** On each startup the agent records one row (`id = 1`) with `os`, `arch`, `cpu_count`, `ram_total_mb`, `ram_free_mb`, `disk_free_mb`, and `updated_at` (ms epoch). **View it:** `GET http://127.0.0.1:8787/debug/profile` returns that row as JSON. Free disk space uses Node’s `fs.statfsSync` on the agent data directory when the API exists; if probing fails, `disk_free_mb` is `-1`.
- **Jobs (Step 4 + Step 5 + Step 6):** The agent accepts job submissions over HTTP and stores rows in SQLite (`jobs` table). New jobs are created in state `queued`. The latest `device_profile` is used to route to **`local_mock`** or **`cloud_mock`** (prototype rule: if `ram_free_mb` is defined and below **4000** MiB → `cloud_mock`, else `local_mock`; threshold is `ROUTE_RAM_FREE_MB_THRESHOLD` in `packages/agent/src/router/index.ts`). Mock executors apply a short delay and write a row to **`results`** (`output_json`, `executor`, `completed_at`); on success the job ends in `completed`, on failure in `failed` with no result row. There is still no real AI inference or network calls.

### Step 6: Async worker

- Jobs are **processed asynchronously** by an in-process background worker (`packages/agent/src/worker/index.ts`). **`POST /jobs` returns immediately** with `state: "queued"`; the worker polls SQLite every ~300ms for queued jobs, claims one at a time (sets `running` before work), runs the same mock pipeline as Step 5, then persists `completed` / `failed` and **`results`** as before.
- State transitions over time: **`queued` → `running` → `completed`** (or **`failed`**). Poll **`GET /jobs/:id`** to observe updates; **`GET /jobs/:id/result`** returns `404` until a result row exists.

- **`POST /jobs`** — Body JSON: `{ "taskType": string, "payload": object, "policy": string }`. `taskType` and `policy` must be non-empty strings; `payload` must be present and JSON-serializable. Responds `201` with `{ id, state, taskType, policy, createdAt }` with **`state` initially `queued`** (execution happens in the background).
- **`GET /jobs/:id`** — Returns the job row with deserialized `payload`, or `404` with `{ "error": "job_not_found", "id": "..." }`.
- **`GET /jobs/:id/result`** — Returns `{ jobId, output, executor, completedAt }` when a result exists, or `404` with `{ "error": "result_not_found" }`.
- **Example (create a job):**

```bash
curl -s -X POST http://127.0.0.1:8787/jobs \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"echo\",\"payload\":{\"text\":\"hi\"},\"policy\":\"local\"}"
```

- **Reset:** Stop the agent, then delete the `.local-agent-data` folder (or only `agent.sqlite`) under `packages/agent`, or clear the directory pointed to by `LOCAL_AGENT_DATA_DIR`.

### Step 7: Machine state + worker scheduling gates

- **Reporting:** The Electron demo app sends machine signals to the agent about every **5 seconds** while it is open via **`LocalAiSdk.reportMachineState`** (same JSON shape: `{ "isSystemIdle", "idleSeconds", "isOnAcPower" }`). Values come from Electron **`powerMonitor`** in the **main** process (`getSystemIdleTime`, `getSystemIdleState`, `onBatteryPower`). Override the agent base URL with **`LOCAL_AGENT_URL`** if needed (passed into `new LocalAiSdk({ baseUrl: ... })`).

### Step 8: TypeScript SDK + demo integration

- **`packages/sdk-ts`** implements **`LocalAiSdk`**: HTTP-only, typed wrappers around the agent routes listed above (no worker/routing logic in the SDK).
- **`demo-electron`** uses the SDK in the **main process** for health, machine state, and the optional **Create Demo Job** flow (preload exposes `window.demoAgent.createDemoJob()` → IPC → `createJob` + `waitForJobCompletion` + `getJobResult`). The renderer stays free of SDK imports.
- **Storage:** The agent upserts a single row in **`machine_state`** (`id = 1`). Inspect with **`GET /debug/machine-state`** (returns `{ exists: false, ... }` until the first POST).
- **Worker rule (prototype):** The background worker **only** picks **queued** jobs when the latest row satisfies: `is_system_idle = 1`, `idle_seconds >= 10`, and `is_on_ac_power = 1`. If no row exists, the machine is treated as **ineligible** and jobs stay **queued**. The idle threshold is **`MIN_IDLE_SECONDS_FOR_BACKGROUND_WORK`** in `packages/agent/src/worker/eligibility.ts` (easy to change).
- **Logs:** The worker logs when eligibility flips between allowed and blocked (not every poll). The agent logs when stored machine state **changes** meaningfully (avoids spamming on identical 5s reports).

## Run the Electron demo (dev)

1. Start the agent in one terminal: `npm run dev:agent`
2. Build the SDK at least once: `npm run build -w @local-ai/sdk-ts`
3. Start the app:

```bash
npm run dev:app
```

After editing TypeScript, run `npm run dev:app` again (it runs `tsc` then `electron .`).

With the agent running, use **Create Demo Job** in the window to run a minimal echo job through the SDK (job may stay queued until machine-state eligibility is met: idle ≥ 10s, on AC — see Step 7).

## Scripts (root)

| Script | Description |
|--------|-------------|
| `npm run build` | `build` in all workspaces |
| `npm run typecheck` | `typecheck` in all workspaces |
| `npm run dev:agent` | Agent: compile + run |
| `npm run dev:app` | Demo: compile + Electron |

## Layout

```
local-ai-sdk/
  package.json
  tsconfig.base.json
  README.md
  packages/
    sdk-ts/
    agent/
  apps/
    demo-electron/
```
