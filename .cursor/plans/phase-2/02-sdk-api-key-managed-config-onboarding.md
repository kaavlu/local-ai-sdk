# Stage: SDK projectApiKey managed config onboarding

## Stage name

**phase2-sdk-managed-config-onboarding** (`02-sdk-api-key-managed-config-onboarding.md`)

## Objective

Introduce a first-class SDK initialization path where a developer can start with **`projectApiKey` + fallback adapter** and does not need to hand-roll `ProjectConfigProvider` for normal integrations. Keep the AGENTS architecture intact: local-first on-device decisioning, developer-owned fallback execution path, and best-effort telemetry.

## Why this stage exists

Phase 2 stage 1 stabilized the embeddings contract, reasons, and fallback semantics. However, integration ergonomics are still too low-level because developers must wire `projectConfigProvider` directly before they can run meaningful requests. This stage upgrades the default SDK experience to managed config loading/caching while preserving developer ownership of cloud fallback logic.

## Dependencies on earlier stages

- Depends on [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) for stable reason taxonomy and fallback behavior.
- Builds on completed recovery stages:
  - [../recovery/01-sdk-first-contract-and-fallback.md](../recovery/01-sdk-first-contract-and-fallback.md)
  - [../recovery/03-product-config-telemetry-plane.md](../recovery/03-product-config-telemetry-plane.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | Current constructor contract requiring `ProjectConfigProvider` |
| [packages/sdk-ts/src/config-provider.ts](../../../packages/sdk-ts/src/config-provider.ts) | Provider interfaces and cache behavior |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public exports for SDK integration surface |
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | Existing HTTP config resolution behavior to reuse or refactor |
| [packages/sdk-ts/src/demo.ts](../../../packages/sdk-ts/src/demo.ts) | Demo-only entry points and compatibility boundaries |
| [apps/dashboard-web/app/api/v1/auth/resolve-api-key/route.ts](../../../apps/dashboard-web/app/api/v1/auth/resolve-api-key/route.ts) | Product auth resolver surface for project API key flow |
| [apps/dashboard-web/app/api/v1/project-config/[projectId]/route.ts](../../../apps/dashboard-web/app/api/v1/project-config/[projectId]/route.ts) | Project config resolver used by managed provider |
| [README.md](../../../README.md) | Canonical onboarding snippets and positioning |

## Files and directories likely to change

- `packages/sdk-ts/src/embeddings-runtime.ts`
- `packages/sdk-ts/src/config-provider.ts`
- `packages/sdk-ts/src/index.ts`
- `packages/sdk-ts/src/demo-http-config-provider.ts`
- `packages/sdk-ts/src/demo.ts`
- `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Add a managed onboarding constructor path**  
   Add a high-level runtime init option that accepts:
   - `projectApiKey` (required for managed mode)
   - resolver base URL/path options (optional overrides)
   - optional cache controls  
   without requiring direct `projectConfigProvider` plumbing for standard usage.

2. **Keep advanced provider path as an explicit override**  
   Preserve current `projectConfigProvider` support for advanced/custom deployments while making managed mode the default recommendation in docs and examples.

3. **Implement built-in projectApiKey resolver flow**  
   SDK-managed provider should:
   - resolve API key to project identity/authorization context via product auth route
   - fetch project config from product config route
   - apply current cache semantics (TTL, stale rules, no-cache mode support)
   - fail with typed, actionable errors for auth/config resolver failures

4. **Preserve developer-owned fallback boundary**  
   Do not auto-adopt upstream provider credentials from project config for client/device SDK execution path.  
   The standard contract remains:
   - SDK decides local vs cloud
   - developer-provided fallback adapter executes cloud call
   - Dyno config provides policy/strategy signals, not fallback authority in common path.

5. **Harden resolver/network error taxonomy**  
   Add stable SDK error mapping for:
   - invalid or revoked project API key
   - resolver unreachable/timeouts
   - malformed resolver payload
   - project config not found  
   so app developers can debug onboarding failures quickly.

6. **Add migration-safe API ergonomics**  
   Ensure existing integrations using direct `ProjectConfigProvider` do not break.  
   Add deprecation guidance where needed, but avoid sudden API removal in Phase 2.

7. **Update canonical docs and snippets**  
   In README and docs, make the default integration shape:
   1) instantiate with `projectApiKey`  
   2) provide fallback adapter  
   3) call `embedText`/`embedTexts`  
   while documenting the advanced custom-provider override as secondary.

8. **Expand tests for onboarding pathways**  
   Add coverage for:
   - managed onboarding success path
   - bad project API key handling
   - resolver outage with stale cache reuse
   - cold start failure in no-cache mode
   - parity between managed and custom-provider mode for decision/reason outputs

## Risks and failure modes

- **Security boundary drift:** accidental SDK behavior that treats project config as cloud-execution authority on device.
- **Migration regressions:** existing explicit-provider integrations break due to constructor/API changes.
- **Resolver coupling:** managed mode becomes brittle if resolver payloads are not versioned or validated.
- **Hidden latency:** managed auth+config fetch adds startup latency without good caching defaults.

## Validation steps

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- Managed integration smoke test:
  - instantiate runtime with only `projectApiKey` + fallback adapter
  - validate local success, readiness fallback, and adapter error surfaces
- Backward-compat smoke test:
  - instantiate runtime with explicit `ProjectConfigProvider`
  - verify behavior parity with managed mode for equivalent project config

## Completion criteria

- [x] SDK supports a first-class managed onboarding flow (`projectApiKey`) with no custom provider required for standard use.
- [x] Developer-owned fallback adapter remains required in the canonical path and is clearly documented.
- [x] Managed-mode resolver/auth/config failures map to stable, actionable SDK errors.
- [x] Existing explicit-provider integrations remain backward compatible.
- [x] Docs default to managed onboarding and relegate custom provider wiring to advanced usage.

## Out of scope

- Automatically executing cloud fallback with Dyno-managed provider secrets in on-device/client SDK path.
- Broad non-embeddings workload expansion in this stage.
- Dashboard UI feature work (covered by later stages).

## Status

**completed**

## Implementation notes

- Added managed runtime init mode on `DynoEmbeddingsRuntime` (`projectApiKey`, resolver URL/path overrides, resolver transport timeout/fetch overrides, and cache controls).
- Preserved explicit `projectId + projectConfigProvider` mode and constructor behavior for existing integrations.
- Added `ManagedProjectConfigProvider` and `ManagedResolverError` with stable resolver error codes:
  - `invalid_project_api_key`
  - `revoked_project_api_key`
  - `resolver_unreachable`
  - `resolver_timeout`
  - `resolver_payload_invalid`
  - `project_config_not_found`
  - `resolver_unauthorized`
  - `resolver_internal_error`
- Kept fallback execution boundary developer-owned (`cloudFallback` remains required and authoritative for cloud execution).
- Updated SDK exports and README onboarding docs to make managed mode the default path and custom provider mode advanced.
- Expanded SDK tests for managed onboarding success/failure/cache/reliability and parity with explicit-provider mode.

## Post-implementation QA notes

- Added additional managed resolver edge-case coverage for revoked keys, `404` config lookup, malformed payload mapping, timeout mapping, and auth-call reuse across config refreshes.
- Fixed bug: malformed-but-JSON project config payloads were surfacing generic parser messages instead of stable `resolver_payload_invalid` taxonomy. Managed provider now wraps config payload parse failures into `ManagedResolverError('resolver_payload_invalid')`.
