# Stage: Agent local generation workload

## Stage name

**phase4-agent-generate-workload** (`01-agent-local-generation-workload.md`)

## Objective

Implement a new local runtime workload, `generate_text`, that can run `Xenova/distilgpt2` (or a similar small model) on-device with the same lifecycle guarantees used by existing local workloads.

## Why this stage exists

Without a real local generation workload in `packages/agent`, SDK-level generation would be a cloud wrapper and not aligned with Dyno's local-first product core.

## Dependencies on earlier stages

- Builds on: [../phase-3/04-runtime-readiness-contract-and-doctor.md](../phase-3/04-runtime-readiness-contract-and-doctor.md)
- Builds on: [../phase-2/03-local-runtime-lifecycle-contract.md](../phase-2/03-local-runtime-lifecycle-contract.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/agent/src/workloads/registry.ts](../../../packages/agent/src/workloads/registry.ts) | Register new real workload, warmup route, readiness fields |
| [packages/agent/src/models/workload-model-runtime.ts](../../../packages/agent/src/models/workload-model-runtime.ts) | Extend residency/eviction/timeout controls to generation |
| [packages/agent/src/models/embed-text-model.ts](../../../packages/agent/src/models/embed-text-model.ts) | Reference lifecycle/load caching pattern |
| [packages/agent/src/executors/embed-text.ts](../../../packages/agent/src/executors/embed-text.ts) | Reference executor shape and error wrapping |
| [packages/agent/src/index.ts](../../../packages/agent/src/index.ts) | Ensure debug/readiness endpoints include generation model state |

## Files and directories likely to change

- `packages/agent/src/models/generate-text-model.ts` (new)
- `packages/agent/src/executors/generate-text.ts` (new)
- `packages/agent/src/workloads/registry.ts`
- `packages/agent/src/models/workload-model-runtime.ts`
- `packages/agent/src/index.ts`
- `packages/agent/src/__tests__/*` (new/updated)

## Detailed substeps (grounded in repo)

1. **Add generation model lifecycle module**  
   Create `generate-text-model.ts` with `not_loaded/loading/ready/failed`, `inFlight` load dedupe, warmup, unload, and `lastUsedAt` tracking.

2. **Add `generate_text` executor**  
   Implement local generation execution with bounded decoding params (for example `max_new_tokens`, `temperature`, `top_p`) and normalized persisted output shape.

3. **Register workload and warmup hooks**  
   Add `generate_text` to workload registry, payload validation, `/models/*/warmup` route list, and readiness/debug model field maps.

4. **Extend runtime residency controls**  
   Include `generate_text` in idle eviction + max resident logic and execution timeout mapping; ensure active-task guard prevents evicting in-flight models.

5. **Add focused agent tests**  
   Cover first-load success, warmup idempotence, timeout/error behavior, and residency behavior with generation present.

## Risks and failure modes

- Generation model memory footprint causes aggressive eviction thrash.
- Inference latency creates stalled local jobs without bounded execution settings.
- Payload/result shape drift makes SDK integration brittle.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/agent`
- `npm run test -w @dyno/agent`
- `npm run dev:agent` (manual smoke)

Manual verification:
- Confirm `generate_text` appears in workload debug/readiness surfaces.
- Confirm warmup endpoint loads model once and reuses loaded state.

## Completion criteria

- [x] Agent supports `generate_text` local execution.
- [x] `Xenova/distilgpt2` (or equivalent small model) loads and runs locally.
- [x] Residency/eviction logic includes generation without regressions.
- [x] Warmup/readiness/debug surfaces reflect generation lifecycle state.

## Out of scope

- Streaming token transport.
- Large-model optimization passes (quantization matrix tuning, GPU-specific kernels).

## Status

**completed**

## Stage notes

- Added `generate_text` model lifecycle (`not_loaded/loading/ready/failed`) with in-flight load dedupe, warmup idempotence, unload, and `lastUsedAt` tracking.
- Added local `generate_text` executor with bounded decode controls (`max_new_tokens`, `temperature`, `top_p`) and normalized persisted output contract.
- Registered `generate_text` workload + warmup route (`POST /models/generate-text/warmup`) and wired readiness/debug model surfaces.
- Extended workload runtime residency/timeout controls to include `generate_text` (idle/max-resident handling + per-workload timeout map).
- Added focused tests for first-load success, warmup idempotence, timeout behavior, and residency eviction with generation present.

### Verification results

- `npm run typecheck -w @dyno/agent` -> **pass**
- `npm run test -w @dyno/agent` -> **pass**
- `npm run dev:agent` -> **pass** (agent started and reported `ready: agent is ready to accept requests`)

Manual verification:
- `GET /debug/readiness` includes `generateTextModel` -> **pass**
- `POST /models/generate-text/warmup` twice returns ready both times with same `loadedAt` (reuse) -> **pass**
