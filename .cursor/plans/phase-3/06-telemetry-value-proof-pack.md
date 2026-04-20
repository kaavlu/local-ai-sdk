# Stage: Telemetry value proof-pack for pilots

## Stage name

**phase3-telemetry-proof-pack** (`06-telemetry-value-proof-pack.md`)

## Objective

Turn existing SDK/dashboard telemetry into a repeatable pilot value proof-pack that sales and engineering can use for company pitches.

## Why this stage exists

You already emit useful telemetry and show directional signals. Phase 3 needs to package this into a standardized “before vs after Dyno” story with transparent caveats and sample-size confidence.

## Dependencies on earlier stages

- Depends on: [05-managed-config-auth-resolver-unification.md](./05-managed-config-auth-resolver-unification.md)
- Builds on: [../phase-2/04-dashboard-local-first-signals.md](../phase-2/04-dashboard-local-first-signals.md)
- Builds on: [../phase-2/05-config-and-telemetry-hardening.md](../phase-2/05-config-and-telemetry-hardening.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/telemetry-http-sink.ts](../../../packages/sdk-ts/src/telemetry-http-sink.ts) | Telemetry event transport semantics |
| [apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) | Telemetry ingest and persistence behavior |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Value summary and operational signal calculations |
| [apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx) | Existing signal presentation |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | Operational readiness framing |
| [apps/sdk-phase2-demo/tests/sdk-phase2-demo.test.cjs](../../../apps/sdk-phase2-demo/tests/sdk-phase2-demo.test.cjs) | Demo validation harness to evolve into proof workflows |
| [README.md](../../../README.md) | Canonical interpretation caveats |

## Files and directories likely to change

- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/lib/data/project-page-view-model.test.ts`
- `apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx`
- `apps/control-plane-api/src/server.ts`
- `packages/sdk-ts/src/telemetry-http-sink.ts`
- `apps/sdk-phase2-demo/README.md`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Define pilot KPI schema**  
   Standardize key metrics for local hit rate, fallback reasons, reliability trend, and estimated cost impact.

2. **Add confidence and caveat semantics**  
   Make sample-size and directional caveats explicit in outputs and UI.

3. **Create proof-pack export workflow**  
   Provide a reproducible report format (JSON/CSV/markdown summary) for weekly pilot reviews.

4. **Harden telemetry interpretation logic**  
   Ensure aggregation and bucket logic remains stable and test-covered.

5. **Wire proof-pack narrative into docs/demo**  
   Document exactly how to collect and present pilot evidence.

## Risks and failure modes

- Over-claiming precision on best-effort telemetry.
- Drift between dashboard UI and exported evidence definitions.
- Missing sample-size guardrails leading to misleading conclusions.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run test -w dashboard-web --if-present`
- `npm run test:control-plane`
- `npm run -w sdk-phase2-demo test`
- `npm run typecheck`

Manual verification:
- Confirm pilot report includes both KPI values and directional caveat text.
- Confirm fallback reason buckets and reliability trend align between UI and exported outputs.

## Completion criteria

- [x] Pilot KPI schema is explicit and documented.
- [x] Confidence/sample-size caveats are present in UI and exports.
- [x] Repeatable proof-pack workflow exists and is documented.
- [x] Aggregation logic is test-covered and stable.

## Out of scope

- Perfect billing-grade attribution.
- Sales collateral design work outside engineering-owned artifacts.

## Status

**completed** (2026-04-20)

## Stage notes

- Added `pilot-kpi-v1` proof-pack contract in dashboard view-model output with:
  - local hit rate + sample size
  - confidence level (low/medium/high thresholds)
  - fallback reason buckets
  - reliability summary + daily trend
  - estimated cost impact fields
- Added repeatable export payloads (JSON/CSV/Markdown) generated from the same KPI source-of-truth object.
- Updated Local-first Signals UI to surface confidence and proof-pack semantics (with explicit directional caveat and threshold messaging).
- Documented pilot proof-pack workflow in `apps/sdk-phase2-demo/README.md` and root `README.md`.
- Added tests validating proof-pack schema/export alignment with operational signal aggregations.

### Verification gate results

- `npm run typecheck -w dashboard-web` ✅
- `npm run test -w dashboard-web --if-present` ✅
- `npm run test:control-plane` ✅
- `npm run -w sdk-phase2-demo test` ✅
- `npm run typecheck` ✅

### Manual verification

- Confirmed proof-pack markdown export includes KPI snapshot and directional caveat text.
- Confirmed fallback reason buckets and reliability summary/trend are exported from the same computed operational-signal structures used by the UI card.
