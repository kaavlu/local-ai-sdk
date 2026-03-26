# Local-first AI SDK (prototype)

Monorepo scaffolding for a local-first AI SDK: a TypeScript client library, a small Node HTTP “agent” service, and a minimal Electron demo app. Nothing here performs real AI work yet; the agent uses mock execution.

## Packages

| Location | Purpose |
|----------|---------|
| `packages/sdk-ts` | TypeScript SDK (`@local-ai/sdk-ts`). Thin HTTP client for the local agent: **`LocalAiSdk`** with typed methods (`healthCheck`, `createJob`, `getJob`, `getJobResult`, `reportMachineState`, `getMachineState`, `getDeviceProfile`, `getDbDebugInfo`, `waitForJobCompletion`). Job create accepts legacy **`policy`** or **`executionPolicy` + `localMode`** (Step 9). Default base URL **`http://127.0.0.1:8787`**; override via `new LocalAiSdk({ baseUrl: "..." })`. Built to `dist/` as a normal library. |
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
  executionPolicy: 'cloud_preferred',
  localMode: 'interactive',
});
// Legacy clients can still pass `policy: 'local'` | `'local_preferred'` | `'cloud'`.

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

## Developer workflow

Quick loop for local development and SDK checks:

| Goal | Command |
|------|---------|
| Start the agent (default port **8787**) | `npm run dev:agent` |
| Agent on port **9000** | `$env:PORT=9000; npm run dev:agent` (PowerShell) or `npm run dev:agent:9000` (fixed example port) |
| Start the Electron demo | `npm run dev:app` (build `@local-ai/sdk-ts` first so `dist/` exists — see below) |
| Agent + app together | `npm run dev:all` (uses **concurrently** to run both; two labeled streams in one terminal) |
| SDK smoke test (health + DB debug + machine state) | With the agent running: `npm run build -w @local-ai/sdk-ts` then `npm run test:sdk:smoke`. Optional: `LOCAL_AGENT_URL`, `PORT`, or `SMOKE_SKIP_MACHINE_STATE=1` |
| Clean build outputs | `npm run clean` — removes `dist/` under `apps/demo-electron`, `packages/sdk-ts`, and `packages/agent`, plus `*.tsbuildinfo` in those trees. **Does not** delete the SQLite DB |
| Reset agent DB (explicit) | Stop the agent, then `npm run reset:db` (same as `npm run reset:agent`) |

**First-time / after `clean`:** run `npm run build` (or at least `npm run build -w @local-ai/sdk-ts`) before `npm run dev:app` or `npm run test:sdk:smoke`.

**Stopping dev processes (best-effort):**

- **`npm run stop:agent`** — frees the agent port (default `8787`, or `PORT` if set) by terminating whatever is **listening** on that port (same helper the agent `dev` script uses). If another app is bound to that port, it may be stopped too.
- **`npm run stop:app`** — on Windows, ends `electron.exe` processes whose command line looks like this repo’s **demo-electron** (`demo-electron` in the command). Other Electron apps are not targeted. On Unix, similar filter via `pgrep`/`ps`. If the demo was started in a way that doesn’t include that string in the command line, this may not find it.
- **`npm run stop:all`** — runs `stop:app` then `stop:agent`.

There is **no PID file** and no guarantee of matching only “your” Node/Electron session; prefer **Ctrl+C** in the terminal where `dev:agent` / `dev:all` runs when possible.

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

(On PowerShell: `$env:PORT=9000; npm run dev:agent`, or the fixed example: `npm run dev:agent:9000`.)

Health check:

```bash
curl http://127.0.0.1:8787/health
```

### Agent database (dev)

- **Library:** [sql.js](https://github.com/sql-js/sql.js/) (SQLite compiled to WebAssembly). It avoids native addons so `npm install` works without Visual Studio / `node-gyp` on Windows; the schema and SQL are the same as with a native driver.
- **File location (default):** `packages/agent/.local-agent-data/agent.sqlite` (directory is created on first run). Override the directory with env **`LOCAL_AGENT_DATA_DIR`** (absolute path, or resolved from the process cwd).
- **Inspect:** `GET http://127.0.0.1:8787/debug/db` returns JSON: DB path, table names, row counts for `jobs` / `results`, `schema_version` from `agent_state` (currently **`3`** after Step 9: `jobs.execution_policy` / `jobs.local_mode`), whether a `device_profile` row exists (`device_profile_row`), and whether a `machine_state` row exists (`machine_state_row`).
- **Device profile:** On each startup the agent records one row (`id = 1`) with `os`, `arch`, `cpu_count`, `ram_total_mb`, `ram_free_mb`, `disk_free_mb`, and `updated_at` (ms epoch). **View it:** `GET http://127.0.0.1:8787/debug/profile` returns that row as JSON. Free disk space uses Node’s `fs.statfsSync` on the agent data directory when the API exists; if probing fails, `disk_free_mb` is `-1`.
- **Jobs (Step 4–6, Step 9 policy):** The agent accepts job submissions over HTTP and stores rows in SQLite (`jobs` table). New jobs are created in state `queued`. **Step 9** chooses **`local_mock`** vs **`cloud_mock`** using `executionPolicy`, `localMode`, machine readiness, and a stubbed cloud availability flag (not RAM-only routing). Mock executors apply a short delay and write a row to **`results`** (`output_json`, `executor`, `completed_at`); on success the job ends in `completed`, on failure in `failed` with no result row. There is still no real AI inference or network calls.

### Step 6: Async worker

- Jobs are **processed asynchronously** by an in-process background worker (`packages/agent/src/worker/index.ts`). **`POST /jobs` returns immediately** with `state: "queued"`; the worker polls SQLite every ~300ms for queued jobs, claims one at a time (sets `running` before work), runs the same mock pipeline as Step 5, then persists `completed` / `failed` and **`results`** as before.
- State transitions over time: **`queued` → `running` → `completed`** (or **`failed`**). Poll **`GET /jobs/:id`** to observe updates; **`GET /jobs/:id/result`** returns `404` until a result row exists.

- **`POST /jobs`** — Body: include **`taskType`** (non-empty string) and **`payload`** (JSON-serializable). Provide either legacy **`policy`** (`"local"` \| `"local_preferred"` \| `"cloud"`) or both **`executionPolicy`** and **`localMode`** (see Step 9 below). Responds `201` with **`state`** initially **`queued`**, plus **`policy`**, **`executionPolicy`**, **`localMode`**, **`taskType`**, **`createdAt`**.
- **`GET /jobs/:id`** — Returns the job row with deserialized `payload`, **`executionPolicy`**, **`localMode`**, and legacy **`policy`**, or `404` with `{ "error": "job_not_found", "id": "..." }`.
- **`GET /jobs/:id/result`** — Returns `{ jobId, output, executor, completedAt }` when a result exists, or `404` with `{ "error": "result_not_found" }`.
- **Example (legacy `policy`):**

```bash
curl -s -X POST http://127.0.0.1:8787/jobs \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"echo\",\"payload\":{\"text\":\"hi\"},\"policy\":\"local\"}"
```

- **Example (Step 9 `executionPolicy` + `localMode`):**

```bash
curl -s -X POST http://127.0.0.1:8787/jobs \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"echo\",\"payload\":{\"text\":\"hi\"},\"executionPolicy\":\"cloud_preferred\",\"localMode\":\"interactive\"}"
```

- **Reset:** Stop the agent, then delete the `.local-agent-data` folder (or only `agent.sqlite`) under `packages/agent`, or clear the directory pointed to by `LOCAL_AGENT_DATA_DIR`.

### Step 7: Machine state (inputs to readiness)

- **Reporting:** The Electron demo app sends machine signals to the agent about every **5 seconds** while it is open via **`LocalAiSdk.reportMachineState`** (same JSON shape: `{ "isSystemIdle", "idleSeconds", "isOnAcPower" }`). Values come from Electron **`powerMonitor`** in the **main** process (`getSystemIdleTime`, `getSystemIdleState`, `onBatteryPower`). Override the agent base URL with **`LOCAL_AGENT_URL`** if needed (passed into `new LocalAiSdk({ baseUrl: ... })`).
- **Storage:** The agent upserts a single row in **`machine_state`** (`id = 1`). Inspect with **`GET /debug/machine-state`** (returns `{ exists: false, ... }` until the first POST).

### Step 8: TypeScript SDK + demo integration

- **`packages/sdk-ts`** implements **`LocalAiSdk`**: HTTP-only, typed wrappers around the agent routes listed above (no worker/policy logic in the SDK).
- **`demo-electron`** uses the SDK in the **main process** for health, machine state, and the optional **Create Demo Job** flow (preload exposes `window.demoAgent.createDemoJob()` → IPC → `createJob` with legacy `policy: "local"` + `waitForJobCompletion` + `getJobResult`). The renderer stays free of SDK imports.
- **Logs:** The agent logs when stored machine state **changes** meaningfully (avoids spamming on identical 5s reports).

### Step 9: Execution policy, local mode, and readiness

**Concepts**

- **`executionPolicy`** — where the job *may* or *prefers* to run:
  - **`local_only`** — run locally if local readiness for the job’s `localMode` passes; otherwise stay **queued**.
  - **`cloud_allowed`** — prefer local when ready; else run **cloud** if available; else **queued**.
  - **`cloud_preferred`** — prefer **cloud** when available; else local when ready; else **queued**.

- **`localMode`** — how strict **local** readiness is:
  - **`interactive`** — relaxed (for user-triggered work).
  - **`background`** — stronger (idle + AC + RAM thresholds; see `packages/agent/src/worker/readiness.ts`).
  - **`conservative`** — strictest background bar.

Readiness uses **`machine_state`** (idle, `idleSeconds`, AC) and **`device_profile`** (`ram_free_mb`, `ram_total_mb`) only — not a single global idle gate. Inspect computed flags with **`GET /debug/readiness`** (`interactiveLocalReady`, `backgroundLocalReady`, `conservativeLocalReady`, `reasons`).

**Backward compatibility (legacy `policy` → new fields)**

| Legacy `policy`   | `executionPolicy` | `localMode`   |
|-------------------|-------------------|---------------|
| `local`           | `local_only`      | `interactive` |
| `local_preferred` | `cloud_allowed`   | `background`  |
| `cloud`           | `cloud_preferred` | `interactive` |

If the client sends **`executionPolicy`** and **`localMode`**, those win; the legacy **`policy`** column is still stored (synthesized when omitted).

**Cloud stub**

- Default **`MOCK_CLOUD_AVAILABLE`** is treated as **on** (cloud available). Set **`MOCK_CLOUD_AVAILABLE=false`** to force policy paths that depend on “cloud down” (e.g. `cloud_preferred` falls back to local when ready).

**Worker behavior**

- Loads queued jobs **oldest first**, evaluates policy for each, and runs the **first** job whose decision is **`run_local`** or **`run_cloud`** (avoids head-of-line blocking). Still **one job at a time** end-to-end.
- Logs when earlier queued jobs are **skipped** (`decision=queue`) because a later job is runnable; if **all** queued jobs resolve to **queue**, logs a **throttled** summary (not every 300ms spam). Silent when the queue is **empty**.

## Run the Electron demo (dev)

1. Start the agent in one terminal: `npm run dev:agent`
2. Build the SDK at least once: `npm run build -w @local-ai/sdk-ts`
3. Start the app:

```bash
npm run dev:app
```

After editing TypeScript, run `npm run dev:app` again (it runs `tsc` then `electron .`).

With the agent running, use **Create Demo Job** in the window to run a minimal echo job through the SDK (`policy: "local"` → `local_only` + `interactive`; may stay queued until interactive local readiness passes — see Step 9 and `GET /debug/readiness`).

## Scripts (root)

| Script | Description |
|--------|-------------|
| `npm run build` | `build` in all workspaces |
| `npm run typecheck` | `typecheck` in all workspaces |
| `npm run clean` | Remove `dist/` (and `*.tsbuildinfo`) under `demo-electron`, `sdk-ts`, and `agent` only |
| `npm run dev:agent` | Agent: compile + free port + run |
| `npm run dev:agent:9000` | Same with `PORT=9000` (example; use `PORT` env for other ports) |
| `npm run dev:app` | Demo: compile + Electron |
| `npm run dev:all` | Agent + demo via **concurrently** (one terminal, two processes) |
| `npm run test:sdk:smoke` | Node script: `LocalAiSdk` health + DB debug (+ machine state unless skipped) |
| `npm run stop:agent` | Best-effort: stop process(es) listening on agent `PORT` |
| `npm run stop:app` | Best-effort: stop demo Electron if command line matches `demo-electron` |
| `npm run stop:all` | `stop:app` then `stop:agent` |
| `npm run reset:db` / `npm run reset:agent` | Delete agent local data dir (SQLite); stop agent first |

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
