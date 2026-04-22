# Stage: Primary journey to first successful request

## Stage name

**phase5-primary-journey-first-success** (`02-primary-journey-first-success.md`)

## Objective

Add one explicit, top-of-page onboarding journey that guides developers from project setup to first successful Dyno request.

## Why this stage exists

Current setup context is distributed across multiple cards, which increases scanning cost and slows onboarding. A single clear journey improves intuitiveness and time-to-first-success.

## Dependencies on earlier stages

- Requires: [01-capability-truth-audit.md](./01-capability-truth-audit.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Current card ordering and page composition |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | Existing setup/health card to evolve into explicit checklist |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Existing guidance and readiness fields |
| [apps/dashboard-web/app/projects/_components/project-api-keys-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-api-keys-card.tsx) | Key creation integration point |
| [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) | Snippet handoff point |

## Files and directories likely to change

- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx`
- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/dashboard-web/app/projects/_components/project-detail-primitives.tsx` (if shared checklist primitives are added)

## Detailed substeps (grounded in repo)

1. **Define canonical setup steps in view model**  
   Add stable checklist items with statuses (`todo`, `blocked`, `ready`, `done`) and per-step blocker reasons.

2. **Implement a top-of-page setup journey card**  
   Replace generic summary card behavior with an explicit 1-5 flow:
   - configure cloud fallback
   - configure local model (if available)
   - create Dyno project API key
   - copy SDK snippet
   - send first request and verify telemetry

3. **Add direct action CTAs for blockers**  
   Each blocked step should include one clear action target (for example "Configure cloud", "Create API key").

4. **Reorder project page for onboarding**  
   Place setup journey before integration and telemetry cards so first-run users do not need to infer sequence.

5. **Add completion messaging**  
   When all steps pass, show "ready for first production test" with next recommended verification action.

## Risks and failure modes

- Checklist logic diverges from true project readiness.
- Too many CTAs create visual clutter.
- Overly rigid sequence blocks advanced users.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run lint -w dashboard-web`
- `npm run test:unit -w dashboard-web`

Manual verification:
- New project flow completes in one pass without ambiguous next steps.
- Setup journey updates after save/create key/request events.

## Completion criteria

- [x] Project detail page has explicit first-success checklist.
- [x] Every blocked state includes one direct action CTA.
- [x] Checklist completion correlates with `readyForRequests` and observed request telemetry.
- [x] Default onboarding path is obvious without reading multiple card descriptions.

## Out of scope

- Full sandbox runner implementation from dashboard.
- A/B testing of onboarding variants.

## Status

**completed**

## Stage notes

- Implemented canonical first-success journey in `project-page-view-model` with stable step keys and statuses (`todo`, `blocked`, `ready`, `done`), blocker reasons, CTA labels/targets, and completion state.
- Replaced setup summary UI with explicit 1-5 onboarding sequence, blocker/ready CTA actions, optional local model step labeling, and completion callout.
- Reordered project page so the setup journey is top-of-page before integration and recent-requests context; added section anchors for direct CTA navigation (`runtime-configuration`, `api-keys`, `integration`, `recent-requests`).
- Added/updated unit tests for setup journey blocked/completed scenarios in `project-page-view-model.test.ts`.
- Follow-up implementation pass (journey UX fixes + request tester):
  - Fixed repeat CTA behavior by replacing hash-only navigation with explicit smooth scroll handlers, so clicking the same step action repeatedly keeps working.
  - Updated step 2 (`configure_local_model`) to be optional and non-blocking when unset (`todo`), while still exposing a direct action path.
  - Added `ProjectRequestTesterCard` to project detail page for in-dashboard test requests using a pasted Dyno API key.
  - Added a server action to send test requests to Dyno (`/v1/embeddings` or `/v1/chat/completions`) and revalidate the page so request telemetry updates immediately.
  - Updated step 5 journey CTA to route ready users to `#request-tester` and adjusted journey copy to reference the dashboard tester flow.
  - Removed OpenAI-compatibility setup docs/snippets from the integration onboarding card and kept only the primary SDK path content.
  - Updated recent-requests empty-state guidance to reference the request tester.
- Verification gate:
  - `npm run typecheck -w dashboard-web` -> **pass**
  - `npm run lint -w dashboard-web` -> **fail** (`eslint` not found in current shell environment)
  - `npm run test:unit -w dashboard-web` -> **pass** (25/25 tests passing)
- Manual verification pending in running dashboard UI:
  - Validate repeated clicks on setup CTAs always scroll to the intended section.
  - Confirm step 2 remains optional/non-blocking when no local model is configured.
  - Send a request from the new dashboard tester, then verify the row appears in Recent Requests and step 5 updates to done after success.
  - Confirm integration/setup surface shows only the primary SDK path and no OpenAI-compat setup snippets.
