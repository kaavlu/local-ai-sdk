# Stage: SDK-first contract and fallback

## Stage name

**sdk-first-contract-and-fallback** (`01-sdk-first-contract-and-fallback.md`)

## Objective

Establish **`@dyno/sdk-ts` as the primary developer integration surface** for the canonical runtime path in [AGENTS.md](../../../AGENTS.md) §2, §5.2–5.3, §6, §8–9: App → SDK → local runtime (when viable) → **developer-owned cloud fallback** → best-effort telemetry. Today the package is primarily a thin client for `packages/agent` HTTP APIs plus demo config helpers (`createDemoProjectSdkContext`, `HttpDemoConfigProvider`, etc.); this stage defines and documents the **new contract** without requiring later stages to be finished first.

## Why this stage exists

[AGENTS.md](../../../AGENTS.md) states the SDK is the product core (§5.2, §13, §16.1) and that fallback credentials belong in the developer’s existing provider path (§6). Until the SDK exposes a **high-level orchestration API** (local attempt + bounded behavior + explicit fallback hook), downstream work (runtime hardening, config APIs, dashboard copy) will keep optimizing the wrong abstraction (`DynoSdk` job polling + demo providers).

## Dependencies on earlier stages

- **None.** This is the first execution stage.
- **Consumes existing code only:** current `packages/sdk-ts` and `packages/agent` HTTP shapes.

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | Current `DynoSdk`: jobs, health, machine state, debug endpoints |
| [packages/sdk-ts/src/types.ts](../../../packages/sdk-ts/src/types.ts) | `CreateJobRequest`, policies, job records |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public exports |
| [packages/sdk-ts/src/config-provider.ts](../../../packages/sdk-ts/src/config-provider.ts) | `DemoProjectConfig`, `mapStrategyPresetToScheduling`, demo-only framing |
| [packages/sdk-ts/src/demo-project-sdk.ts](../../../packages/sdk-ts/src/demo-project-sdk.ts) | `createDemoProjectSdkContext`, `deriveSchedulingFromDemoProject` |
| [packages/sdk-ts/src/demo-http-config-provider.ts](../../../packages/sdk-ts/src/demo-http-config-provider.ts) | HTTP resolver client (dashboard `/api/demo/...`) |
| [packages/sdk-ts/package.json](../../../packages/sdk-ts/package.json) | Package description and entrypoints |
| [README.md](../../../README.md) | Documents `DynoSdk` vs demo helpers |
| [AGENTS.md](../../../AGENTS.md) §16.1, §16.5 | SDK contract and fallback integration priorities |

## Files and directories likely to change

- `packages/sdk-ts/src/**/*.ts` — new primary API module(s), types, optional re-export layout
- `packages/sdk-ts/src/index.ts` — export map for “primary” vs “advanced” surfaces
- `packages/sdk-ts/package.json` — description/exports if the public surface splits
- `README.md` (root) — only if SDK usage section must reflect the new primary API

## Detailed substeps (grounded in repo)

1. **Inventory current public surface**  
   List everything exported from `packages/sdk-ts/src/index.ts` and classify: (a) agent transport, (b) demo config, (c) strategy→scheduling helpers. Confirm what `apps/demo-electron` imports from `@dyno/sdk-ts` ([apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts)) as a consumer reference.

2. **Specify the primary API shape (design-only in this plan file until implementation)**  
   Define the minimal contract aligned with AGENTS.md:
   - Entry points for **one supported use case first** (embeddings matches existing agent `embed_text` and demo path).
   - Explicit **fallback adapter** type: async function or interface the app implements using **its** OpenAI/Gemini client (no Dyno-shipped provider secrets on the device).
   - Outputs that include **decision** (`local` | `cloud`) and **reason** string for future telemetry (stage 3).

3. **Config loading abstraction (in-process, pluggable)**  
   Today config arrives via `ConfigProvider` + demo HTTP/Supabase providers. Specify a **`ProjectConfigProvider`** (name TBD) that stage 3 will later back with HTTP, but stage 1 can implement against:
   - in-memory fixture, or
   - existing `HttpDemoConfigProvider` **only as a temporary implementation** behind the new interface, clearly marked transitional.

4. **Caching semantics (AGENTS.md §9)**  
   Document behavior for: initial fetch, refresh cadence hooks, “last known good” retention, behavior when provider throws (use cached policy if available). Implementation can be minimal (e.g. single in-memory cache + TTL) as long as the **interface** supports growth.

5. **Map dashboard policy fields to SDK inputs**  
   Cross-check `DemoProjectConfig` / future config types against [apps/dashboard-web/lib/data/dashboard-types.ts](../../../apps/dashboard-web/lib/data/dashboard-types.ts) and strategy presets used in [apps/dashboard-web/lib/data/dashboard-data.ts](../../../apps/dashboard-web/lib/data/dashboard-data.ts) so the SDK does not invent parallel enums.

6. **Demote demo helpers in documentation order**  
   Plan export structure so `createDemoProjectSdkContext` and `HttpDemoConfigProvider` are not the first thing importers see (e.g. `advanced` or `demo` subpath in docs/exports — actual rename in stage 6 if needed).

7. **Telemetry hook (no backend dependency yet)**  
   Define a client-side `TelemetrySink` or callback list (fire-and-forget) matching AGENTS.md §10 (best-effort). Stub implementation acceptable; real HTTP in stage 3.

## Risks and failure modes

- **Scope creep:** implementing full multi–use-case coverage before one embeddings path works end-to-end.
- **Secret leakage:** accidentally designing the primary API to require upstream API keys from Dyno on device — violates AGENTS.md §6, §40.
- **Parallel universes:** new high-level API bypassing `DynoSdk` entirely vs thin wrapper — pick one layering approach and document it to avoid two clients.
- **Breaking changes:** existing `demo-electron` and tests may need updates when exports move; mitigate with re-exports during transition.

## Validation steps

- `npm run typecheck -w @dyno/sdk-ts` (when implementation exists) passes.
- A short **design note** or README section lists: primary import path, fallback adapter signature, config provider interface, telemetry hook.
- Manual trace: “app calls X → SDK may call agent `/jobs` → else calls fallback adapter” with no Dyno-hosted OpenAI URL in the primary path.

## Completion criteria

- [ ] Primary SDK API is **specified and implemented** in `packages/sdk-ts` for at least **embeddings** (or the single chosen vertical slice), including developer-owned fallback and optional config/telemetry interfaces.
- [ ] `DynoSdk` remains available for advanced/job-level control **or** is clearly wrapped by the new API without duplicating conflicting semantics.
- [ ] Demo-specific modules are no longer the documented default path for new integrations.
- [ ] Alignment with [AGENTS.md](../../../AGENTS.md) §2, §5.2, §6, §8–9 is explicit in package docs.

## Out of scope

- Product-grade HTTP config routes (`/api/demo/*` replacement) — **stage 3**
- Agent timeout/hardening details — **stage 2** (SDK may stub timeouts here)
- Dashboard and website copy — **stage 4**
- OpenAI proxy behavior in `apps/control-plane-api` — **stage 5**
- Renaming `apps/dashboard-web` package name — **stage 6**

## Status

**pending**
