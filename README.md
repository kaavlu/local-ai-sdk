# Dyno (SDK-first, local-first AI)

Dyno is a **SDK-first** TypeScript monorepo for **local-first** AI execution: apps integrate Dyno and replace cloud inference calls while runtime lifecycle stays internal, so workloads can run on the **end user’s device** when viable and fall back to the developer’s **existing cloud provider** using **developer-owned** credentials.

The **hosted control plane** (dashboard + backend APIs) provides **project configuration** and **telemetry ingestion**. It is **not** the canonical per-request inference router in the main product architecture (see `AGENTS.md`).

This repo also ships an **optional** OpenAI-compatible HTTP surface in `apps/control-plane-api` for sandbox, demos, enterprise, and compatibility testing. Treat it as **secondary** to the **SDK + local runtime** integration path.

## Prerequisites

- Node.js `>=18`
- npm (workspaces are configured at repo root)

Install:

```bash
npm install
```

## Workspace Layout

```text
.
├─ packages/
│  ├─ agent
│  └─ sdk-ts
├─ apps/
│  ├─ control-plane-api
│  ├─ dashboard-web
│  ├─ demo-electron
│  └─ website
└─ scripts/
```

## Core Components

### `packages/agent` (`@dyno/agent`)

**Local runtime** service (default `http://127.0.0.1:8787`) with:

- job queue + worker lifecycle (`queued`, `running`, `completed`, `failed`, `cancelled`)
- policy-aware local/cloud scheduling (`executionPolicy`, `localMode`)
- machine readiness signals (`/machine-state`, `/debug/readiness`)
- SQLite persistence via `sql.js` (current `schema_version` is `7`)
- local model runtimes for `embed_text` and `classify_text`
- warmup and debug endpoints for model state and worker state

Main routes include:

- `GET /health`
- `POST /jobs`, `GET /jobs/:id`, `GET /jobs/:id/result`, `POST /jobs/:id/cancel`
- `POST /worker/pause`, `POST /worker/resume`
- `POST /models/embed-text/warmup`, `POST /models/classify-text/warmup`
- `GET /debug/db`, `/debug/models`, `/debug/worker`, `/debug/metrics`, `/debug/capability`

### `packages/sdk-ts` (`@dyno/sdk-ts`)

Primary **SDK integration surface** for app runtime orchestration:

- `Dyno.init(...)` for zero-runtime-knob startup (host detection, packaged helper resolution, launch, probes, shutdown)
- `dyno.embedText()` / `dyno.embedTexts()` for local-first embeddings with app-owned cloud fallback credentials
- `dyno.getStatus()` / `dyno.shutdown()` for lifecycle inspection and cleanup
- managed onboarding via `projectApiKey` + control-plane resolver (no custom provider required for standard setups)
- `DynoEmbeddingsRuntime.embedTexts()` for deterministic batch execution (`failFast` optional)
- `ProjectConfigProvider` contract plus `CachedProjectConfigProvider` (last-known-good in-memory cache + TTL)
- best-effort `TelemetrySink` hooks for decision/reason/duration signals

GA contract (default integration):

- initialize once with `Dyno.init(...)`
- run embeddings through `embedText` / `embedTexts`
- optionally inspect readiness with `getStatus`
- shut down cleanly with `shutdown`

Anything else should be treated as advanced/internal and non-default.

Embeddings v1 contract notes:

- reason taxonomy is stable by category: `preflight`, `local_execution`, `fallback`, `config`
- each execution result includes both `reason` and `reasonCategory`
- fallback contract is adapter-first: app code owns provider client + credentials and SDK only invokes the adapter
- convenience `fallback.baseUrl + fallback.apiKey` remains available as a secondary HTTP wrapper path
- batch telemetry emits per-item execution events plus one `embeddings_batch_execution` aggregate event with `itemCount`, `successCount`, and `failureCount`
- telemetry transport is non-blocking and bounded (retry budget + queue cap)

Runtime readiness contract v1 notes:

- probe order is bounded and explicit: `GET /health` -> optional `GET /debug/readiness` (only when runtime advertises `runtime.capabilities.readinessDebugV1`) -> `POST /jobs`
- guaranteed fields for compatibility checks are `health.ok` and, when present, `health.runtime.contractVersion` plus `health.runtime.capabilities.*`
- readiness internals (`readiness.signals`, per-mode warnings, thresholds) are advisory and may evolve; SDK routing only relies on per-mode `isReady` booleans
- analytics-safe lifecycle dimensions for dashboard/control-plane use are decision outcome (`local`/`cloud`), stable reason taxonomy, and terminal local job state classes (`completed`, `failed`, `cancelled`, `timed_out`)
- backward compatibility rule: runtimes that do not advertise readiness capability are treated as legacy-compatible and do not fail preflight for missing readiness detail support
- diagnostics lane: `npm run doctor:sdk` performs bounded checks across runtime, managed resolver, and fallback reachability and emits both a short summary and full JSON

Lower-level and transitional APIs remain available:

- `DynoSdk` operations for jobs, health, machine state, debug endpoints, model warmup (**advanced/internal**)
- worker controls (`pauseWorker`, `resumeWorker`)
- job controls (`cancelJob`, `waitForJobCompletion`)
- optional `projectId` support for request headers
- demo project config integrations (`@dyno/sdk-ts/demo` subpath)

Default managed onboarding example:

```ts
import { Dyno } from '@dyno/sdk-ts';
import OpenAI from 'openai';

const provider = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    adapter: async ({ text }) => {
      const response = await provider.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return { embedding: response.data[0]!.embedding };
    },
  },
});

const result = await dyno.embedText('hello world');
await dyno.shutdown();
```

Convenience fallback wrapper (secondary):

```ts
const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    baseUrl: process.env.DYNO_FALLBACK_BASE_URL!,
    apiKey: process.env.DYNO_FALLBACK_API_KEY!,
    model: 'text-embedding-3-small',
  },
});
```

Advanced/custom deployments can still pass explicit `projectId + projectConfigProvider` instead of managed `projectApiKey` mode.

### `apps/control-plane-api`

**Control plane API** process (default `http://127.0.0.1:8788`).

**Configuration and telemetry:** resolves project context via dashboard resolver endpoints and, when configured, persists request outcomes to Supabase (`request_executions`) for visibility in the dashboard.

Operator model:

- run this service on developer/server infrastructure for hosted resolver/proxy use cases
- keep app runtime integration on `@dyno/sdk-ts` + local agent in end-user environments

**Optional OpenAI-compatible routes** (secondary to SDK + local runtime):

- `GET /v1/models`
- `POST /v1/embeddings`
- `POST /v1/chat/completions`

Auth and execution notes:

- primary auth is Dyno API key via `Authorization: Bearer <dyno key>`
- auth + config resolution use one managed resolver lane (`GET /api/v1/sdk/config`)
- embeddings may use the local agent vs cloud upstream based on resolved project config and readiness
- chat/completions are cloud-only in this phase and forward to the configured upstream OpenAI-compatible provider
- proxy telemetry is a hosted-traffic signal (directional visibility), not full local-first ground truth across all SDK traffic

Secondary-lane maintenance policy (`apps/control-plane-api`):

- non-goal: expanding proxy-first product scope (for example streaming chat, new proxy-only feature lanes, or broad model brokerage)
- in scope: compatibility, correctness, and reliability bugfixes for existing routes
- route removals require an explicit deprecation path

### `apps/demo-electron`

Electron semantic-search demo with switchable embedding backend:

- `createDynoBackend()` (currently active in source by default)
- `createGeminiBackend()` (available alternative)

Dyno mode uses project config resolver + local agent; Gemini mode calls Gemini embeddings directly.

### `apps/dashboard-web`

Next.js **control plane UI** with Supabase-backed project management and SDK config route:

- `GET /api/v1/sdk/config` (primary SDK managed-config route; authenticated with project API key)

This route resolves project identity from the key and returns runtime policy/config in one request.

### `apps/website`

Separate Next.js marketing site (dev port `3100`).

## Root Scripts

| Script | Description |
|---|---|
| `npm run build` | Build all workspaces (`--if-present`) |
| `npm run typecheck` | Typecheck all workspaces (`--if-present`) |
| `npm run clean` | Remove `dist/` and `*.tsbuildinfo` only in `apps/demo-electron`, `packages/sdk-ts`, `packages/agent` |
| `npm run dev:runtime-manager` | Start demo app with runtime manager auto-start path |
| `npm run dev:agent` | Start local Dyno agent (local runtime) |
| `npm run dev:agent:9000` | Start agent with `PORT=9000` |
| `npm run dev:control-plane` | Start control-plane API (config resolver + optional OpenAI-compatible routes) |
| `npm run dev:dashboard` | Start dashboard web app |
| `npm run dev:app` | Start Electron demo app |
| `npm run dev:all` | Alias of `dev:runtime-manager` (manager-first dev flow) |
| `npm run dev:all:legacy` | Legacy manual flow: start agent + app together |
| `npm run demo:start` | Orchestrated demo startup (auto-check backend mode/resolver, then app) |
| `npm run doctor:sdk` | Runtime readiness diagnostics (runtime + resolver + fallback) |
| `npm run demo:stop` | Stop app + agent (`stop:all`) |
| `npm run stop:agent` | Free agent dev port |
| `npm run stop:app` | Best-effort stop for demo Electron |
| `npm run stop:dashboard` | Best-effort stop for dashboard dev server |
| `npm run test:sdk:smoke` | SDK smoke script |
| `npm run test:control-plane` | Control-plane tests |

## Quick Start (Local)

```bash
npm install
npm run build
```

Start demo app (manager-first runtime startup):

```bash
npm run dev:all
```

Or use orchestrated startup (recommended in Dyno demo mode):

```bash
npm run demo:start
```

## Runtime doctor workflow

Use one command to collect support-ready diagnostics:

```bash
npm run doctor:sdk
```

Doctor behavior:

- runtime probe is always run (`GET /health`, and `GET /debug/readiness` when supported)
- resolver probe runs when `DYNO_CONFIG_RESOLVER_URL` and `DYNO_PROJECT_API_KEY` are set
- fallback probe runs when `DYNO_FALLBACK_BASE_URL` and `DYNO_FALLBACK_API_KEY` are set
- output includes a concise summary plus machine-readable JSON payload
- all probes are timeout-bounded so diagnostics stay fast and actionable

Optional CLI overrides:

```bash
npm run doctor:sdk -- --runtimeUrl http://127.0.0.1:8787 --localMode interactive --runtimeTimeoutMs 2000 --readinessTimeoutMs 2000
```

```bash
npm run doctor:sdk -- --resolverUrl http://127.0.0.1:3000 --projectApiKey <key> --resolverTimeoutMs 4000
```

```bash
npm run doctor:sdk -- --fallbackUrl https://api.openai.com/v1 --fallbackApiKey <key> --fallbackPath /embeddings --fallbackTimeoutMs 4000
```

## Environment Notes

### Agent (`packages/agent`)

Common vars:

- `PORT` (default `8787`)
- `DYNO_AGENT_DATA_DIR` (legacy `LOCAL_AGENT_DATA_DIR`)
- `DYNO_READINESS_BYPASS` (legacy `LOCAL_AI_READINESS_BYPASS`)
- `MOCK_CLOUD_AVAILABLE`

### Demo Electron (`apps/demo-electron`)

Dyno backend needs:

- `DYNO_PROJECT_API_KEY` (or `DYNO_API_KEY`)
- optional `DYNO_CONFIG_RESOLVER_URL` (defaults to `http://127.0.0.1:3000`)
- optional advanced override `DYNO_AGENT_URL` (legacy `LOCAL_AGENT_URL`)
- `DYNO_FALLBACK_BASE_URL`
- `DYNO_FALLBACK_API_KEY`
- optional `DYNO_FALLBACK_MODEL`

Gemini backend needs:

- `GEMINI_API_KEY`

### Dashboard (`apps/dashboard-web`)

Common server-side requirements:

- Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY` or `DYNO_DEMO_SUPABASE_SERVICE_ROLE_KEY`)
- optional `DYNO_SECRETS_ENCRYPTION_KEY` for encrypted secret storage paths

### Control Plane API (`apps/control-plane-api`)

Required for project-backed auth/config:

- `DYNO_CONFIG_RESOLVER_URL`
- optional `DYNO_CONFIG_RESOLVER_CONFIG_PATH` (default `/api/v1/sdk/config`)
- optional `DYNO_CONFIG_RESOLVER_TIMEOUT_MS` (default `8000`)

Common additional vars:

- `DYNO_CONTROL_PLANE_PORT` (or `PORT`, default `8788`)
- `DYNO_CONTROL_PLANE_HOST` (default `127.0.0.1`)
- `DYNO_AGENT_BASE_URL`
- `DYNO_SUPABASE_URL`
- `DYNO_SUPABASE_SERVICE_ROLE_KEY`
- `DYNO_UPSTREAM_BASE_URL`
- `DYNO_UPSTREAM_API_KEY`
- `DYNO_UPSTREAM_MODEL`

## Notes

- The first local model run may be slower due to model initialization/download.
- Zero-knob SDK flow is default: app code calls `Dyno.init(...)`; runtime startup/probes/shutdown are handled internally. Manual `npm run dev:agent` remains a debug lane.
- `npm run stop:*` scripts are best-effort helpers; prefer stopping from the original terminal when possible.
- This README documents current behavior and scripts from source. Product positioning is canonical in `AGENTS.md`.

## Pilot telemetry value proof-pack

For pilot storytelling, use a single evidence window (currently 7-day dashboard window) and keep these artifacts together:

- KPI schema `pilot-kpi-v1` with local hit rate, fallback buckets, reliability summary/trend, and estimated cost impact.
- Confidence + caveat semantics tied to sample size (directional only; not billing-grade attribution).
- Export formats: JSON (machine-readable), CSV (spreadsheet ingest), Markdown (weekly narrative summary).

Canonical caveat to keep in every pilot readout:

> Directional signals from best-effort telemetry. Use for trend monitoring, not exact accounting.
