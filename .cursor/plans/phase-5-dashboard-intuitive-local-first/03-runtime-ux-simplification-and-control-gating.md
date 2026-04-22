# Stage: Runtime UX simplification and control gating

## Stage name

**phase5-runtime-ux-simplification** (`03-runtime-ux-simplification-and-control-gating.md`)

## Objective

Reduce runtime configuration complexity by introducing a basic-first UX and gating unsupported controls so developers only configure what works.

## Why this stage exists

The current runtime form is flexible but dense (dialogs + advanced + duplicated fields). This stage lowers cognitive load while preserving expert access.

## Dependencies on earlier stages

- Requires: [01-capability-truth-audit.md](./01-capability-truth-audit.md)
- Requires: [02-primary-journey-first-success.md](./02-primary-journey-first-success.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/_components/project-config-form.tsx](../../../apps/dashboard-web/app/projects/_components/project-config-form.tsx) | Main simplification target |
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Action wiring + validation semantics |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Readiness and guidance coupling |

## Files and directories likely to change

- `apps/dashboard-web/app/projects/_components/project-config-form.tsx`
- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/dashboard-web/lib/data/project-page-view-model.ts`

## Detailed substeps (grounded in repo)

1. **Create basic/advanced structure**  
   Basic mode should include: strategy, cloud fallback provider/model/key, local model.

2. **Remove duplicate control entry points**  
   Eliminate repeated controls shown in both summary and advanced surfaces.

3. **Gate unsupported controls from capability matrix**  
   For controls not active end-to-end, either:
   - hide by default, or
   - show disabled with clear "not active yet in runtime" affordance.

4. **Clarify naming and helper text**  
   Replace internal jargon with developer-facing labels:
   - "Cloud fallback target"
   - "Local model on user device"
   - "When should local run?"

5. **Keep save semantics obvious**  
   Preserve one clear save action, visible unsaved state, and deterministic validation messages.

## Risks and failure modes

- Advanced users lose needed control depth.
- Hidden fields accidentally reset server-side defaults.
- Gated controls still appear required due to stale validation.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run lint -w dashboard-web`
- `npm run test:unit -w dashboard-web`

Manual verification:
- Basic setup can be completed without opening advanced sections.
- Unsupported controls are visibly non-actionable and do not block save.

## Completion criteria

- [ ] Runtime config is basic-first with significantly fewer first-pass decisions.
- [ ] Unsupported controls are gated and clearly labeled.
- [ ] Naming and helper text are plain-language and SDK/runtime aligned.
- [ ] Save/validation states remain deterministic and easy to understand.

## Out of scope

- Adding new runtime capabilities behind currently gated controls.
- Full settings IA redesign outside project runtime config.

## Status

**pending**

## Stage notes

- Pending implementation.
