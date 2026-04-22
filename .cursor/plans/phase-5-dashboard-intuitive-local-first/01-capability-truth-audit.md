# Stage: Dashboard capability truth audit

## Stage name

**phase5-capability-truth-audit** (`01-capability-truth-audit.md`)

## Objective

Define and enforce a capability truth matrix so dashboard controls only represent behaviors that work in runtime code today.

## Why this stage exists

Developer trust drops when UI controls look active but have no runtime effect. This stage makes capability truth explicit and machine-enforced.

## Dependencies on earlier stages

- Builds on: [../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md](../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md)
- Builds on: [../phase-4-text-generation-local/00-overview.md](../phase-4-text-generation-local/00-overview.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/_components/project-config-form.tsx](../../../apps/dashboard-web/app/projects/_components/project-config-form.tsx) | Main settings surface with potential truth gaps |
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Server actions and validation for config fields |
| [apps/dashboard-web/lib/data/dashboard-types.ts](../../../apps/dashboard-web/lib/data/dashboard-types.ts) | Source fields that shape config data |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Verify which controls are actually interpreted by SDK runtime |
| [packages/agent/src](../../../packages/agent/src) | Verify local runtime options with real behavior |

## Files and directories likely to change

- `.cursor/plans/phase-5-dashboard-intuitive-local-first/01-capability-truth-audit.md` (stage notes updates)
- `apps/dashboard-web/lib/data/project-capability-matrix.ts` (new)
- `apps/dashboard-web/app/projects/_components/project-config-form.tsx`
- `apps/dashboard-web/app/projects/[projectId]/page.tsx`
- `apps/dashboard-web/lib/data/project-page-view-model.ts`

## Detailed substeps (grounded in repo)

1. **Create a capability matrix module**  
   Add one central map that classifies each runtime control as `active`, `partial`, or `not_yet_active`.

2. **Wire matrix into project config UI**  
   Use matrix flags in `project-config-form.tsx` to determine visible/enabled/deprecated control states.

3. **Align validation with capability state**  
   Ensure server-side validation only requires active controls and does not block save on deprecated fields.

4. **Expose capability state to page view model**  
   Add capability metadata to view model so setup/readiness cards can explain why controls are disabled.

5. **Write truth notes in stage doc**  
   Capture exactly which controls are active now vs deferred (for example battery/idle/wifi/charging if not wired end-to-end).

## Risks and failure modes

- Capability flags drift from runtime behavior if not updated with SDK/runtime changes.
- Over-gating hides controls that are actually active.
- Missing server-side alignment causes save-time confusion.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run lint -w dashboard-web`
- `npm run test:unit -w dashboard-web`

Manual verification:
- Confirm unsupported controls are visibly gated and cannot be edited in default path.
- Confirm active controls still save successfully end-to-end.

## Completion criteria

- [x] Every runtime control in project config has explicit capability state.
- [x] UI affordances match capability state (active/editable, partial/warned, or deprecated/disabled).
- [x] Server validation no longer implies unsupported controls are required.
- [x] Capability matrix is referenced by UI and documented in stage notes.

## Out of scope

- Full runtime implementation of currently unsupported controls.
- Visual polish beyond state affordance clarity.

## Status

**completed**

## Stage notes

- Added a single capability truth source at `apps/dashboard-web/lib/data/project-capability-matrix.ts`.
- Wired matrix state into runtime configuration UI so run-condition controls (`battery_min_percent`, `idle_min_seconds`, `wifi_only`, `requires_charging`) are visibly gated as **not yet active** and rendered read-only.
- Kept active controls editable (strategy preset, fallback toggle, upstream provider/base URL/model/API key, estimated cloud cost) and marked `local_model` as **partial** with explanatory copy.
- Aligned server-side save handling in `apps/dashboard-web/app/projects/[projectId]/page.tsx`:
  - not-yet-active run-condition controls no longer block saves
  - tampered form values for those controls are ignored and existing stored values are preserved
- Exposed capability metadata on the page view model and surfaced it in setup/readiness messaging (`ProjectSetupSummaryCard`) so users see why some controls are disabled.
- Added unit coverage in `project-page-view-model.test.ts` to assert capability metadata is present and includes deferred controls.

### Verification results

- `npm run typecheck -w dashboard-web`: **pass**
- `npm run lint -w dashboard-web`: **fail** (`eslint` binary not found in current environment)
- `npm exec -w dashboard-web -- eslint . --max-warnings=0`: **pass**
- `npm run test:unit -w dashboard-web`: **pass** (23/23 tests)

### Manual verification notes

- Unsupported run-condition controls are now read-only with capability-truth messaging in both advanced settings and the conditions dialog.
- Active settings remain editable and continue to flow through save logic.

