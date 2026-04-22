# Stage: OpenAI-shape dashboard deprecation

## Stage name

**phase5-openai-shape-deprecation** (`04-openai-shape-deprecation.md`)

## Objective

Deprecate OpenAI-compatible integration surfaces from the default dashboard experience so developers primarily see the Dyno SDK path.

## Why this stage exists

Mixing SDK-first and optional hosted compatibility in the same primary UI creates architecture confusion and slows onboarding.

## Dependencies on earlier stages

- Requires: [02-primary-journey-first-success.md](./02-primary-journey-first-success.md)
- Requires: [03-runtime-ux-simplification-and-control-gating.md](./03-runtime-ux-simplification-and-control-gating.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) | Current mixed SDK + OpenAI-shaped snippets |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Snippet generation currently includes OpenAI/cURL |
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Integration card props and composition |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Ensure dashboard-linked docs remain SDK-first |

## Files and directories likely to change

- `apps/dashboard-web/app/projects/_components/project-integration-card.tsx`
- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/website/app/docs/page.tsx` (copy/path alignment if needed)

## Detailed substeps (grounded in repo)

1. **Make SDK snippet the only default integration surface**  
   Remove OpenAI-compatible snippet and cURL sections from the main integration card.

2. **Remove OpenAI-shaped snippet generation from default view model**  
   Keep data contract focused on SDK setup and first request verification.

3. **Update integration copy to one path**  
   Clarify that default production usage is `Dyno.init(...)` + SDK methods.

4. **Optionally preserve legacy mode behind explicit feature flag**  
   If needed for internal demos/tooling, isolate legacy snippets behind non-default guarded path.

5. **Align docs handoff links**  
   Ensure any dashboard "Learn more" actions land on SDK-first docs.

## Risks and failure modes

- Internal teams lose easy access to compatibility snippets without alternative path.
- Residual references to `DYNO_API_KEY` create inconsistent expectations.
- Existing automation/tests may still expect old snippet keys.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run lint -w dashboard-web`
- `npm run test:unit -w dashboard-web`

Manual verification:
- Project integration card shows SDK-only path by default.
- New developer can copy one snippet and run first request without OpenAI-shaped context.

## Completion criteria

- [ ] Default integration card is SDK-only.
- [ ] No OpenAI-shaped snippet blocks are visible in default dashboard UX.
- [ ] Copy consistently positions hosted OpenAI compatibility as non-primary/advanced-only (or fully hidden).
- [ ] Docs links from dashboard remain aligned with SDK-first path.

## Out of scope

- Removing optional hosted compatibility APIs from backend implementation.
- Deleting historical scripts used for internal migration/testing.

## Status

**pending**

## Stage notes

- Pending implementation.
