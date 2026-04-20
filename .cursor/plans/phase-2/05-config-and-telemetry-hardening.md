# Stage: Config and telemetry hardening

## Stage name

**phase2-config-telemetry-hardening** (`05-config-and-telemetry-hardening.md`)

## Objective

Harden product API contracts for config delivery and telemetry ingestion with schema versioning, cache-aware semantics, and validation/idempotency safeguards while keeping legacy `/api/demo/*` routes in compatibility-only mode.

## Why this stage exists

Recovery introduced product-named v1 routes and telemetry ingest, but payload evolution and reliability controls are still minimal. Phase 2 should make these APIs stable enough for iterative SDK rollout and dashboard analytics without requiring perfect telemetry.

## Dependencies on earlier stages

- Depends on [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) for stable reason/event shape.
- Depends on [02-sdk-api-key-managed-config-onboarding.md](./02-sdk-api-key-managed-config-onboarding.md) for resolver/auth assumptions in managed SDK config flow.
- Depends on [03-local-runtime-lifecycle-contract.md](./03-local-runtime-lifecycle-contract.md) for readiness/lifecycle taxonomy.
- Depends on [04-dashboard-local-first-signals.md](./04-dashboard-local-first-signals.md) for consumer expectations around telemetry fields.
- Builds on completed recovery stage [../recovery/03-product-config-telemetry-plane.md](../recovery/03-product-config-telemetry-plane.md).

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) | Telemetry route and API behavior |
| [apps/control-plane-api/src/project-context.ts](../../../apps/control-plane-api/src/project-context.ts) | Resolver and config fetch assumptions |
| [apps/control-plane-api/src/auth/api-key-auth.ts](../../../apps/control-plane-api/src/auth/api-key-auth.ts) | Resolver auth compatibility path |
| [apps/control-plane-api/src/persistence/request-executions.ts](../../../apps/control-plane-api/src/persistence/request-executions.ts) | Event persistence mapping |
| [apps/control-plane-api/src/__tests__/openai-routes.test.ts](../../../apps/control-plane-api/src/__tests__/openai-routes.test.ts) | Existing behavioral contract tests |
| [apps/dashboard-web/app/api/v1/project-config/[projectId]/route.ts](../../../apps/dashboard-web/app/api/v1/project-config/[projectId]/route.ts) | Product config endpoint |
| [apps/dashboard-web/app/api/v1/auth/resolve-api-key/route.ts](../../../apps/dashboard-web/app/api/v1/auth/resolve-api-key/route.ts) | Product auth resolve endpoint |
| [apps/dashboard-web/lib/server/project-config-resolver.ts](../../../apps/dashboard-web/lib/server/project-config-resolver.ts) | Shared resolver logic |
| [packages/sdk-ts/src/config-provider.ts](../../../packages/sdk-ts/src/config-provider.ts) | SDK consumer of config contract |
| [packages/sdk-ts/src/telemetry-http-sink.ts](../../../packages/sdk-ts/src/telemetry-http-sink.ts) | SDK telemetry sender behavior |

## Files and directories likely to change

- `apps/dashboard-web/app/api/v1/project-config/[projectId]/route.ts`
- `apps/dashboard-web/lib/server/project-config-resolver.ts`
- `apps/control-plane-api/src/server.ts`
- `apps/control-plane-api/src/persistence/request-executions.ts`
- `apps/control-plane-api/src/__tests__/openai-routes.test.ts`
- `packages/sdk-ts/src/config-provider.ts`
- `packages/sdk-ts/src/telemetry-http-sink.ts`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Version config payload contract**  
   Add `schema_version` (or equivalent) to project config responses and define SDK compatibility behavior for unknown/newer schema versions.

2. **Add cache-aware response semantics**  
   Introduce practical cache metadata (`ETag` and/or `Last-Modified`) with SDK/provider support for conditional refresh.

3. **Harden telemetry input validation**  
   Validate required fields, normalize optional fields, and reject or quarantine malformed payloads predictably.

4. **Add lightweight idempotency protection**  
   Protect ingestion against duplicate submissions (basic request key or deterministic event identity).

5. **Preserve legacy route compatibility boundary**  
   Keep `/api/demo/*` shims functional but avoid adding new behavior there; document deprecation and migration expectations.

6. **Expand integration tests**  
   Add tests for:
   - schema version compatibility paths
   - malformed telemetry payload handling
   - duplicate event ingestion behavior
   - config conditional fetch behavior

## Risks and failure modes

- **Backward-compat break:** SDK or control plane may reject older payloads unexpectedly.
- **Over-complexity:** strict validation could drop too many events in early rollout.
- **Cache misconfiguration:** stale config can outlive safe bounds if headers are wrong.

## Validation steps

- `npm run test -w control-plane-api`
- `npm run test -w @dyno/sdk-ts`
- Manual/automated verification of config fetch with unchanged payload vs changed payload.

## Completion criteria

- [ ] Config payload includes explicit schema versioning with documented compatibility behavior.
- [ ] Config endpoints support cache-aware refresh semantics.
- [ ] Telemetry ingestion validates payloads and resists duplicate writes at basic level.
- [ ] Legacy demo routes remain compatibility-only and clearly non-primary.

## Out of scope

- Full billing metering canonicalization.
- Large database redesign for analytics warehousing.
- Dashboard UX changes beyond field support needed for stage 4.

## Status

**pending**
