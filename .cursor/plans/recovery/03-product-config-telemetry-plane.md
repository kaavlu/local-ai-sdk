# Stage: Product config and telemetry plane

## Stage name

**product-config-telemetry-plane** (`03-product-config-telemetry-plane.md`)

## Objective

Move from **implicit production dependence** on dashboard **`/api/demo/*`** routes toward **stable, product-named** control-plane surfaces for **SDK config distribution** and **telemetry ingestion**, consistent with [AGENTS.md](../../../AGENTS.md) §5.1, §9–10: hosted config + analytics, cache-friendly fetches, best-effort telemetry. Preserve backward compatibility via shims or dual-read where needed so migration is incremental.

## Why this stage exists

Today `apps/control-plane-api` resolves project config via `GET {DYNO_CONFIG_RESOLVER_URL}/api/demo/project-config/:id` ([apps/control-plane-api/src/project-context.ts](../../../apps/control-plane-api/src/project-context.ts)) and authenticates via `POST .../api/demo/auth/resolve-api-key` ([apps/control-plane-api/src/auth/api-key-auth.ts](../../../apps/control-plane-api/src/auth/api-key-auth.ts)). The SDK’s `HttpDemoConfigProvider` targets the same demo paths. That coupling is **accurate for demos** but wrong as the long-term **SDK config contract** name and semantics. Stage 3 introduces explicit product routes and wires telemetry to existing persistence where it already exists.

## Dependencies on earlier stages

- **[01-sdk-first-contract-and-fallback.md](./01-sdk-first-contract-and-fallback.md)** — SDK must define `ProjectConfigProvider` / telemetry sink shapes to implement against real HTTP.
- **[02-local-runtime-reliability-guardrails.md](./02-local-runtime-reliability-guardrails.md)** — Telemetry payloads should include **decision reasons** and paths (`local` | `cloud`) consistent with orchestration behavior, not proxy-only headers.

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/api/demo/project-config/[projectId]/route.ts](../../../apps/dashboard-web/app/api/demo/project-config/[projectId]/route.ts) | Resolver: Supabase project + config, decrypts upstream key for server-side consumers |
| [apps/dashboard-web/app/api/demo/auth/resolve-api-key/route.ts](../../../apps/dashboard-web/app/api/demo/auth/resolve-api-key/route.ts) | API key → `projectId` for control plane |
| [apps/control-plane-api/src/project-context.ts](../../../apps/control-plane-api/src/project-context.ts) | Fetches resolver URL; merges env fallbacks `DYNO_UPSTREAM_*` |
| [apps/control-plane-api/src/auth/api-key-auth.ts](../../../apps/control-plane-api/src/auth/api-key-auth.ts) | Bearer → resolver |
| [apps/control-plane-api/src/persistence/request-executions.ts](../../../apps/control-plane-api/src/persistence/request-executions.ts) | Supabase `request_executions` insert |
| [apps/dashboard-web/lib/data/dashboard-data.ts](../../../apps/dashboard-web/lib/data/dashboard-data.ts) | Reads `request_executions` for dashboard |
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | Client to migrate off `/api/demo/` prefix |

## Files and directories likely to change

- `apps/dashboard-web/app/api/**` — new routes (e.g. non-`demo` namespace) or thin wrappers
- `apps/control-plane-api/src/project-context.ts`, `src/auth/api-key-auth.ts` — configurable path segments or new env vars for product URLs
- `packages/sdk-ts/**` — HTTP provider implementation for config; telemetry POST client
- Supabase migrations (if any) — **only if** new tables/columns required; prefer reusing `request_executions` and existing project tables first

## Detailed substeps (grounded in repo)

1. **Name the product routes**  
   Choose paths (e.g. `/api/v1/project-config/:id`, `/api/v1/auth/resolve-api-key`) that are **not** labeled `demo`. Document required headers (`x-dyno-demo-secret` analog → product secret header name).

2. **Implement dashboard handlers**  
   Option A: move logic from existing `route.ts` files into shared modules and call from both old and new routes. Option B: new routes re-export with deprecation comment on `/api/demo/*`. Ensure **no accidental broadening** of who can read decrypted upstream keys — AGENTS.md §6: SDK on device must not require Dyno to relay provider secrets to end-user devices for the **default** architecture; server-side resolver for **hosted** proxy may still exist — document which audience each route serves.

3. **Update control-plane-api clients**  
   Replace hardcoded `/api/demo/...` strings in [project-context.ts](../../../apps/control-plane-api/src/project-context.ts) and [api-key-auth.ts](../../../apps/control-plane-api/src/auth/api-key-auth.ts) with env-based paths or base path + suffix constants.

4. **SDK HTTP config provider**  
   Point stage 1’s config provider implementation at the new URLs; keep `HttpDemoConfigProvider` as deprecated alias if needed.

5. **Telemetry ingestion**  
   Define POST body schema for SDK-emitted events (project id, execution path, reason, latency, optional request id). Either:
   - extend `apps/control-plane-api` with a small `POST /telemetry/events` (or attach to existing service), or
   - add Next route under `dashboard-web` that writes to Supabase tables compatible with dashboard queries.  
   Reuse patterns from [request-executions.ts](../../../apps/control-plane-api/src/persistence/request-executions.ts) where fields align.

6. **Migration and env**  
   Document `DYNO_CONFIG_RESOLVER_URL` behavior: old path vs new path; deprecation timeline for `/api/demo/*` consumers.

7. **Tests**  
   Extend or add tests near [apps/control-plane-api/src/__tests__/](../../../apps/control-plane-api/src/__tests__/) for resolver URL construction; dashboard route tests if present.

## Risks and failure modes

- **Security regression:** new routes exposing upstream keys to wrong clients — mirror existing secret-header checks from demo routes.
- **Dual maintenance:** long period of two parallel paths — mitigate with shared handler modules.
- **Scope creep:** building full analytics pipeline — stage 3 only needs **minimal** ingest + dashboard visibility path per AGENTS.md §10 (directional).

## Validation steps

- Control plane starts with resolver pointed at new dashboard URLs; existing OpenAI routes still authenticate and resolve config.
- SDK (stage 1) fetches config via new provider URL in dev.
- Telemetry events appear in Supabase (or chosen store) and are listable by existing or minimally extended dashboard queries.

## Completion criteria

- [x] Product-named config (and auth resolve) routes exist on `dashboard-web` **or** documented alternative host, with shared logic with legacy `/api/demo/*` where applicable.
- [x] `apps/control-plane-api` uses configurable paths not hardcoded to `/api/demo/...` only.
- [x] `packages/sdk-ts` uses the product config HTTP surface for the primary integration path.
- [x] Telemetry ingestion path exists for SDK-emitted events, best-effort, aligned with §10.
- [x] `/api/demo/*` is explicitly **legacy/shim**, not the only supported name.

## Out of scope

- Full billing metering — AGENTS.md allows directional telemetry first
- Dashboard UX rewrite — **stage 4**
- Proxy feature governance — **stage 5**
- Demo app and package rename — **stage 6**

## Status

**completed** (2026-04-15)

## Implementation notes

- Added product resolver routes on dashboard-web:
  - `GET /api/v1/project-config/[projectId]`
  - `POST /api/v1/auth/resolve-api-key`
- Kept `/api/demo/*` routes as explicit legacy shims with shared handler modules.
- Shared resolver secret handling now supports:
  - `DYNO_CONFIG_RESOLVER_SECRET` (preferred) with fallback to `DYNO_DEMO_CONFIG_RESOLVER_SECRET`
  - `DYNO_CONFIG_RESOLVER_SECRET_HEADER` defaulting to `x-dyno-control-plane-secret`
  - legacy `x-dyno-demo-secret` request header still accepted for migration safety.
- `control-plane-api` resolver URLs are now path-configurable:
  - `DYNO_CONFIG_RESOLVER_AUTH_PATH` (default `/api/v1/auth/resolve-api-key`)
  - `DYNO_CONFIG_RESOLVER_PROJECT_CONFIG_PATH` (default `/api/v1/project-config`)
- Added best-effort telemetry ingest endpoint:
  - `POST /telemetry/events` in `apps/control-plane-api`
  - accepts single event, array, or `{ events: [] }`
  - maps SDK telemetry fields to existing `request_executions` persistence shape.
- SDK additions:
  - `HttpProjectConfigProvider` (primary HTTP resolver provider)
  - `HttpDemoConfigProvider` kept as deprecated alias
  - `createHttpTelemetrySink()` for best-effort POST telemetry transport.
- Updated README with product routes, path override env vars, and legacy compatibility notes.
