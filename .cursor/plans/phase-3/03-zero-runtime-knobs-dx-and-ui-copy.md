# Stage: Zero runtime knobs DX and UI copy alignment

## Stage name

**phase3-zero-knob-dx** (`03-zero-runtime-knobs-dx-and-ui-copy.md`)

## Objective

Ensure all first-run developer guidance (dashboard, website docs, README, snippets) enforces the default promise: no runtime internals required in normal integration flows.

## Why this stage exists

Pitch readiness requires narrative consistency. If onboarding copy still references runtime wiring internals in default paths, adoption confidence drops.

## Dependencies on earlier stages

- Depends on: [01-sdk-ga-contract-and-surface-hardening.md](./01-sdk-ga-contract-and-surface-hardening.md)
- Depends on: [02-fallback-contract-and-adapter-guidance.md](./02-fallback-contract-and-adapter-guidance.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) | Current integration narrative and warnings |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | Next-step onboarding messaging |
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | Generated snippets used in project page |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | External docs copy and examples |
| [README.md](../../../README.md) | Canonical quickstart and architecture messaging |

## Files and directories likely to change

- `apps/dashboard-web/app/projects/_components/project-integration-card.tsx`
- `apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx`
- `apps/dashboard-web/lib/data/project-page-view-model.ts`
- `apps/dashboard-web/lib/data/project-page-view-model.test.ts`
- `apps/website/app/docs/page.tsx`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Normalize onboarding language**  
   Make default copy consistently state that runtime lifecycle is managed by Dyno.

2. **Remove default-path internal wiring references**  
   Move runtime internals to explicit advanced sections.

3. **Align snippets with zero-knob promise**  
   Ensure all primary snippets use only `Dyno.init(...)` and GA methods.

4. **Strengthen “optional hosted compatibility” positioning**  
   Keep optional hosted API examples clearly secondary.

5. **Add copy consistency tests**  
   Add assertions in dashboard/docs tests for key zero-knob language.

## Risks and failure modes

- Copy drift across README, docs, and dashboard snippets.
- Advanced/internal language appears in primary quickstart.
- Optional hosted surface appears as default path.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck -w dashboard-web`
- `npm run test -w dashboard-web --if-present`
- `npm run typecheck -w website`
- `npm run test -w website --if-present`
- `npm run typecheck`

Manual verification:
- Confirm dashboard and website primary snippets are zero-knob.
- Confirm optional hosted route is still present but clearly labeled secondary.

## Completion criteria

- [x] Primary onboarding copy is consistent with zero runtime knobs.
- [x] Primary snippets do not require runtime internals.
- [x] Optional hosted compatibility is clearly secondary.
- [x] Copy consistency is protected by automated tests where applicable.

## Out of scope

- New dashboard analytics features.
- New SDK methods not tied to zero-knob onboarding quality.

## Status

**completed** (2026-04-20)

## Implementation notes

- Updated dashboard setup guidance copy to remove default-path runtime-manager/startup-hook language and reaffirm SDK-managed runtime lifecycle.
- Added dashboard data-layer copy consistency assertions so generated integration snippets explicitly preserve:
  - zero-knob GA SDK usage (`Dyno.init`, `embedText`, `getStatus`, `shutdown`)
  - no runtime-manager/startup-hook wording in primary SDK snippets
  - optional hosted OpenAI-compatible snippet positioning

## Verification notes

### Command gate

- `npm run typecheck -w dashboard-web` ✅
- `npm run test -w dashboard-web --if-present` ✅
- `npm run typecheck -w website` ✅
- `npm run test -w website --if-present` ✅ (no website tests currently present)
- `npm run typecheck` ✅

### Manual checks

- Dashboard default-path “Next step” guidance now states SDK-managed runtime lifecycle and primary SDK snippet usage.
- Optional hosted compatibility remains present and labeled secondary in dashboard/website messaging and snippets.

## Follow-up tasks discovered

- Add dedicated website docs copy tests when a website test harness is introduced, so zero-knob language is also regression-protected outside dashboard tests.
