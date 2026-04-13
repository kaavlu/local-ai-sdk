# Dyno (local-first AI SDK)

Dyno is a TypeScript monorepo for local-first AI execution and OpenAI-compatible access.
It currently includes:

- `@dyno/agent`: local execution agent (SQLite + worker + local model runtimes)
- `@dyno/sdk-ts`: typed TypeScript client for the agent and demo config helpers
- `apps/control-plane-api`: OpenAI-compatible `v1` surface (`/v1/models`, `/v1/embeddings`, `/v1/chat/completions`)
- `apps/demo-electron`: semantic-search demo app with Dyno or Gemini embedding backends
- `apps/dashboard-web`: dashboard + demo resolver/auth routes backed by Supabase
- `apps/website`: marketing website

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

Local HTTP service (default `http://127.0.0.1:8787`) with:

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

Typed HTTP client for agent APIs (default base URL `http://127.0.0.1:8787`) plus demo helpers:

- `DynoSdk` operations for jobs, health, machine state, debug endpoints, model warmup
- worker controls (`pauseWorker`, `resumeWorker`)
- job controls (`cancelJob`, `waitForJobCompletion`)
- optional `projectId` support for request headers
- demo project config integrations (`HttpDemoConfigProvider`, `SupabaseDemoConfigProvider`, `createDemoProjectSdkContext`)

### `apps/control-plane-api`

OpenAI-compatible server (default `http://127.0.0.1:8788`) exposing:

- `GET /v1/models`
- `POST /v1/embeddings`
- `POST /v1/chat/completions`

Auth and routing behavior:

- primary auth is Dyno API key via `Authorization: Bearer <dyno key>`
- optional `X-Project-Id` fallback can be enabled for dev only (`DYNO_ENABLE_X_PROJECT_ID_FALLBACK=true`)
- project config is resolved through dashboard resolver endpoints
- request outcomes are persisted to Supabase (`request_executions`) when configured
- embeddings choose local agent vs cloud upstream based on resolved project config and readiness
- chat/completions are cloud-only in this phase and route to the configured upstream OpenAI-compatible provider

### `apps/demo-electron`

Electron semantic-search demo with switchable embedding backend:

- `createDynoBackend()` (currently active in source by default)
- `createGeminiBackend()` (available alternative)

Dyno mode uses project config resolver + local agent; Gemini mode calls Gemini embeddings directly.

### `apps/dashboard-web`

Next.js dashboard app with Supabase-backed project management and demo routes:

- `GET /api/demo/project-config/[projectId]`
- `POST /api/demo/auth/resolve-api-key`

These routes support demo integration and control-plane key resolution.

### `apps/website`

Separate Next.js marketing site (dev port `3100`).

## Root Scripts

| Script | Description |
|---|---|
| `npm run build` | Build all workspaces (`--if-present`) |
| `npm run typecheck` | Typecheck all workspaces (`--if-present`) |
| `npm run clean` | Remove `dist/` and `*.tsbuildinfo` only in `apps/demo-electron`, `packages/sdk-ts`, `packages/agent` |
| `npm run dev:agent` | Start local Dyno agent |
| `npm run dev:agent:9000` | Start agent with `PORT=9000` |
| `npm run dev:control-plane` | Start OpenAI-compatible control-plane API |
| `npm run dev:dashboard` | Start dashboard web app |
| `npm run dev:app` | Start Electron demo app |
| `npm run dev:all` | Start agent + app together |
| `npm run demo:start` | Orchestrated demo startup (auto-check backend mode, resolver, agent, app) |
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

Start agent + demo:

```bash
npm run dev:all
```

Or use orchestrated startup:

```bash
npm run demo:start
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

- `DYNO_PROJECT_ID`
- `DYNO_CONFIG_RESOLVER_URL`
- optional `DYNO_CONFIG_RESOLVER_SECRET`
- optional `DYNO_AGENT_URL` (legacy `LOCAL_AGENT_URL`)

Gemini backend needs:

- `GEMINI_API_KEY`

### Dashboard (`apps/dashboard-web`)

Common server-side requirements:

- `DYNO_DEMO_CONFIG_RESOLVER_SECRET`
- Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY` or `DYNO_DEMO_SUPABASE_SERVICE_ROLE_KEY`)
- optional `DYNO_SECRETS_ENCRYPTION_KEY` for encrypted secret storage paths

### Control Plane (`apps/control-plane-api`)

Required for project-backed auth/config:

- `DYNO_CONFIG_RESOLVER_URL`
- `DYNO_CONFIG_RESOLVER_SECRET`

Common additional vars:

- `DYNO_CONTROL_PLANE_PORT` (or `PORT`, default `8788`)
- `DYNO_CONTROL_PLANE_HOST` (default `127.0.0.1`)
- `DYNO_AGENT_BASE_URL`
- `DYNO_SUPABASE_URL`
- `DYNO_SUPABASE_SERVICE_ROLE_KEY`
- `DYNO_UPSTREAM_BASE_URL`
- `DYNO_UPSTREAM_API_KEY`
- `DYNO_UPSTREAM_MODEL`
- `DYNO_ENABLE_X_PROJECT_ID_FALLBACK`

## Notes

- The first local model run may be slower due to model initialization/download.
- `npm run stop:*` scripts are best-effort helpers; prefer stopping from the original terminal when possible.
- This README intentionally documents current behavior and scripts from source, not historical step-by-step milestone notes.
