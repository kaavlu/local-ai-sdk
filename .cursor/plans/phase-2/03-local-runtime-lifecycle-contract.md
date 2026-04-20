# Stage: Local runtime lifecycle contract

## Stage name

**phase2-runtime-contract** (`03-local-runtime-lifecycle-contract.md`)

## Objective

Define and validate a version-aware lifecycle contract between `@dyno/sdk-ts` and `@dyno/agent` so local execution remains predictable, bounded, and backward compatible across runtime updates.

## Why this stage exists

Recovery added SDK-side guardrails, but compatibility assumptions are still implicit (probe expectations, readiness endpoint behavior, older-agent fallback behavior). Phase 2 should make runtime expectations explicit and testable so SDK evolution does not silently break local-first reliability.

## Dependencies on earlier stages

- Depends on [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) for stable reason/failure semantics.
- Depends on [02-sdk-api-key-managed-config-onboarding.md](./02-sdk-api-key-managed-config-onboarding.md) for stable managed onboarding and config-resolution behavior.
- Builds on completed recovery stage [../recovery/02-local-runtime-reliability-guardrails.md](../recovery/02-local-runtime-reliability-guardrails.md).

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/agent/src/index.ts](../../../packages/agent/src/index.ts) | Runtime endpoints and status surfaces |
| [packages/agent/src/worker/readiness.ts](../../../packages/agent/src/worker/readiness.ts) | Readiness modes and gate logic |
| [packages/agent/src/jobs/pipeline.ts](../../../packages/agent/src/jobs/pipeline.ts) | Execution transitions and failure paths |
| [packages/agent/src/policy/index.ts](../../../packages/agent/src/policy/index.ts) | Decision policy context and outputs |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | Probe sequence and job polling semantics |
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | Runtime orchestration behavior consuming agent responses |

## Files and directories likely to change

- `packages/agent/src/index.ts`
- `packages/agent/src/worker/readiness.ts`
- `packages/agent/src/jobs/pipeline.ts`
- `packages/sdk-ts/src/client.ts`
- `packages/sdk-ts/src/embeddings-runtime.ts`
- `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts`

## Detailed substeps (grounded in repo)

1. **Formalize lifecycle states and transitions**  
   Document states from SDK perspective: `unreachable`, `healthy_unready`, `ready`, `executing`, `completed`, `failed`, `timed_out`.

2. **Define probe order contract**  
   Lock expected probe sequence (`/health`, optional readiness debug, job enqueue) and expected SDK behavior when probes fail, timeout, or return unknown fields.

3. **Add capability/version handshake**  
   Introduce a minimal capability/version shape so SDK can detect older agents and downgrade behavior instead of failing (for example, missing readiness debug detail support).

4. **Stabilize readiness mode mapping**  
   Ensure readiness modes map to consistent SDK reasons and telemetry dimensions.

5. **Compatibility matrix tests**  
   Add tests covering:
   - older agent missing newer readiness fields
   - probe timeout with eventual fallback
   - runtime returns unknown mode or malformed payload

6. **Document contract boundaries**  
   Add concise docs that separate:
   - what is guaranteed by the runtime contract
   - what is advisory and may evolve
   - which fields are safe for dashboard/control-plane analytics

## Risks and failure modes

- **Version lock-in:** SDK may become too strict on agent response shape.
- **Hidden coupling:** dashboard or control-plane code may rely on unstable readiness internals.
- **Timeout mismatch:** overly aggressive caps may reduce valid local wins.

## Validation steps

- `npm run typecheck -w @dyno/agent`
- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- Run scenario matrix: agent down, agent not ready, agent ready success, agent older compatibility mode.

## Completion criteria

- [x] Runtime lifecycle states and probe behavior are documented and reflected in SDK logic.
- [x] SDK gracefully handles older/missing runtime capability fields.
- [x] Reason mapping for readiness/lifecycle paths is stable and reusable by telemetry/dashboard.
- [x] Compatibility test matrix passes for expected runtime variants.

## Out of scope

- Expanding runtime to new workloads beyond contract hardening for embeddings path.
- Dashboard UI implementation (stage 4 in this folder).
- Control-plane schema/ingest hardening (stage 5 in this folder).

## Status

**completed**

## Stage notes

- Added runtime lifecycle handshake metadata to agent `GET /health` in `packages/agent/src/index.ts`, including:
  - `runtime.contractVersion` (`runtime-lifecycle-v1`)
  - `runtime.lifecycleStates` (`unreachable`, `healthy_unready`, `ready`, `executing`, `completed`, `failed`, `timed_out`)
  - `runtime.capabilities` (`readinessDebugV1`, `readinessDetailsV1`)
- Extended SDK contract typing in `packages/sdk-ts/src/types.ts` with runtime handshake interfaces and richer readiness payload compatibility fields.
- Updated SDK preflight logic in `packages/sdk-ts/src/embeddings-runtime.ts` to enforce bounded probe order:
  - always probe `GET /health` first
  - only call `GET /debug/readiness` when `health.runtime.capabilities.readinessDebugV1 === true`
  - gracefully downgrade for legacy runtimes with no capability handshake
  - fallback with `readiness_probe_failed` when a runtime advertises readiness support but returns malformed readiness payload.
- Expanded compatibility matrix tests in `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts` for:
  - legacy runtime without readiness capability handshake
  - readiness timeout with fallback reason mapping
  - malformed readiness payload under advertised capability.
- Added lifecycle contract boundary docs in `README.md` separating guaranteed fields, advisory fields, analytics-safe dimensions, and backward-compatibility behavior.

## Validation run

- `npm run typecheck -w @dyno/agent`
- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
