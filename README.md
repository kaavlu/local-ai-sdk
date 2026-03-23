# Local-first AI SDK (prototype)

Monorepo scaffolding for a local-first AI SDK: a TypeScript client library, a small Node HTTP “agent” service, and a minimal Electron demo app. Nothing here performs real AI work yet; APIs are placeholders.

## Packages

| Location | Purpose |
|----------|---------|
| `packages/sdk-ts` | TypeScript SDK (`@local-ai/sdk-ts`). Thin surface: `enqueueJob`, `getJobStatus`, `getJobResult` — currently throw `"Not implemented"`. Built to `dist/` as a normal library. |
| `packages/agent` | Node + TypeScript service (`@local-ai/agent`). Listens on `127.0.0.1:${PORT}` (default `8787`). Serves `GET /health` with `{ "ok": true }`. On startup it creates/opens a local **SQLite** database (via **sql.js**, WASM) and runs idempotent schema DDL. After the DB is ready, it collects a **basic device profile** (OS + release, CPU arch, logical CPU count, total/free RAM in MiB, free disk space in MiB on the agent data volume when available) and upserts it into the `device_profile` table (`id = 1`). Inspect the stored row with `GET /debug/profile`. |
| `apps/demo-electron` | Minimal Electron app (`demo-electron`). Compiles TypeScript in `src/`, loads `index.html` at the app root, and imports `@local-ai/sdk-ts` from the **main** process to verify workspace wiring. |

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
- **Inspect:** `GET http://127.0.0.1:8787/debug/db` returns JSON: DB path, table names, row counts for `jobs` / `results`, `schema_version` from `agent_state` (set to `1` on startup), and whether a `device_profile` row exists (`device_profile_row`).
- **Device profile:** On each startup the agent records one row (`id = 1`) with `os`, `arch`, `cpu_count`, `ram_total_mb`, `ram_free_mb`, `disk_free_mb`, and `updated_at` (ms epoch). **View it:** `GET http://127.0.0.1:8787/debug/profile` returns that row as JSON. Free disk space uses Node’s `fs.statfsSync` on the agent data directory when the API exists; if probing fails, `disk_free_mb` is `-1`.
- **Jobs (Step 4 + Step 5):** The agent accepts job submissions over HTTP and stores rows in SQLite (`jobs` table). New jobs are created in state `queued`, then **Step 5** runs an in-process mock pipeline before the HTTP response returns: the latest `device_profile` is used to route to **`local_mock`** or **`cloud_mock`** (prototype rule: if `ram_free_mb` is defined and below **4000** MiB → `cloud_mock`, else `local_mock`; threshold is `ROUTE_RAM_FREE_MB_THRESHOLD` in `packages/agent/src/router/index.ts`). Mock executors apply a short delay and write a row to **`results`** (`output_json`, `executor`, `completed_at`); on success the job ends in `completed`, on failure in `failed` with no result row. There is still no real AI inference or network calls.
  - **`POST /jobs`** — Body JSON: `{ "taskType": string, "payload": object, "policy": string }`. `taskType` and `policy` must be non-empty strings; `payload` must be present and JSON-serializable. Responds `201` with `{ id, state, taskType, policy, createdAt }` (after mock execution, `state` is typically `completed`).
  - **`GET /jobs/:id`** — Returns the job row with deserialized `payload`, or `404` with `{ "error": "job_not_found", "id": "..." }`.
  - **`GET /jobs/:id/result`** — Returns `{ jobId, output, executor, completedAt }` when a result exists, or `404` with `{ "error": "result_not_found" }`.
  - **Example (create a job):**

```bash
curl -s -X POST http://127.0.0.1:8787/jobs \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"echo\",\"payload\":{\"text\":\"hi\"},\"policy\":\"local\"}"
```

- **Reset:** Stop the agent, then delete the `.local-agent-data` folder (or only `agent.sqlite`) under `packages/agent`, or clear the directory pointed to by `LOCAL_AGENT_DATA_DIR`.

## Run the Electron demo (dev)

1. Build the SDK at least once: `npm run build -w @local-ai/sdk-ts`
2. Start the app:

```bash
npm run dev:app
```

After editing TypeScript, run `npm run dev:app` again (it runs `tsc` then `electron .`).

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
