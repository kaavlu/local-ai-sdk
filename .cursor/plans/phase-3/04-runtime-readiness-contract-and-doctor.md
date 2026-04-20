# Stage: Runtime readiness contract and doctor diagnostics

## Stage name

**phase3-runtime-contract-doctor** (`04-runtime-readiness-contract-and-doctor.md`)

## Objective

Publish an explicit Runtime Readiness Contract v1 and provide a `dyno doctor`-style diagnostics command/workflow for preflight verification and support triage.

## Why this stage exists

Enterprise pilots need predictable runtime guarantees and fast diagnostics. A clear contract plus one command to collect evidence shortens integration and support loops.

## Dependencies on earlier stages

- Depends on: [03-zero-runtime-knobs-dx-and-ui-copy.md](./03-zero-runtime-knobs-dx-and-ui-copy.md)
- Builds on: [../phase-2/03-local-runtime-lifecycle-contract.md](../phase-2/03-local-runtime-lifecycle-contract.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/runtime-manager.ts](../../../packages/sdk-ts/src/runtime-manager.ts) | Start/healthy/ready orchestration behavior |
| [packages/sdk-ts/src/host-adapters/default-runtime-controller.ts](../../../packages/sdk-ts/src/host-adapters/default-runtime-controller.ts) | Runtime launch and endpoint selection behavior |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | Probe surfaces used by diagnostics |
| [packages/agent/src/index.ts](../../../packages/agent/src/index.ts) | Runtime `/health` and `/debug/readiness` contract |
| [scripts/sdk-smoke-test.mjs](../../../scripts/sdk-smoke-test.mjs) | Existing diagnostics foundation |
| [README.md](../../../README.md) | Runtime contract and troubleshooting docs |

## Files and directories likely to change

- `packages/sdk-ts/src/runtime-manager.ts`
- `packages/sdk-ts/src/host-adapters/default-runtime-controller.ts`
- `packages/sdk-ts/src/client.ts`
- `packages/sdk-ts/src/__tests__/runtime-controller.lifecycle.test.ts`
- `scripts/sdk-smoke-test.mjs`
- `scripts/sdk-runtime-matrix.mjs`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Freeze runtime readiness contract v1**  
   Document probe order, timeout budgets, and compatibility expectations.

2. **Define stable diagnostics payload**  
   Standardize what data is emitted for runtime, resolver, fallback, and capability checks.

3. **Implement doctor command/workflow**  
   Add a single command that checks:
   - runtime reachability/health/readiness
   - managed resolver reachability/auth/config validity
   - fallback adapter reachability (when configured)

4. **Ensure bounded diagnostics behavior**  
   Diagnostics must be timeout-bounded and return actionable messages.

5. **Add support-ready outputs**  
   Emit machine-readable JSON plus concise human-readable summary.

## Risks and failure modes

- Diagnostics becomes slow/flaky due to unbounded network checks.
- Contract docs diverge from actual runtime behavior.
- Error output is too generic to be actionable.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- `npm run test:sdk:smoke`
- `node scripts/sdk-runtime-matrix.mjs`

Manual verification:
- Validate doctor output includes explicit fail reasons for unreachable runtime, resolver auth failure, and fallback timeout.
- Validate runtime contract docs match current endpoint fields.

## Completion criteria

- [x] Runtime readiness contract v1 is documented and code-aligned.
- [x] One diagnostics command/workflow validates runtime + resolver + fallback preconditions.
- [x] Diagnostics output is bounded, actionable, and support-friendly.
- [x] Lifecycle/diagnostics behavior is covered by tests.

## Out of scope

- Advanced remote fleet diagnostics orchestration.
- New runtime workload features unrelated to readiness diagnostics.

## Status

**completed**

## Implementation notes

- Added `packages/sdk-ts/src/doctor.ts` with bounded runtime/resolver/fallback probes and stable result codes.
- Added `scripts/dyno-doctor.mjs` and root script `npm run doctor:sdk` as the single diagnostics workflow.
- Added `packages/sdk-ts/src/__tests__/doctor.test.ts` to cover:
  - unreachable runtime (`runtime_unreachable`)
  - resolver auth failure (`invalid_project_api_key`)
  - fallback timeout (`fallback_timeout`)
  - healthy runtime/readiness pass
- Updated `README.md` with Runtime Readiness Contract v1 language and doctor usage/overrides.

## Verification log

- `npm run typecheck -w @dyno/sdk-ts` -> **pass**
- `npm run test -w @dyno/sdk-ts` -> **pass** (includes new diagnostics tests)
- `npm run test:sdk:smoke` -> **pass**
- `node scripts/sdk-runtime-matrix.mjs` -> **pass**

Manual verification summary:

- `npm run doctor:sdk -- --runtimeUrl http://127.0.0.1:9998 --runtimeTimeoutMs 600` returns explicit `runtime_unreachable`.
- Resolver auth and fallback timeout fail-reason coverage validated via `doctor.test.ts` assertions (`invalid_project_api_key`, `fallback_timeout`).
- Runtime contract docs align with current `GET /health` + conditional `GET /debug/readiness` behavior and capability handshake.
