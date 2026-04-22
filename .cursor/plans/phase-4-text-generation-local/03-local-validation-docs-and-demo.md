# Stage: Local validation, docs, and demo readiness

## Stage name

**phase4-local-generate-validation** (`03-local-validation-docs-and-demo.md`)

## Objective

Make local generation operationally demonstrable: by stage end, a developer can run Dyno locally and observe `Xenova/distilgpt2` (or similar) generating text on-device with clear diagnostics and documentation.

## Why this stage exists

Implementation alone is not enough for customer readiness. You need a reproducible proof path, clear troubleshooting, and onboarding copy that reflects the SDK-first architecture.

## Dependencies on earlier stages

- Depends on: [02-sdk-generation-contract-and-fallback.md](./02-sdk-generation-contract-and-fallback.md)
- Builds on: [../phase-3/04-runtime-readiness-contract-and-doctor.md](../phase-3/04-runtime-readiness-contract-and-doctor.md)
- Builds on: [../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md](../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [README.md](../../../README.md) | Canonical local runbook and contract docs |
| [scripts/dyno-doctor.mjs](../../../scripts/dyno-doctor.mjs) | Diagnostics workflow extension point |
| [scripts/sdk-smoke-test.mjs](../../../scripts/sdk-smoke-test.mjs) | Add generation smoke assertions |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Public quickstart and narrative alignment |
| [apps/demo-electron/README.md](../../../apps/demo-electron/README.md) | Local demo guidance |

## Files and directories likely to change

- `README.md`
- `scripts/dyno-doctor.mjs`
- `scripts/sdk-smoke-test.mjs`
- `apps/website/app/docs/page.tsx`
- `apps/demo-electron/README.md`
- `packages/sdk-ts/src/__tests__/doctor.test.ts` (if generation checks are added)

## Detailed substeps (grounded in repo)

1. **Add a repeatable local generation smoke path**  
   Update smoke script(s) to run one local generation request and assert non-empty output with local/cloud decision metadata.

2. **Extend diagnostics for generation**  
   Add doctor checks for generation readiness support and generation fallback reachability (where configured).

3. **Document minimal local setup and caveats**  
   Publish exact commands/env vars and known constraints (first-load latency, memory pressure, directional telemetry caveats).

4. **Update default SDK docs snippets**  
   Show `Dyno.init(...)` + `generateText(...)` as default local-first generation path; keep hosted chat proxy explicitly secondary.

5. **Run end-to-end local verification gate**  
   Validate on at least one representative user-like machine profile and record observed latency/memory notes.

## Risks and failure modes

- Demo path depends on undocumented one-off machine setup.
- Docs imply proxy-first generation instead of SDK/runtime-first.
- Diagnostics do not isolate generation-specific failures quickly.

## Cursor verification gate (required before marking complete)

Run all commands and capture pass/fail in stage notes:

- `npm run typecheck`
- `npm run test:sdk:smoke`
- `npm run doctor:sdk`
- `npm run dev:all` (manual end-to-end)

Manual verification:
- Confirm local generation works with `Xenova/distilgpt2` (or similar) on-device.
- Confirm docs clearly position hosted chat compatibility as secondary.

## Completion criteria

- [ ] Local generation is demonstrably runnable on-device end-to-end.
- [ ] Doctor/smoke workflows report actionable generation diagnostics.
- [ ] README/docs quickstart includes generation in SDK-first default flow.
- [ ] Team has a repeatable customer-demo runbook for local generation.

## Out of scope

- Production performance optimization for larger local models.
- Cross-device benchmark matrix automation.

## Status

**pending**
