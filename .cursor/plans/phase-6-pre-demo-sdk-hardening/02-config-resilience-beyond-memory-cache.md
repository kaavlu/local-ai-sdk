# Stage: Config resilience beyond in-memory cache

## Stage name

**phase6-config-disk-resilience** (`02-config-resilience-beyond-memory-cache.md`)

## Objective

Ensure project config loaded via the managed resolver survives **process restarts** and short **control-plane outages** per `AGENTS.md` (“cache the latest known good config locally; continue operating using cached config if Dyno is temporarily unreachable”).

Today `CachedProjectConfigProvider` is **in-memory only** (`packages/sdk-ts/src/embeddings-runtime.ts`), which helps within a single process but not across restarts or long offline windows.

## Why this stage exists

Demos and pilots will hit flaky Wi‑Fi, laptop sleep, and dev server restarts. If the first request after restart hard-fails because the resolver is down and there is no cold LKG, Dyno feels **less reliable than cloud-only**.

## Dependencies on earlier stages

- Depends on: [01-golden-path-quickstart.md](./01-golden-path-quickstart.md) (env + resolver URL story must be stable)
- Builds on: [../phase-3/05-managed-config-auth-resolver-unification.md](../phase-3/05-managed-config-auth-resolver-unification.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | `CachedProjectConfigProvider`, TTL/stale semantics |
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | Resolver fetch, errors, parsing |
| [packages/sdk-ts/src/generation-runtime.ts](../../../packages/sdk-ts/src/generation-runtime.ts) | Same provider wiring for generation |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Where managed provider is composed |

## Files and directories likely to change

- `packages/sdk-ts/src/embeddings-runtime.ts` (extract or extend cache layer)
- New file e.g. `packages/sdk-ts/src/project-config-disk-cache.ts` (recommended) — keep responsibilities clear
- `packages/sdk-ts/src/dyno.ts` — pass cache options if you add `DynoInitOptions` fields
- `packages/sdk-ts/src/index.ts` — export types if apps need to configure cache paths
- Tests under `packages/sdk-ts/src/__tests__/`

## Detailed substeps

1. **Specify cache semantics in writing (product rules)**  
   Define:
   - **TTL** (fresh fetch interval): default can stay aligned with current in-memory (~30s) or explicit override.
   - **max stale on error**: how long LKG may be used when resolver fails.
   - **cold start**: behavior when no cache exists and resolver fails (fail fast vs degraded mode—pick one and document).

2. **Choose storage backend(s)**  
   - **Node / Electron / server:** file under user config dir or `app.getPath('userData')` pattern for demos.  
   - **Browser:** `localStorage` / IndexedDB if you ever ship browser SDK—may be out of scope; if so, document “Node-only durable cache v1”.

3. **Define cache key**  
   Include at least: `projectId` (from resolved config), `configResolverUrl` origin, and schema version string so you can invalidate on breaking resolver shape changes.

4. **Implement a `ProjectConfigProvider` decorator**  
   Wrap `ManagedProjectConfigProvider` (or wrap `CachedProjectConfigProvider`) so:
   - On successful fetch: persist serialized `ProjectConfig` + metadata (`loadedAt`, `etag` if you add HTTP caching later).
   - On fetch failure: if disk LKG exists and age \< max stale, return LKG; else throw with existing `config_load_failed` patterns.

5. **Wire into `Dyno.init` path**  
   Expose minimal options, e.g. `projectConfigCache: { ttlMs, maxStaleMs, persistence: 'memory' | 'disk', diskPath? }` **or** env-driven defaults for demos (`DYNO_PROJECT_CONFIG_CACHE_DIR`). Prefer explicit opt-in for custom paths; sensible default for Node.

6. **Security hygiene**  
   Cached JSON should **not** include upstream provider secrets if you later stop returning them from resolver (see stage 4). If resolver still returns secrets today, document risk and optionally strip fields before disk write.

7. **Tests**  
   - Unit: decorator returns stale LKG when fetch throws.  
   - Unit: cold start throws when no cache and resolver fails.  
   - Integration-style (temp dir): persist → new provider instance → read LKG without network.

## Risks and failure modes

- Multi-process concurrent writes to same file—use atomic write (write temp + rename) or file lock strategy.
- Stale policy too aggressive → wrong policy applied silently; too conservative → defeats “resilient” story.

## Cursor verification gate

- `npm run test -w @dynosdk/ts`
- `npm run typecheck -w @dynosdk/ts`
- Manual: stop dashboard, confirm SDK still runs embeddings/generation using LKG within max stale window; confirm fail-fast outside window.

## Completion criteria

- [x] Durable LKG config cache exists for managed onboarding path (Node).
- [x] Semantics (TTL, max stale, cold start) documented in README golden path.
- [x] Automated tests cover success, stale-on-error, and cold-start failure.

## Out of scope

- Full offline editing of project config on device.
- Cross-device sync of config.

## Status

**completed** (2026-04-22)

## Stage notes

- Implemented Node durable project-config cache in `CachedProjectConfigProvider` with atomic write (`temp + rename`) and schema/versioned records.
- Added managed cache namespace scoping using resolver origin to prevent cross-resolver collisions.
- Added optional config surface:
  - `projectConfigCache.persistence: 'memory' | 'disk'` (default `memory`)
  - `projectConfigCache.diskPath`
  - env fallback `DYNO_PROJECT_CONFIG_CACHE_DIR`
- Preserved existing semantics:
  - defaults: `ttlMs=30000`, `allowStaleOnError=true`, `maxStaleMs=600000`
  - `ttlMs=0` remains explicit no-cache/fail-fast mode
  - cold-start without any cache still fails on resolver outage
- Added automated tests for:
  - disk persistence across provider restart
  - managed runtime restart reading durable LKG when resolver is down
  - managed cold-start failure when resolver is down and no durable cache exists
