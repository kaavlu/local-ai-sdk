# SDK Phase-2 Demo (Old vs New)

This lightweight demo app exists to validate the phase-2 SDK migration:

- `src/old-gemini-embeddings.cjs`: old direct Gemini embeddings integration
- `src/new-dyno-embeddings.cjs`: new `Dyno.init(...)` integration with zero runtime knobs

## Run

From repo root:

- `npm run -w sdk-phase2-demo test`
- `npm run -w sdk-phase2-demo run:old`
- `npm run -w sdk-phase2-demo run:new`
- `npm run -w sdk-phase2-demo run:compare`

## Environment for manual runs

Old path:

- `GEMINI_API_KEY`
- optional `GEMINI_BASE_URL`
- optional `GEMINI_MODEL`

New Dyno path:

- `DYNO_PROJECT_API_KEY` (or `DYNO_API_KEY`)
- optional `DYNO_CONFIG_RESOLVER_URL` (default `http://127.0.0.1:3000`)
- optional `DYNO_AGENT_URL` (default `http://127.0.0.1:8787`)
- `DYNO_FALLBACK_BASE_URL`
- `DYNO_FALLBACK_API_KEY`
- optional `DYNO_FALLBACK_MODEL`

Note: automated tests spin up mock resolver/runtime/fallback services and do not require external credentials.

## Pilot telemetry proof-pack workflow

Use this demo to produce a repeatable "before vs after Dyno" evidence package for pilot check-ins:

1. Run `npm run -w sdk-phase2-demo run:old` to capture baseline cloud-only behavior.
2. Run `npm run -w sdk-phase2-demo run:new` to capture Dyno local-first behavior.
3. Open the dashboard project page and review the **Local-first Signals** card.
4. Copy the proof-pack exports from the page view model output (JSON/CSV/Markdown) for weekly review notes.

Interpretation guardrails:

- Treat all KPI outputs as directional.
- Always include sample size and confidence level when sharing local hit rate.
- Keep fallback-reason distribution and reliability trend from the same window to avoid narrative drift.
