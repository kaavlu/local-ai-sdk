# Stage: SDK generation contract and fallback semantics

## Stage name

**phase4-sdk-generate-contract** (`02-sdk-generation-contract-and-fallback.md`)

## Objective

Expose a local-first SDK generation API (`generateText`) that mirrors Dyno's existing architecture: on-device local attempt first, app-owned cloud fallback when local is unavailable/unhealthy/not-ready.

## Why this stage exists

Customers should adopt generation through the same SDK contract they already see for embeddings. A proxy-only chat path is secondary and does not represent the core product direction.

## Dependencies on earlier stages

- Depends on: [01-agent-local-generation-workload.md](./01-agent-local-generation-workload.md)
- Builds on: [../phase-3/02-fallback-contract-and-adapter-guidance.md](../phase-3/02-fallback-contract-and-adapter-guidance.md)
- Builds on: [../phase-3/01-sdk-ga-contract-and-surface-hardening.md](../phase-3/01-sdk-ga-contract-and-surface-hardening.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Add high-level generation method on GA surface |
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | Reference local-preflight + fallback execution design |
| [packages/sdk-ts/src/runtime-manager.ts](../../../packages/sdk-ts/src/runtime-manager.ts) | Reuse readiness contract and local-mode checks |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Export generation types/surfaces cleanly |
| [packages/sdk-ts/src/types.ts](../../../packages/sdk-ts/src/types.ts) | Add request/result/reason type shapes |

## Files and directories likely to change

- `packages/sdk-ts/src/dyno.ts`
- `packages/sdk-ts/src/index.ts`
- `packages/sdk-ts/src/types.ts`
- `packages/sdk-ts/src/generation-runtime.ts` (new, recommended)
- `packages/sdk-ts/src/__tests__/*` (new/updated contract and runtime tests)

## Detailed substeps (grounded in repo)

1. **Define SDK generation result and reason taxonomy**  
   Introduce stable decision/reason categories matching local-first semantics (`preflight`, `local_execution`, `fallback`, `config`).

2. **Add `Dyno.generateText(...)` API**  
   Extend `Dyno` GA surface with generation method and keep advanced internals non-default.

3. **Implement local-preflight + fallback flow**  
   Reuse bounded probe order (`/health`, optional readiness) before local job creation; invoke app-owned fallback adapter on preflight/local failures.

4. **Preserve app-owned fallback boundary**  
   Add generation fallback adapter contract first; convenience HTTP wrapper may remain optional secondary behavior.

5. **Add SDK regression tests**  
   Cover local success, local failure -> fallback, fallback timeout/error, fallback disabled, and GA surface expectations.

## Risks and failure modes

- SDK generation API leaks low-level runtime details in default onboarding.
- Fallback ownership boundary becomes ambiguous in examples/types.
- Reason taxonomy diverges from embeddings contract, weakening telemetry consistency.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- `npm run test:sdk:smoke`

Manual verification:
- Confirm default SDK usage only needs `Dyno.init(...)` + `dyno.generateText(...)`.
- Confirm fallback is adapter-first and credentials remain app-owned in docs/examples.

## Completion criteria

- [x] SDK exposes a stable local-first `generateText` method.
- [x] Generation fallback semantics are explicit and adapter-first.
- [x] Generation reason taxonomy and telemetry fields are stable and test-covered.
- [x] GA docs/snippets remain zero-runtime-knob in default path.

## Out of scope

- Multi-turn memory/session abstractions.
- Tool calling/function-calling orchestration.

## Status

**completed**

## Stage notes

- Added SDK generation runtime contract in `packages/sdk-ts/src/generation-runtime.ts` with:
  - local preflight order (`/health` then optional readiness probe) before local enqueue
  - bounded local execution wait and cloud fallback timeout handling
  - adapter-first fallback contract and explicit fallback-disabled behavior
  - stable reason taxonomy parity with embeddings (`preflight`, `local_execution`, `fallback`, `config`)
- Added GA SDK method `Dyno.generateText(...)` in `packages/sdk-ts/src/dyno.ts` while preserving narrow GA surface semantics.
- Extended `DynoFallbackConfig` to support generation fallback via:
  - `fallback.generateTextAdapter` (recommended app-owned adapter)
  - optional convenience HTTP wrapper (`baseUrl/apiKey` + `generationModel/generatePath`)
- Added generation request/result low-level types in `packages/sdk-ts/src/types.ts` and exposed generation runtime types from `packages/sdk-ts/src/index.ts`.
- Added focused SDK regression tests in `packages/sdk-ts/src/__tests__/generation-runtime.test.ts` covering:
  - local success
  - local failure -> fallback
  - fallback timeout
  - fallback adapter error
  - fallback disabled
- Updated GA surface contract test to include `generateText`.

### Verification results

- `npm run typecheck -w @dyno/sdk-ts` -> **pass**
- `npm run test -w @dyno/sdk-ts` -> **pass**
- `npm run test:sdk:smoke` -> **pass**

Manual verification:
- Default SDK DX remains zero-runtime-knob (`Dyno.init(...)` + `dyno.generateText(...)`) -> **pass**
- Generation fallback remains adapter-first and app-owned (`fallback.generateTextAdapter`) with HTTP wrapper explicitly secondary -> **pass**
