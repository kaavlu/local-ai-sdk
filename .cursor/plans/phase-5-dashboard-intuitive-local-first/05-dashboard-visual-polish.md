# Stage: Dashboard visual polish for developer clarity

## Stage name

**phase5-dashboard-visual-polish** (`05-dashboard-visual-polish.md`)

## Objective

Upgrade dashboard visual hierarchy so it feels sharp and developer-friendly, with stronger status signaling and less monotone presentation.

## Why this stage exists

Even with good logic, weak visual hierarchy makes the product feel flat and harder to scan. This stage improves clarity and product confidence without sacrificing technical tone.

## Dependencies on earlier stages

- Requires: [02-primary-journey-first-success.md](./02-primary-journey-first-success.md)
- Requires: [03-runtime-ux-simplification-and-control-gating.md](./03-runtime-ux-simplification-and-control-gating.md)
- Requires: [04-openai-shape-deprecation.md](./04-openai-shape-deprecation.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Main layout rhythm and section order |
| [apps/dashboard-web/app/projects/_components/project-detail-primitives.tsx](../../../apps/dashboard-web/app/projects/_components/project-detail-primitives.tsx) | Shared card/stat shells for global polish |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | Primary onboarding prominence |
| [apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx) | Signal readability and chart density |
| [apps/dashboard-web/components/dashboard/sidebar.tsx](../../../apps/dashboard-web/components/dashboard/sidebar.tsx) | Navigation contrast and active-state clarity |
| [apps/dashboard-web/app/globals.css](../../../apps/dashboard-web/app/globals.css) | Shared color tokens and component-level accents |

## Files and directories likely to change

- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/dashboard-web/app/projects/_components/project-detail-primitives.tsx`
- `apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx`
- `apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx`
- `apps/dashboard-web/app/projects/_components/project-value-summary-card.tsx`
- `apps/dashboard-web/components/dashboard/sidebar.tsx`
- `apps/dashboard-web/app/globals.css`

## Detailed substeps (grounded in repo)

1. **Define status visual language**  
   Standardize ready/warning/error/info treatments for badges, tiles, and banners.

2. **Strengthen section hierarchy**  
   Increase distinction between primary setup card, integration card, and telemetry/value cards.

3. **Reduce monotone surfaces**  
   Add subtle contrast tiers and accents (not loud gradients) to improve scanability.

4. **Improve typography rhythm**  
   Tighten heading/description/value sizing so key metrics and blockers are immediately noticeable.

5. **Polish interaction feedback**  
   Ensure hover/focus/active states feel responsive and consistent across cards and nav.

## Risks and failure modes

- Over-styling harms the technical, developer-first tone.
- Inconsistent status semantics across cards.
- Contrast changes reduce accessibility if not validated.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run lint -w dashboard-web`
- `npm run test:unit -w dashboard-web`

Manual verification:
- Primary setup card is visually dominant and easy to follow.
- Error/warning/success states are distinguishable at a glance.
- UI remains clean and professional, not "marketing-heavy."

## Completion criteria

- [ ] Dashboard has clear visual hierarchy with reduced monotone feel.
- [ ] Status semantics are visually consistent across setup/integration/telemetry.
- [ ] Core pages remain compact, readable, and developer-oriented.
- [ ] Accessibility baseline (contrast/focus clarity) is preserved.

## Out of scope

- Complete rebrand or design system replacement.
- Major animation framework changes.

## Status

**pending**

## Stage notes

- Pending implementation.
