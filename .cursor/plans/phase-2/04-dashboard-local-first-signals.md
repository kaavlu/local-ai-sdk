# Stage: Dashboard local-first signals

## Stage name

**phase2-dashboard-signals** (`04-dashboard-local-first-signals.md`)

## Objective

Upgrade dashboard project pages from integration-snippet guidance to **operational local-first visibility**: directional local hit rate, fallback reason distribution, and reliability trend, while preserving SDK-first onboarding language.

## Why this stage exists

Recovery corrected onboarding framing, but developers still need concrete confidence signals that Dyno improves cost without harming reliability. This stage translates SDK/runtime outcomes into dashboard surfaces aligned with AGENTS telemetry philosophy (useful, directional, not perfect accounting).

## Dependencies on earlier stages

- Depends on [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) for stable reason/event taxonomy.
- Depends on [02-sdk-api-key-managed-config-onboarding.md](./02-sdk-api-key-managed-config-onboarding.md) for canonical managed onboarding contract fields.
- Depends on [03-local-runtime-lifecycle-contract.md](./03-local-runtime-lifecycle-contract.md) for reliable lifecycle state mapping.
- Builds on completed recovery stage [../recovery/04-dashboard-website-sdk-first-onboarding.md](../recovery/04-dashboard-website-sdk-first-onboarding.md).

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Main page view model contract |
| [apps/dashboard-web/lib/data/project-page-view-model.test.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.test.ts) | Current assertions and snapshot semantics |
| [apps/dashboard-web/lib/data/dashboard-data.ts](../../../apps/dashboard-web/lib/data/dashboard-data.ts) | Data aggregation path from persisted events |
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Project page assembly |
| [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) | Integration guidance card |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | Setup and next-step framing |

## Files and directories likely to change

- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/lib/data/project-page-view-model.test.ts`
- `apps/dashboard-web/lib/data/dashboard-data.ts`
- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/dashboard-web/app/projects/_components/project-integration-card.tsx`
- `apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx`

## Detailed substeps (grounded in repo)

1. **Extend dashboard data model for operational signals**  
   Add fields for:
   - local hit rate (directional)
   - fallback reason buckets
   - reliability trend (timeouts/failures over time)

2. **Align reason display with SDK taxonomy**  
   Build a stable mapping layer from raw event reasons to user-facing labels to avoid UI churn from low-level naming adjustments.

3. **Add project-level signal cards**  
   Introduce compact cards/charts for local-first outcomes near integration/setup guidance.

4. **Preserve SDK-first integration hierarchy**  
   Keep integration snippets secondary to operational insight and avoid re-centering proxy-based messaging.

5. **Add directional telemetry disclaimers**  
   Clearly label estimates as directional where event completeness is not guaranteed.

6. **Expand tests for view model behavior**  
   Cover empty-state, sparse-event, and mixed local/cloud datasets plus reason bucketing logic.

## Risks and failure modes

- **Misleading certainty:** displaying incomplete telemetry as exact truth.
- **Taxonomy drift:** UI labels break if SDK reason values are unstable.
- **Overloaded UI:** too many metrics can dilute setup clarity.

## Validation steps

- `npm run test -w ./apps/dashboard-web`
- Manual project page review with seeded event mixes (local-heavy, cloud-heavy, failure-heavy).
- Verify integration card still presents SDK/runtime as primary path.

## Completion criteria

- [x] Dashboard project page shows local hit/fallback/reliability signals sourced from current telemetry data.
- [x] Reason taxonomy is mapped to stable user-facing labels.
- [x] Directional-data caveats are present where precision is limited.
- [x] Tests cover new view-model branches and empty/sparse data states.

## Out of scope

- Net-new billing architecture or canonical revenue metrics.
- Major dashboard IA redesign beyond project page and immediate supporting components.
- Control-plane telemetry ingestion changes (stage 5 in this folder).

## Status

**completed (2026-04-15)**

## Implementation notes

- Added operational-signal aggregation in the project page view model:
  - directional local hit rate with sample size
  - fallback reason buckets mapped to stable user-facing labels
  - 7-day reliability trend with error/timeout counts and trend direction
- Extended value-summary telemetry shape (`ProjectValueSummaryExecution`) and data loading to include `execution_reason`, `error_type`, and `error_code`.
- Added a new `ProjectLocalFirstSignalsCard` on the project page, positioned alongside setup and value cards, with:
  - fallback reason distribution bars
  - compact 7-day reliability trend cells
  - explicit directional telemetry caveat text
- Preserved SDK-first framing by keeping setup/integration hierarchy and making signals additive rather than replacing onboarding guidance.

## Validation notes

- `npm run test:unit -w ./apps/dashboard-web` passes, including new tests for:
  - empty/sparse telemetry states
  - reason bucketing stability
  - reliability trend direction logic
- `npm run test -w ./apps/dashboard-web` is not available in this workspace (missing script), so stage validation used the existing unit-test script.

## Follow-up tasks discovered

- Add a lightweight visual/manual QA harness (seeded local-heavy/cloud-heavy/failure-heavy fixtures) for project page signal cards.
- Optionally centralize reason taxonomy constants across SDK + dashboard once stage 5 telemetry hardening lands, to reduce drift risk further.
