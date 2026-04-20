# Stage: SDK GA contract and surface hardening

## Stage name

**phase3-sdk-ga-surface** (`01-sdk-ga-contract-and-surface-hardening.md`)

## Objective

Lock a narrow, pitch-ready GA surface for `@dyno/sdk-ts` where the canonical integration is:
1) `Dyno.init(...)`
2) `dyno.embedText(...)` / `dyno.embedTexts(...)`
3) `dyno.getStatus()` / `dyno.shutdown()`

Everything else should be explicitly advanced/internal.

## Why this stage exists

The codebase has a strong base but still exposes transitional or low-level usage patterns in product-facing places. Company pitches need one simple, stable contract that can be taught in minutes.

## Dependencies on earlier stages

- Builds on: [../phase-2/01-embeddings-sdk-contract-v1.md](../phase-2/01-embeddings-sdk-contract-v1.md)
- Builds on: [../phase-2/02-sdk-api-key-managed-config-onboarding.md](../phase-2/02-sdk-api-key-managed-config-onboarding.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public export contract |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | High-level canonical API |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | Low-level surface to classify as advanced |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Snippet generation currently leaks low-level APIs |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Public SDK narrative |
| [README.md](../../../README.md) | Canonical entrypoint documentation |

## Files and directories likely to change

- `packages/sdk-ts/src/index.ts`
- `packages/sdk-ts/src/dyno.ts`
- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/app/projects/_components/project-integration-card.tsx`
- `apps/website/app/docs/page.tsx`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Freeze GA API set**  
   Define the exact supported GA methods and expected behavior.

2. **Demote transitional APIs in product messaging**  
   Keep low-level APIs available but clearly mark as advanced/internal in docs and snippets.

3. **Make snippets contract-consistent**  
   Ensure dashboard and docs only show GA APIs in default examples.

4. **Add a GA contract section**  
   Document method guarantees, lifecycle expectations, and non-goals.

5. **Add GA surface regression tests**  
   Add tests that fail if default snippets/docs regress to low-level APIs.

## Risks and failure modes

- Too much surface remains public-facing, creating integration confusion.
- Snippets drift from the actual recommended API.
- Refactors accidentally break existing GA behavior.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- `npm run typecheck -w dashboard-web`
- `npm run test -w dashboard-web --if-present`

Manual verification:
- Confirm default dashboard snippet does not use `dyno.sdk.createJob(...)`.
- Confirm docs quickstart shows only GA surface methods.

## Completion criteria

- [x] GA surface is explicitly defined and documented.
- [x] Default snippets in dashboard/docs only use GA methods.
- [x] Advanced APIs are clearly labeled as non-default.
- [x] Regression tests protect snippet and contract drift.

## Out of scope

- New workload families beyond current Phase 3 priorities.
- Backward-compat policy expansion beyond clear GA/default boundaries.

## Status

**completed**

## Implementation notes

- Hardened GA narrative across SDK exports/docs around the default contract:
  - `Dyno.init(...)`
  - `dyno.embedText(...)` / `dyno.embedTexts(...)`
  - `dyno.getStatus()` / `dyno.shutdown()`
- Kept low-level runtime APIs available, but explicitly labeled as advanced/internal (non-default) in SDK source exports and dashboard/docs copy.
- Updated dashboard-generated default SDK snippet to remove low-level `dyno.sdk.createJob(...)` usage and align with GA methods only.
- Added GA contract regression coverage in SDK tests and dashboard snippet tests to prevent drift back to low-level examples.

## Verification notes

Required gate commands:

- `npm run typecheck -w @dyno/sdk-ts` -> pass
- `npm run test -w @dyno/sdk-ts` -> pass (35 tests)
- `npm run typecheck -w dashboard-web` -> pass
- `npm run test -w dashboard-web --if-present` -> pass (no `test` script present, so command exited cleanly with `--if-present`)

Manual verification:

- Confirmed dashboard default snippet does not contain `dyno.sdk.createJob(...)`.
- Confirmed docs quickstart shows GA methods (`Dyno.init`, `embedText`/`embedTexts`, `getStatus`, `shutdown`) as the default contract.
