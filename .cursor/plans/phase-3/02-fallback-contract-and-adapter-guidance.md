# Stage: Fallback contract and adapter guidance

## Stage name

**phase3-fallback-contract** (`02-fallback-contract-and-adapter-guidance.md`)

## Objective

Define one explicit fallback contract where cloud fallback is app-owned, adapter-first, and predictable under failure/timeout conditions.

## Why this stage exists

Fallback behavior is central to trust. Prospects must clearly understand what Dyno owns vs what their app owns, especially around provider credentials and runtime failure paths.

## Dependencies on earlier stages

- Depends on: [01-sdk-ga-contract-and-surface-hardening.md](./01-sdk-ga-contract-and-surface-hardening.md)
- Builds on: [../phase-2/01-embeddings-sdk-contract-v1.md](../phase-2/01-embeddings-sdk-contract-v1.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Convenience fallback config and adapter wiring |
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | Fallback invocation and reason taxonomy |
| [packages/sdk-ts/src/types.ts](../../../packages/sdk-ts/src/types.ts) | Public reason and result types |
| [README.md](../../../README.md) | Fallback ownership and integration examples |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Public guidance consistency |

## Files and directories likely to change

- `packages/sdk-ts/src/dyno.ts`
- `packages/sdk-ts/src/embeddings-runtime.ts`
- `packages/sdk-ts/src/types.ts`
- `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts`
- `README.md`
- `apps/website/app/docs/page.tsx`

## Detailed substeps (grounded in repo)

1. **Formalize adapter-first default**  
   Make `fallback.adapter` the primary documented fallback contract.

2. **Retain convenience HTTP fallback path**  
   Keep `baseUrl/apiKey/model` helper but position as convenience wrapper.

3. **Document ownership boundary**  
   Clearly state credentials stay app-owned and Dyno does not become a provider-secret relay.

4. **Stabilize failure semantics**  
   Document and test timeout/error precedence and reason outputs for:
   - local failure + fallback success
   - local failure + fallback timeout
   - local failure + fallback adapter error
   - fallback disabled

5. **Publish fallback contract examples**  
   Add one wrapper example using an existing provider client.

## Risks and failure modes

- Docs imply Dyno owns credentials in default flow.
- Error reason behavior becomes ambiguous across local/fallback failures.
- Different snippets represent different fallback contracts.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- `npm run typecheck`

Manual verification:
- Confirm all quickstarts describe fallback credentials as app-owned.
- Confirm adapter-first example exists and compiles.

## Completion criteria

- [x] Fallback contract is explicit, adapter-first, and documented.
- [x] Convenience HTTP fallback remains supported but clearly secondary.
- [x] Reason/error semantics are stable and test-covered.
- [x] Public docs consistently reflect app-owned credentials boundary.

## Out of scope

- New provider integrations as first-class SDK dependencies.
- Hosted proxy feature expansion.

## Status

**completed**

## Stage notes

- Updated `DynoFallbackConfig` and `DynoInitOptions` docs to make `fallback.adapter` the default contract and `baseUrl/apiKey` a convenience wrapper.
- Kept convenience HTTP fallback path intact in `Dyno.buildFallbackAdapter(...)`.
- Formalized fallback failure-reason normalization in `embeddings-runtime` (`fallback_adapter_timeout` takes precedence when timeout marker is present; otherwise `fallback_adapter_error`).
- Added test coverage for required fallback failure paths:
  - local failure + fallback timeout
  - local failure + fallback adapter error
  - local failure + fallback disabled
- Updated root docs and website docs to show adapter-first examples with app-owned credentials while retaining convenience-wrapper guidance.

## Verification results

- `npm run typecheck -w @dyno/sdk-ts` -> pass
- `npm run test -w @dyno/sdk-ts` -> pass (37 tests)
- `npm run typecheck` -> pass
- Manual docs verification:
  - Quickstart docs now state fallback credentials are app-owned and passed via `fallback.adapter`.
  - Adapter-first example added; convenience wrapper path retained as secondary guidance.

## Follow-up tasks

- Consider adding a dedicated typed fallback error result surface (instead of message-token parsing) in a future stage if consumers need structured timeout/disabled/adapter-error handling without regex matching.
