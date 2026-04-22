# Demo Electron (Reference Harness)

This app is a reference and regression harness for Dyno SDK and local runtime behavior.

- It is useful for sandbox testing and validation.
- It is not a production SKU and should not drive product architecture.
- Primary product integration remains SDK-first (`@dynosdk/ts`) with local-first execution plus cloud fallback.
- Runtime startup is Dyno-managed in this harness: launching the Electron app calls `Dyno.init(...)`, which resolves and starts the local runtime helper internally.
- Legacy/manual local runtime startup (`npm run dev:agent`) remains available as a compatibility/debug lane.

## Local generation demo readiness flow

Use this checklist when preparing a customer-facing local generation walkthrough:

1. Build once from the repo root:
   - `npm install`
   - `npm run build`
2. Verify SDK/runtime diagnostics:
   - `npm run doctor:sdk`
3. Run smoke validation with generation assertions:
   - `npm run test:sdk:smoke`
4. Start the demo app:
   - `npm run dev:all`
5. Wait for Dyno warmup to settle in the app status panel:
   - `Generation warmup: Warming` means startup warmup is still loading `generate_text`.
   - `Generation warmup: Ready` means first `generateText` calls should avoid cold-load penalty.
   - `Generation warmup: Failed` means local generation warmup failed and cloud fallback may be used.

`test:sdk:smoke` now performs one `generate_text` probe and validates:
- non-empty generation output
- decision metadata (`local` or `cloud`)
- reason/reasonCategory fields for troubleshooting

Default behavior is local-first and expects a local generation decision. Set `SMOKE_REQUIRE_LOCAL_GENERATION=0` only when explicitly validating cloud fallback behavior.

## Environment variables

Core:
- `DYNO_PROJECT_API_KEY`
- `DYNO_CONFIG_RESOLVER_URL` (optional override; defaults to local dashboard route)
- `DYNO_AGENT_URL` (optional advanced override)

Fallback (optional, for fallback reachability tests):
- `DYNO_FALLBACK_BASE_URL`
- `DYNO_FALLBACK_API_KEY`
- `DYNO_FALLBACK_MODEL`
- `DYNO_FALLBACK_GENERATION_MODEL`
- `DYNO_FALLBACK_GENERATE_PATH`

## Demo caveats

- The demo now starts a non-blocking generation warmup immediately after `Dyno.init(...)`.
- First local generation run can still be slower on cold machines while `Xenova/distilgpt2` loads.
- On constrained machines, memory pressure can push decisions to cloud fallback.
- If warmup fails, keep the demo moving: `generateText` can still use cloud fallback (reason metadata will explain why).
- Telemetry/readouts are directional and best-effort in this phase; use them for trend visibility, not exact accounting.
