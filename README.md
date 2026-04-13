# Dyno (local-first AI SDK)

Monorepo for **Dyno**: a TypeScript client (`@dyno/sdk-ts`), a small Node HTTP agent (`@dyno/agent`), and a minimal Electron demo. **Step 10** adds one real local workload (`embed_text` via `@huggingface/transformers`); **Step 11** adds explicit in-process lifecycle and warmup for that model; **Step 12** adds job attempt tracking, last-error fields, startup recovery for stale `running` jobs, and simple capped retries. Other task types and cloud paths still use mock execution.
</think>

Run build and typecheck.

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
Shell

## Packages

| Location | Purpose |
|----------|---------|
| `packages/sdk-ts` | TypeScript SDK (`@dyno/sdk-ts`). Thin HTTP client for the Dyno agent: **`DynoSdk`** with typed methods (`healthCheck`, `createJob`, `getJob`, `getJobResult`, `reportMachineState`, `getMachineState`, `getDeviceProfile`, `getDbDebugInfo`, `getModelDebugInfo`, `warmupEmbedTextModel`, `waitForJobCompletion`). Job create accepts legacy **`policy`** or **`executionPolicy` + `localMode`** (Step 9). Default base URL **`http://127.0.0.1:8787`**; override via `new DynoSdk({ baseUrl: "..." })`. Built to `dist/` as a normal library. |
| `packages/agent` | Node + TypeScript service (`@dyno/agent`). Listens on `127.0.0.1:${PORT}` (default `8787`). Serves `GET /health` with `{ "ok": true }`. On startup it creates/opens a local **SQLite** database (via **sql.js**, WASM) and runs idempotent schema DDL. After the DB is ready, it collects a **basic device profile** (OS + release, CPU arch, logical CPU count, total/free RAM in MiB, free disk space in MiB on the agent data volume when available) and upserts it into the `device_profile` table (`id = 1`). Inspect the stored row with `GET /debug/profile`. **Step 10:** `taskType: "embed_text"` with a local policy decision runs a real embedding (`Xenova/all-MiniLM-L6-v2`); other local tasks remain mock. **Step 11:** in-process **`embed_text`** model lifecycle (`not_loaded` / `loading` / `ready` / `failed`), `GET /debug/models`, `POST /models/embed-text/warmup`. |
| `apps/demo-electron` | Minimal Electron app (`demo-electron`). Compiles TypeScript in `src/`, loads `index.html` at the app root, and uses **`@dyno/sdk-ts` from the main process only** for agent I/O: periodic machine-state reporting (`DynoSdk.reportMachineState`), startup health check (`DynoSdk.healthCheck`), **Create Demo Job** (echo / mock local), **Create Embedding Job** (`embed_text` + `local_only` + `interactive`), and **Warm Up Embedding Model** (Step 11). |

### SDK usage (Node / TypeScript)

```typescript
import { DynoSdk } from '@dyno/sdk-ts';

const sdk = new DynoSdk(); // default http://127.0.0.1:8787

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
- **npm** (ships with Node). npm **workspaces** are used at the repo root; the demo app depends on `@dyno/sdk-ts` via the matching workspace version (`0.0.1`).

Electron downloads its own Chromium binary on first `npm install` (no separate browser install).

## Install dependencies

From the repository root:

```bash
cd path/to/this-repository
npm install
```

## Developer workflow

Quick loop for local development and SDK checks:

| Goal | Command |
|------|---------|
| Start the agent (default port **8787**) | `npm run dev:agent` |
| Agent on port **9000** | `$env:PORT=9000; npm run dev:agent` (PowerShell) or `npm run dev:agent:9000` (fixed example port) |
| Start the Electron demo | `npm run dev:app` (build `@dyno/sdk-ts` first so `dist/` exists — see below) |
| Agent + app together | `npm run dev:all` (uses **concurrently** to run both; two labeled streams in one terminal) |
| SDK smoke test (health + DB debug + machine state) | With the agent running: `npm run build -w @dyno/sdk-ts` then `npm run test:sdk:smoke`. Optional: `DYNO_AGENT_URL` (legacy `LOCAL_AGENT_URL`), `PORT`, or `SMOKE_SKIP_MACHINE_STATE=1` |
| Clean build outputs | `npm run clean` — removes `dist/` under `apps/demo-electron`, `packages/sdk-ts`, and `packages/agent`, plus `*.tsbuildinfo` in those trees. **Does not** delete the SQLite DB |
| Reset agent DB (explicit) | Stop the agent, then `npm run reset:db` (same as `npm run reset:agent`) |

**First-time / after `clean`:** run `npm run build` (or at least `npm run build -w @dyno/sdk-ts`) before `npm run dev:app` or `npm run test:sdk:smoke`.

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
npm run build -w @dyno/sdk-ts
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
- **File location (default):** `packages/agent/.dyno-agent-data/agent.sqlite` (created on first run). If `.dyno-agent-data` does not exist but a previous **`.local-agent-data`** directory is present, that legacy path is used until you migrate. Override with env **`DYNO_AGENT_DATA_DIR`** (legacy **`LOCAL_AGENT_DATA_DIR`** still honored).
- **Inspect:** `GET http://127.0.0.1:8787/debug/db` returns JSON: DB path, table names, row counts for `jobs` / `results` / `runningJobs` (jobs with `state = 'running'`), `schema_version` from `agent_state` (currently **`4`** after Step 12: `jobs.attempt_count` / `jobs.last_error`; Step 9 added `execution_policy` / `local_mode`), whether a `device_profile` row exists (`device_profile_row`), and whether a `machine_state` row exists (`machine_state_row`).
- **Device profile:** On each startup the agent records one row (`id = 1`) with `os`, `arch`, `cpu_count`, `ram_total_mb`, `ram_free_mb`, `disk_free_mb`, and `updated_at` (ms epoch). **View it:** `GET http://127.0.0.1:8787/debug/profile` returns that row as JSON. Free disk space uses Node’s `fs.statfsSync` on the agent data directory when the API exists; if probing fails, `disk_free_mb` is `-1`.
- **Jobs (Step 4–6, Step 9 policy, Step 10 embed):** The agent accepts job submissions over HTTP and stores rows in SQLite (`jobs` table). New jobs are created in state `queued`. **Step 9** chooses **`run_local`** vs **`run_cloud`** using `executionPolicy`, `localMode`, machine readiness, and a stubbed cloud availability flag (not RAM-only routing). **Step 10:** when the decision is local and **`taskType` is `embed_text`**, the worker runs a **real** local embedding (`executor` **`local_real`**) via `@huggingface/transformers` and **`Xenova/all-MiniLM-L6-v2`**; all other local task types still use **`local_mock`**, and cloud runs use **`cloud_mock`**. Executors write a row to **`results`** (`output_json`, `executor`, `completed_at`) on success; on failure the job ends in `failed` with no result row. The first `embed_text` run may download model weights (network); later runs reuse the in-process pipeline.

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

- **Reset:** Stop the agent, then delete the `.dyno-agent-data` folder (or legacy `.local-agent-data`), or only `agent.sqlite`, under `packages/agent`, or clear the directory pointed to by `DYNO_AGENT_DATA_DIR` / `LOCAL_AGENT_DATA_DIR`.

### Step 7: Machine state (inputs to readiness)

- **Reporting:** The Electron demo app sends machine signals to the agent about every **5 seconds** while it is open via **`DynoSdk.reportMachineState`** (same JSON shape: `{ "isSystemIdle", "idleSeconds", "isOnAcPower" }`). Values come from Electron **`powerMonitor`** in the **main** process (`getSystemIdleTime`, `getSystemIdleState`, `onBatteryPower`). Override the agent base URL with **`DYNO_AGENT_URL`** if needed (legacy **`LOCAL_AGENT_URL`**; passed into `new DynoSdk({ baseUrl: ... })`).
- **Storage:** The agent upserts a single row in **`machine_state`** (`id = 1`). Inspect with **`GET /debug/machine-state`** (returns `{ exists: false, ... }` until the first POST).

### Step 8: TypeScript SDK + demo integration

- **`packages/sdk-ts`** implements **`DynoSdk`**: HTTP-only, typed wrappers around the agent routes listed above (no worker/policy logic in the SDK).
- **`demo-electron`** uses the SDK in the **main process** for health, machine state, **Create Demo Job** (echo / mock local), and **Create Embedding Job** (`embed_text`, Step 10). Preload exposes `window.demoAgent.createDemoJob()` and `createEmbeddingJob()`. The renderer stays free of SDK imports.
- **Logs:** The agent logs when stored machine state **changes** meaningfully (avoids spamming on identical 5s reports).

### Step 10: Real local `embed_text` (Transformers.js)

- **First real local workload:** `taskType: "embed_text"` with payload `{ "text": "<non-empty string>" }`. When policy resolves to **local** execution (`run_local`), the agent runs **`Xenova/all-MiniLM-L6-v2`** through **`@huggingface/transformers`** (ONNX via the library’s Node backend). The result JSON includes `dimensions` (384 for this model), `embedding` (full vector), `embeddingPreview` (first few values), and `executor: "local_real"`.
- **Lazy load:** The embedding pipeline is loaded **once** per agent process and reused (see **Step 11** for lifecycle logs and **`GET /debug/models`**). The **first** `embed_text` job after startup is slower (download + init); **later** jobs skip reload and are much faster.
- **Scope:** No model registry, background downloads UI, or multi-model selection. **Cloud** execution remains **`cloud_mock`** for every task type, including `embed_text`. Other local task types remain **`local_mock`**.
- **Timeouts / errors:** Load + inference are wrapped in a bounded timeout; failures mark the job **`failed`**, log clearly, and do **not** crash the agent. Invalid payload (missing/empty `text`) fails the job with a clear error.

**SDK / curl example**

```typescript
import { DynoSdk } from '@dyno/sdk-ts';

const sdk = new DynoSdk();
const job = await sdk.createJob({
  taskType: 'embed_text',
  payload: { text: 'hello world' },
  executionPolicy: 'local_only',
  localMode: 'interactive',
});
```

```bash
curl -s -X POST http://127.0.0.1:8787/jobs \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"embed_text\",\"payload\":{\"text\":\"hello world\"},\"executionPolicy\":\"local_only\",\"localMode\":\"interactive\"}"
```

Poll `GET /jobs/:id` until `completed`, then `GET /jobs/:id/result` for the embedding output.

**Windows laptops:** The first run downloads ONNX weights into the Hugging Face cache (disk + network). Antivirus or corporate proxy can slow or block downloads; ensure outbound HTTPS to Hugging Face is allowed. Subsequent runs use the cache and are faster.

### Step 11: `embed_text` model lifecycle (warmup + debug)

- **Explicit state:** The agent tracks the in-process **`Xenova/all-MiniLM-L6-v2`** pipeline with states **`not_loaded`**, **`loading`**, **`ready`**, and **`failed`**, plus **`loadedAt`** (ms epoch) and **`lastError`** (string or `null`). This lives in memory only (not SQLite). Loading logic lives in **`packages/agent/src/models/embed-text-model.ts`**; the **`embed_text`** executor calls **`getEmbedTextPipeline()`** there instead of owning a hidden singleton.
- **Manual warmup:** **`POST /models/embed-text/warmup`** runs **`warmupEmbedTextModel()`** (idempotent when already **`ready`**; concurrent callers share one in-flight load; after **`failed`**, the next warmup retries). On failure the response is **503** with JSON including **`error`**, **`message`**, and **`embed_text`** state — the agent process stays up.
- **Debug:** **`GET /debug/models`** returns `{ "embed_text": { "state", "loadedAt", "lastError" } }`. **`GET /debug/readiness`** also includes a non-policy field **`embedTextModel`** with the same three fields for visibility; machine readiness rules are **unchanged** (jobs do not require the model to be pre-warmed).
- **Logs:** `[agent] embed_text_model: loading...` → `ready` or `failed error=...`; warmup logs **`warmup requested`** and **`warmup skipped (already ready)`** when appropriate.
- **SDK:** **`DynoSdk.getModelDebugInfo()`** → `GET /debug/models`; **`DynoSdk.warmupEmbedTextModel()`** → `POST /models/embed-text/warmup` (throws **`DynoSdkError`** on non-2xx, e.g. **503** after a failed warmup).

```typescript
import { DynoSdk } from '@dyno/sdk-ts';

const sdk = new DynoSdk();
await sdk.warmupEmbedTextModel();
const models = await sdk.getModelDebugInfo();
```

### Step 12: Reliability & recovery

- **Attempts & errors:** Each job row stores **`attempt_count`** (incremented when the worker claims the job and sets `running`) and optional **`last_error`** (cleared on a new attempt; set on failure or startup recovery). **`POST /jobs`** and **`GET /jobs/:id`** expose these as **`attemptCount`** and **`lastError`** in JSON.
- **Startup recovery:** After opening the DB and before the background worker starts, the agent finds all jobs with **`state = 'running'`**, treats them as interrupted, sets **`state = 'queued'`**, sets **`last_error`** to a fixed recovery message, updates **`updated_at`**, and persists. There is no heartbeat or lease; any `running` row at startup is assumed stale.
- **Retries:** **`MAX_JOB_ATTEMPTS`** is **3** (constant in `packages/agent/src/jobs/index.ts`). On executor failure, if **`attempt_count < MAX_JOB_ATTEMPTS`**, the job is put back to **`queued`** with **`last_error`** set to a truncated error string; otherwise it becomes **`failed`**. There is no exponential backoff or delayed retry—only the existing worker poll interval.
- **Pipeline:** Executor errors (mock, `embed_text`, model load/inference) are caught so jobs do not stay stuck in **`running`**; the agent process does not exit on job failure.

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

**Local testing bypass:** Set **`DYNO_READINESS_BYPASS=1`** (also **`true`** / **`yes`**) when starting the agent; legacy **`LOCAL_AI_READINESS_BYPASS`** is still honored. The worker then treats **interactive**, **background**, and **conservative** readiness as **true** for scheduling, while **`localMode` on each job is unchanged** (policy still picks the right bar per job). Numeric thresholds in code are **not** modified. **`GET /debug/readiness`** includes **`readinessBypass: true`** and prepends an explanatory string to **`reasons`**. Example (PowerShell): `$env:DYNO_READINESS_BYPASS='1'; npm run dev:agent`. Unset for production-like behavior.

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

The Electron app is now a compact in-memory semantic-search demo (setup + indexing + search) with two backend modes:
- Gemini Cloud (`gemini-embedding-001`)
- Dyno (`projectId` + dashboard strategy path)

### Backend switch (demo-friendly)

Open `apps/demo-electron/src/main.ts` and edit the clearly labeled block:

```ts
// DEMO SWITCH: choose one embedding backend, then reload the app.
const embeddingBackend = createGeminiBackend();
// const embeddingBackend = createDynoBackend();
```

Flip one line, reload the app, and the same semantic-search workflow runs through the selected backend.

### Gemini Cloud mode

Required env:

```powershell
$env:GEMINI_API_KEY="<your_gemini_api_key>"
```

Run:

```bash
npm run build -w @dyno/sdk-ts
npm run dev:app
```

### Dyno mode

Required env:

```powershell
$env:DYNO_API_KEY="<project_api_key_from_dashboard>"
$env:DYNO_CONFIG_RESOLVER_URL="http://127.0.0.1:3000"
$env:DYNO_CONFIG_RESOLVER_SECRET="<same_secret_as_dashboard_server>"
```

Optional:

```powershell
$env:DYNO_AGENT_URL="http://127.0.0.1:8787"
```

Run:

```bash
npm run dev:agent
npm run build -w @dyno/sdk-ts
npm run dev:app
```

After editing TypeScript, run `npm run dev:app` again (it runs `tsc` then `electron .`).

In both modes, the UI shows active backend/status, supports built-in sample datasets or pasted custom text, indexes chunks in memory, and returns top cosine-similarity matches with scores.

### Dashboard resolver env (server-only)

The dashboard now exposes a thin demo resolver at
`/api/demo/project-config/[projectId]`. This endpoint is a temporary bridge
for demo integration and should run with server-only secrets.

Required server env in `apps/dashboard-web`:

```powershell
$env:DYNO_DEMO_CONFIG_RESOLVER_SECRET="<resolver_secret>"
$env:SUPABASE_SERVICE_ROLE_KEY="<supabase_service_role_key>"
```

Notes:
- `DYNO_CONFIG_RESOLVER_SECRET` in `demo-electron` must match `DYNO_DEMO_CONFIG_RESOLVER_SECRET` in `dashboard-web`.
- `SUPABASE_SERVICE_ROLE_KEY` is internal to the dashboard backend and is never needed in the SDK or demo app.
- This resolver route is demo-only and intended to be replaced later by a proper control-plane API.

When **Create Embedding Job** is clicked in Dyno mode, logs and UI output include:
- `projectId` used
- resolver-loaded project config (`use_case_type`, `strategy_preset`, model/policy fields)
- derived execution path (`executionPolicy`, `localMode`)
- embedding result summary (`executor`, dimensions, preview)

## Control-plane API (Phase 1)

`apps/control-plane-api` now exposes an OpenAI-compatible surface:

- `POST /v1/embeddings`
- `GET /v1/models`

Dyno-issued API keys are now the canonical auth path. Clients should call Dyno like:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: "http://127.0.0.1:8788/v1",
});
```

Flow:
- create a project API key in dashboard project settings
- copy the key once (`dyno_live_...`)
- send it as `Authorization: Bearer <DYNO_API_KEY>`
- Dyno resolves the project from the key, then uses project-backed Phase 2A config to route local vs cloud
- Dyno now writes a durable `request_executions` record for handled `POST /v1/embeddings` and `GET /v1/models` requests so project owners can inspect recent outcomes in the dashboard

`X-Project-Id` is no longer required for public integrations. A temporary fallback exists only when `DYNO_ENABLE_X_PROJECT_ID_FALLBACK=true` is set for internal/dev usage.

Required env:

```powershell
$env:DYNO_CONFIG_RESOLVER_URL="http://127.0.0.1:3000"
$env:DYNO_CONFIG_RESOLVER_SECRET="<resolver_secret>"
$env:DYNO_DEMO_CONFIG_RESOLVER_SECRET="<resolver_secret>"
$env:DYNO_SUPABASE_URL="<supabase_project_url>"
$env:DYNO_SUPABASE_SERVICE_ROLE_KEY="<supabase_service_role_key>"
```

Optional env:

```powershell
$env:DYNO_CONTROL_PLANE_PORT="8788"
$env:DYNO_AGENT_BASE_URL="http://127.0.0.1:8787"
$env:DYNO_UPSTREAM_MODEL="text-embedding-3-small"
$env:DYNO_CONFIG_RESOLVER_SECRET_HEADER="x-dyno-demo-secret"
$env:DYNO_UPSTREAM_TIMEOUT_MS="20000"
$env:DYNO_ENABLE_X_PROJECT_ID_FALLBACK="false"
```

Run:

```bash
npm run dev:control-plane
```

## Scripts (root)

| Script | Description |
|--------|-------------|
| `npm run build` | `build` in all workspaces |
| `npm run typecheck` | `typecheck` in all workspaces |
| `npm run clean` | Remove `dist/` (and `*.tsbuildinfo`) under `demo-electron`, `sdk-ts`, and `agent` only |
| `npm run dev:agent` | Agent: compile + free port + run |
| `npm run dev:agent:9000` | Same with `PORT=9000` (example; use `PORT` env for other ports) |
| `npm run dev:control-plane` | Control-plane API: compile + run OpenAI-compatible `/v1` endpoints |
| `npm run dev:app` | Demo: compile + Electron |
| `npm run dev:all` | Agent + demo via **concurrently** (one terminal, two processes) |
| `npm run test:control-plane` | Build + run control-plane API unit tests |
| `npm run test:sdk:smoke` | Node script: `DynoSdk` health + DB debug (+ machine state unless skipped) |
| `npm run stop:agent` | Best-effort: stop process(es) listening on agent `PORT` |
| `npm run stop:app` | Best-effort: stop demo Electron if command line matches `demo-electron` |
| `npm run stop:all` | `stop:app` then `stop:agent` |
| `npm run reset:db` / `npm run reset:agent` | Delete agent local data dir (SQLite); stop agent first |

## Layout

```
<repository-root>/
  package.json
  tsconfig.base.json
  README.md
  packages/
    sdk-ts/
    agent/
  apps/
    control-plane-api/
    demo-electron/
```
