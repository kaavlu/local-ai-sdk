# Stage: Default telemetry backhaul

## Stage name

**phase6-default-telemetry** (`03-default-telemetry-backhaul.md`)

## Objective

Give demos and pilots **signal without ceremony**: when a developer uses managed onboarding, telemetry events from `embedText` / `embedTexts` / `generateText` should be able to reach the control plane **with one obvious configuration** (or safe defaults), while preserving AGENTS.md best-effort semantics (never block inference on telemetry failure).

## Why this stage exists

You already have `TelemetrySink`, `createHttpTelemetrySink`, and control-plane ingestion (`POST /telemetry/events` in `apps/control-plane-api` per existing tests). Externally, “we have telemetry hooks” reads weaker than “dashboard lights up when I run the SDK.”

## Dependencies on earlier stages

- Depends on: [02-config-resilience-beyond-memory-cache.md](./02-config-resilience-beyond-memory-cache.md) (stable `projectId` + resolver base URL helps attribution)
- Builds on: [../phase-3/06-telemetry-value-proof-pack.md](../phase-3/06-telemetry-value-proof-pack.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | `TelemetryEvent`, `emitTelemetry`, sink behavior |
| [packages/sdk-ts/src/generation-runtime.ts](../../../packages/sdk-ts/src/generation-runtime.ts) | Generation telemetry events |
| [packages/sdk-ts/src/telemetry-http-sink.ts](../../../packages/sdk-ts/src/telemetry-http-sink.ts) | HTTP sink payload + endpoint URL |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | `DynoInitOptions.telemetrySinks` wiring |
| [apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) | `/telemetry/events` handler + persistence |
| [apps/control-plane-api/src/__tests__/openai-routes.test.ts](../../../apps/control-plane-api/src/__tests__/openai-routes.test.ts) | Telemetry ingest tests (anchor expectations) |

## Files and directories likely to change

- `packages/sdk-ts/src/dyno.ts` — optional default sink composition
- `packages/sdk-ts/src/telemetry-http-sink.ts` — payload field correctness (`endpoint` vs `eventType`, generation vs embeddings)
- `README.md` / golden path — `DYNO_TELEMETRY_*` env vars or `Dyno.init` fields
- `apps/control-plane-api` — only if ingest schema must evolve to match SDK reality

## Detailed substeps

1. **Align event schema end-to-end**  
   List fields emitted in `TelemetryEvent` vs what `/telemetry/events` validates and stores. Fix mismatches (e.g. hard-coded `endpoint: '/sdk/embeddings'` in sink while generation fires `generate_text_execution`).

2. **Choose default wiring strategy (pick one)**  
   - **A (env-first):** If `DYNO_TELEMETRY_URL` (+ optional `DYNO_TELEMETRY_API_KEY`) set, `Dyno.init` auto-appends `createHttpTelemetrySink(...)`.  
   - **B (explicit opt-in flag):** `Dyno.init({ telemetry: { enabled: true } })` uses resolver-derived base URL—only if you add resolver fields (avoid magic).  
   Prefer A for demos unless it collides with security expectations.

3. **Auth story**  
   Decide whether telemetry POST uses the same **project API key** as resolver, a separate key, or anonymous ingest (unlikely). Document and implement consistently.

4. **Bounded behavior audit**  
   Confirm sink never throws synchronously into app path; queue drops are acceptable but should be documented in pilot caveats.

5. **Dashboard visibility**  
   Ensure ingested rows appear where pilots look (project activity / signals cards). If ingest exists but UI does not query it, add a minimal query path or document “known gap.”

6. **Tests**  
   - SDK unit test: default sink attached when env set (mock `fetch`).  
   - Control-plane test already present—extend if new fields required.

## Risks and failure modes

- Accidentally attributing events to wrong `projectId` when resolver fails but LKG cache used—ensure event carries resolved id from last good config.
- PII in payloads—telemetry should remain execution metadata only (no raw prompts unless explicitly allowed).

## Cursor verification gate

- `npm run test -w @dynosdk/ts`
- `npm run test:control-plane` (or targeted test file for `/telemetry/events`)
- Manual: run one local + one cloud fallback execution; confirm row(s) in Supabase / dashboard view.

## Completion criteria

- [x] Default or env-driven telemetry path documented in golden quickstart.
- [x] HTTP sink payload matches control-plane expectations for **both** embeddings and generation events.
- [x] Telemetry remains best-effort: failures do not change `local`/`cloud` decision outcomes.

## Out of scope

- Billing-grade accounting, perfect attribution across processes.
- High-volume batch streaming telemetry optimizations.

## Status

**completed**

## Stage notes

Implemented scope:

- Added env-first default telemetry wiring in SDK init: when `DYNO_TELEMETRY_URL` is set, `Dyno.init(...)` auto-appends `createHttpTelemetrySink(...)` (with optional `DYNO_TELEMETRY_API_KEY` auth header).
- Aligned HTTP sink payload fields with control-plane ingest expectations:
  - endpoint now maps by workload (`/sdk/embeddings` vs `/sdk/generate-text`)
  - batch events include `inputCount` mapped from `itemCount`
  - payload remains execution metadata only (no prompt/body content)
- Kept best-effort semantics unchanged: sink errors are swallowed and do not alter local/cloud execution.

Sample `/telemetry/events` JSON payload (generation):

```json
{
  "eventType": "generate_text_execution",
  "projectId": "proj-telemetry-generation",
  "useCase": "text_generation",
  "endpoint": "/sdk/generate-text",
  "decision": "local",
  "reason": "local_job_completed",
  "durationMs": 47,
  "fallbackInvoked": false,
  "requestId": "req-telemetry-generate-1"
}
```

Dashboard visibility path (current lane):

- Dashboard -> Projects -> `<project>` -> Recent requests / activity cards (backed by `request_executions`, now including SDK telemetry endpoints like `/sdk/embeddings` and `/sdk/generate-text`).

Validation performed:

- `npm run test -w @dynosdk/ts`
- `npm run test:control-plane`
- Added/extended unit coverage for:
  - env-driven default sink composition
  - generation endpoint mapping and batch `inputCount` mapping
  - control-plane acceptance/persistence of generation telemetry endpoint rows
