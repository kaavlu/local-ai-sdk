# Stage: Local generation demo UX

## Stage name

**phase6-local-generation-demo-ux** (`05-local-generation-demo-ux.md`)

## Objective

Make **first-run local generation** demos predictable: minimize embarrassing first-token latency, surface readiness/warmup state honestly, and align harness behavior with the golden path (stages 1–4).

## Why this stage exists

Architecture can be right while the **demo still fails** because `Xenova/distilgpt2` load time, memory pressure, or missing warmup makes the first request look “broken.” External viewers conflate UX with correctness.

## Dependencies on earlier stages

- Depends on: [01-golden-path-quickstart.md](./01-golden-path-quickstart.md)
- Depends on: [04-fallback-credential-boundary.md](./04-fallback-credential-boundary.md) (fallback env vs adapter story should be stable in demo)
- Builds on: [../phase-4-text-generation-local/01-agent-local-generation-workload.md](../phase-4-text-generation-local/01-agent-local-generation-workload.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/agent/src/models/generate-text-model.ts](../../../packages/agent/src/models/generate-text-model.ts) | Model id, warmup, load state |
| [packages/agent/src/workloads/registry.ts](../../../packages/agent/src/workloads/registry.ts) | Warmup route `/models/generate-text/warmup` |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | `warmup*` helpers if SDK should call warmup explicitly |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Optional `warmupLocalGeneration()` GA helper (only if you add it) |
| [apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts) | Current `Dyno.init` + embeddings path; generation demo if present |
| [scripts/dyno-doctor.mjs](../../../scripts/dyno-doctor.mjs) + [packages/sdk-ts/src/doctor.ts](../../../packages/sdk-ts/src/doctor.ts) | Generation readiness probes |

## Files and directories likely to change

- `apps/demo-electron/src/main.ts` — optional warmup after `Dyno.init`, or IPC to prefetch generation model
- `apps/demo-electron/README.md` — expectations, env vars, “first run slow” copy
- `README.md` — link demo checklist
- `packages/sdk-ts` — only if you add a narrow GA helper like `dyno.warmupGeneration()` (prefer internal call from `Dyno.init` behind flag to avoid API bloat)

## Detailed substeps

1. **Define demo success criteria**  
   Example: “Within N seconds of app open, first `generateText` returns `decision: local` on dev laptop with X GB RAM” or accept cloud fallback with explicit reason banner in UI.

2. **Warmup strategy (pick one)**  
   - **Runtime-led:** agent warms generation model on startup (risk: slower boot).  
   - **SDK-led:** after `Dyno.init`, call `POST /models/generate-text/warmup` once (via `DynoSdk` or new package-private helper).  
   - **App-led:** demo-electron calls warmup IPC after init.  
   For external SDK story, prefer SDK-led or documented app hook so Electron is not special.

3. **Status surfacing**  
   Extend demo UI or `getStatus()` consumers to show: `generate_text` model state from `/debug/models` or `DynoStatus` fields if you add them—so “loading model” is visible, not a hung UI.

4. **Copy pass**  
   Align `apps/demo-electron/README.md` and root README “Notes” with measured expectations (first load, memory, cloud fallback reasons). Reference `SMOKE_REQUIRE_LOCAL_GENERATION` behavior where relevant.

5. **Optional quality knob (non-default)**  
   If you keep `distilgpt2`, document it as demo-class. If you add a better local default for demos only, guard behind env flag to avoid surprising production integrators.

6. **Regression**  
   Ensure `npm run test:sdk:smoke` still passes; update smoke script if warmup changes timing assumptions.

## Risks and failure modes

- Warmup on every `Dyno.init` could regress startup time for embeddings-only apps—gate generation warmup on `use_case_type` or first `generateText` call.
- Double warmup from runtime manager + explicit call—coordinate.

## Cursor verification gate

- `npm run test:sdk:smoke`
- `npm run dev:all` manual: cold start vs second request latency notes
- Optional: `npm run doctor:sdk` with generation probes

## Completion criteria

- [x] Demo path documents first-run latency and memory caveats accurately.
- [x] Warmup or equivalent avoids “silent hang” perception during generation demos.
- [x] Smoke / doctor checks remain green after behavior changes.

## Out of scope

- Shipping a large generative model as default in the agent for all users.
- Streaming token UX (nice-to-have for later).

## Status

**completed**

## Stage notes

- Chosen warmup strategy: **app-led** in `apps/demo-electron` (non-blocking call to `POST /models/generate-text/warmup` via SDK client after `Dyno.init(...)`).
- Demo status surfacing now includes `generationWarmup` and `generationModelState` so the UI can distinguish `warming` from `ready`/`failed` and avoid silent-hang perception.
- Docs updated (`apps/demo-electron/README.md`, root `README.md`) with first-run generation caveats and explicit `SMOKE_REQUIRE_LOCAL_GENERATION` guidance.
- Validation run: `npm run test:sdk:smoke` (pass).
- Timing capture: cold vs warm generation latency on target demo hardware is still a follow-up measurement task.
