# Stage: Managed config/auth resolver unification

## Stage name

**phase3-resolver-unification** (`05-managed-config-auth-resolver-unification.md`)

## Objective

Unify SDK-managed auth/config resolver semantics into one production lane with consistent endpoint shapes, error codes, and environment variable conventions.

## Why this stage exists

Resolver/auth inconsistencies create onboarding friction and support ambiguity. A pitch-ready platform needs one clear managed-config path.

## Dependencies on earlier stages

- Depends on: [04-runtime-readiness-contract-and-doctor.md](./04-runtime-readiness-contract-and-doctor.md)
- Builds on: [../phase-2/05-config-and-telemetry-hardening.md](../phase-2/05-config-and-telemetry-hardening.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | SDK managed resolver behavior and error mapping |
| [apps/dashboard-web/lib/server/sdk-config-resolver.ts](../../../apps/dashboard-web/lib/server/sdk-config-resolver.ts) | Current config resolver shape |
| [apps/dashboard-web/lib/server/sdk-config-resolver.test.ts](../../../apps/dashboard-web/lib/server/sdk-config-resolver.test.ts) | Existing resolver tests |
| [apps/control-plane-api/src/auth/api-key-auth.ts](../../../apps/control-plane-api/src/auth/api-key-auth.ts) | API-key auth resolver integration |
| [apps/control-plane-api/src/project-context.ts](../../../apps/control-plane-api/src/project-context.ts) | Project config resolution semantics |
| [apps/control-plane-api/src/__tests__/project-context.test.ts](../../../apps/control-plane-api/src/__tests__/project-context.test.ts) | Resolver behavior tests |
| [README.md](../../../README.md) | Env and endpoint docs |

## Files and directories likely to change

- `packages/sdk-ts/src/demo-http-config-provider.ts`
- `apps/dashboard-web/lib/server/sdk-config-resolver.ts`
- `apps/dashboard-web/lib/server/sdk-config-resolver.test.ts`
- `apps/control-plane-api/src/auth/api-key-auth.ts`
- `apps/control-plane-api/src/project-context.ts`
- `apps/control-plane-api/src/__tests__/project-context.test.ts`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Define canonical resolver endpoints and payload contracts**  
   Stabilize request/response schemas for API key auth and SDK config fetch.

2. **Unify error taxonomy**  
   Ensure shared, predictable error codes across SDK, dashboard resolver, and control-plane.

3. **Normalize environment variable contract**  
   Publish one canonical set of resolver/auth env vars and deprecate duplicates in docs.

4. **Align timeout and retry semantics**  
   Keep bounded behavior consistent across SDK managed resolver calls.

5. **Create end-to-end resolver integration tests**  
   Add tests validating auth -> config flow and failure mapping.

## Risks and failure modes

- Partial unification leaves hidden edge-case divergence.
- Legacy env/path assumptions break local dev flows.
- Inconsistent status/code mapping between services.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- `npm run test:control-plane`
- `npm run typecheck -w dashboard-web`
- `npm run test -w dashboard-web --if-present`

Manual verification:
- Validate one happy-path request from SDK managed provider to resolver returns consistent schema.
- Validate invalid/revoked key and missing-config errors map to expected stable codes.

## Completion criteria

- [x] One canonical managed resolver/auth path is documented and implemented.
- [x] Error/status/env semantics are consistent across SDK, dashboard resolver, and control-plane.
- [x] End-to-end resolver tests cover success and key failure paths.
- [x] Documentation reflects only the canonical production lane.

## Out of scope

- New control-plane product features unrelated to managed config/auth unification.
- Backward-compat expansion beyond practical migration notes.

## Status

**completed** (2026-04-20)

## Implementation notes

- Control-plane auth/config now use a single managed resolver lane: `GET /api/v1/sdk/config` with `Authorization: Bearer <project_api_key>`.
- `apps/control-plane-api/src/auth/api-key-auth.ts` now validates and extracts bearer API key only; resolver network calls for separate auth endpoint were removed.
- `apps/control-plane-api/src/project-context.ts` now:
  - resolves config from canonical resolver path (`DYNO_CONFIG_RESOLVER_CONFIG_PATH`, default `/api/v1/sdk/config`)
  - applies bounded resolver timeout (`DYNO_CONFIG_RESOLVER_TIMEOUT_MS`, default `8000`)
  - maps resolver errors to stable codes (`invalid_api_key`, `revoked_api_key`, `project_config_not_found`, `resolver_timeout`, `resolver_unreachable`, `resolver_internal_error`)
- `apps/control-plane-api/src/server.ts` now resolves context with the project API key from auth context and preserves auth-vs-config error typing for OpenAI-compatible responses.
- Control-plane integration tests were aligned to the unified resolver path and expanded to assert failure mapping coverage.
- README control-plane docs now describe the canonical resolver lane and canonical resolver env vars.

## Validation log

- `npm run typecheck -w @dyno/sdk-ts` ✅
- `npm run test -w @dyno/sdk-ts` ✅
- `npm run test:control-plane` ✅
- `npm run typecheck -w dashboard-web` ✅
- `npm run test -w dashboard-web --if-present` ✅

Manual verification via automated integration coverage:

- happy-path managed resolver config flow validated in control-plane route tests (embeddings/chat/models) and SDK managed onboarding tests
- invalid/revoked key + missing-config mappings validated in control-plane and SDK test suites
