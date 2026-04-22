# Stage: Fallback credential boundary (app-owned default)

## Stage name

**phase6-fallback-credential-boundary** (`04-fallback-credential-boundary.md`)

## Objective

Make the **default** integration story match `AGENTS.md` §6–7 and §22: the developer’s cloud fallback credentials stay **app-owned**; Dyno must not **require** dashboard-managed relay of provider secrets for the common production path.

Today the dashboard resolver can return decrypted `upstream_api_key` to the SDK client (`apps/dashboard-web/lib/server/sdk-config-resolver.ts`). Even if convenient, it blurs the product story unless framed as **explicitly optional / advanced**.

## Why this stage exists

External audiences will ask one question: “Where does my OpenAI key live?” If the honest answer is “your app, by default” but the UI pushes “paste key into Dyno,” you lose trust alignment with your own architecture doc.

## Dependencies on earlier stages

- Depends on: [01-golden-path-quickstart.md](./01-golden-path-quickstart.md) (docs must not contradict product boundary)
- Depends on: [03-default-telemetry-backhaul.md](./03-default-telemetry-backhaul.md) (optional—telemetry should not accidentally ship secrets in payloads)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/lib/server/sdk-config-resolver.ts](../../../apps/dashboard-web/lib/server/sdk-config-resolver.ts) | Returns `upstream_api_key` today |
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | Parses resolver JSON; may need to ignore new fields |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Fallback adapters vs HTTP convenience |
| Dashboard project config UI | Where users enter upstream provider credentials |
| [apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) | Any paths that assume dashboard-stored upstream keys |

## Files and directories likely to change

- `apps/dashboard-web/lib/server/sdk-config-resolver.ts`
- Dashboard UI components under `apps/dashboard-web/app/projects/_components/`
- `README.md` / `AGENTS.md` cross-links only if product rules need clarification (prefer not duplicating policy in README—link to AGENTS)
- Resolver response schema docs

## Detailed substeps

1. **Decide supported modes (write as product table)**  
   - **Mode A (canonical):** App passes `fallback.adapter` / `fallback.generateTextAdapter` (or HTTP wrapper fed by app env). Resolver returns **policy only** (use case, strategy, flags, model *identifiers*), not secrets.  
   - **Mode B (optional hosted assist):** Dashboard stores encrypted upstream key for **sandbox / team server** deployments; SDK may omit adapters **only** when this mode is explicitly enabled on the project. Name it (e.g. “hosted upstream relay (non-default)”).

2. **Resolver contract change**  
   - Default: omit `upstream_api_key` from JSON **or** send `null` only when feature flag off.  
   - When Mode B enabled: include key (still consider transport security, caching implications from Phase 6 stage 2).

3. **SDK behavior**  
   - Ensure SDK never logs resolver JSON.  
   - If resolver stops shipping keys, verify `Dyno.init` examples still work with adapters only.

4. **Dashboard UX**  
   - Move “paste OpenAI key” behind advanced accordion with explicit warning: not the canonical end-user device path.  
   - Prefer copy that teaches adapter-first pattern from `packages/sdk-ts/README.md`.

5. **Migration / backwards compatibility**  
   - Existing projects with stored keys: continue to work in Mode B or prompt reconfiguration.  
   - Document breaking change if any consumer relied on resolver returning keys for client-side fallback.

6. **Tests**  
   - Resolver unit/integration: default project does not leak key in response body snapshot.  
   - SDK managed provider: parses config without upstream key fields.

## Risks and failure modes

- Control-plane proxy routes may still assume dashboard-stored upstream—reconcile narratives (`README.md` control-plane section).
- Electron demo currently uses `DYNO_FALLBACK_*` env vars—good; ensure it remains the showcased default in docs.

## Cursor verification gate

- `npm run test` in affected workspaces (`dashboard-web` server tests, `sdk-ts` if parser changes)
- Manual: create new project; confirm golden path docs never require pasting provider key into Dyno for local-first demo

## Completion criteria

- [x] Canonical story documented: app-owned fallback credentials by default.
- [x] Resolver behavior and dashboard UI match the chosen Mode A/B rules without contradiction.
- [x] No accidental secret persistence in SDK disk cache (if stage 2 landed).

## Out of scope

- Removing hosted OpenAI-compatible proxy entirely (secondary lane remains valid per AGENTS.md §12).
- Multi-tenant KMS hardening beyond current encrypt-at-rest approach (unless you already planned it).

## Status

**completed** (2026-04-22)

## Stage notes

- Decision: Mode B is named **Hosted upstream relay (non-default)**.
- Flag location: resolver includes `upstream_api_key` only when `DYNO_ENABLE_HOSTED_UPSTREAM_KEY_RELAY=true|1|yes`.
- Default behavior now enforces Mode A: resolver omits `upstream_api_key`; SDK fallback credentials remain app-owned.
- Dashboard runtime configuration copy now frames hosted key storage as optional advanced usage, not required setup.
- Setup readiness now depends on fallback URL/model plus Dyno project API key; hosted relay key is not required for first success.
- Compatibility note: environments that relied on resolver key relay must explicitly enable `DYNO_ENABLE_HOSTED_UPSTREAM_KEY_RELAY`.
