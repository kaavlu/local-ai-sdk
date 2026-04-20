# Stage: Docs, demo, and adoption loop

## Stage name

**phase2-docs-adoption-loop** (`06-docs-demo-adoption-loop.md`)

## Objective

Publish one coherent, SDK-first adoption loop across docs, website, and reference demo so early users can integrate quickly and form the correct mental model: local-first execution with developer-owned fallback and directional dashboard visibility.

## Why this stage exists

Recovery aligned messaging directionally, but the final adoption journey still spans multiple surfaces (`README`, website docs/pricing, demo-electron). Phase 2 should unify those surfaces around a single canonical flow that matches the hardened SDK/runtime behavior.

## Dependencies on earlier stages

- Depends on [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) for canonical SDK snippets.
- Depends on [02-sdk-api-key-managed-config-onboarding.md](./02-sdk-api-key-managed-config-onboarding.md) for default onboarding API shape and terminology.
- Depends on [04-dashboard-local-first-signals.md](./04-dashboard-local-first-signals.md) for truthful dashboard outcome references.
- Depends on [05-config-and-telemetry-hardening.md](./05-config-and-telemetry-hardening.md) for stable config/telemetry endpoint documentation.
- Builds on completed recovery stages:
  - [../recovery/04-dashboard-website-sdk-first-onboarding.md](../recovery/04-dashboard-website-sdk-first-onboarding.md)
  - [../recovery/06-reference-demo-and-hygiene.md](../recovery/06-reference-demo-and-hygiene.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [README.md](../../../README.md) | Top-level first-run narrative and architecture framing |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Website quickstart flow |
| [apps/website/app/pricing/page.tsx](../../../apps/website/app/pricing/page.tsx) | Value framing and telemetry language |
| [apps/website/app/projects/page.tsx](../../../apps/website/app/projects/page.tsx) | Product positioning continuity |
| [apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts) | Reference integration path |
| [apps/demo-electron/README.md](../../../apps/demo-electron/README.md) | Harness purpose and usage |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public import path examples |
| [packages/sdk-ts/src/demo.ts](../../../packages/sdk-ts/src/demo.ts) | Demo-only import boundary |

## Files and directories likely to change

- `README.md`
- `apps/website/app/docs/page.tsx`
- `apps/website/app/pricing/page.tsx`
- `apps/website/app/projects/page.tsx`
- `apps/demo-electron/README.md`
- `apps/demo-electron/src/main.ts` (only if snippet parity adjustments are needed)

## Detailed substeps (grounded in repo)

1. **Define one canonical onboarding sequence**  
   Standardize on:
   1) install SDK  
   2) configure project  
   3) run local runtime  
   4) wire cloud fallback  
   5) inspect dashboard outcomes

2. **Unify snippet vocabulary**  
   Ensure identical naming for runtime options, reason labels, and fallback adapter terminology across README and website docs.

3. **Clarify optional hosted proxy role**  
   Keep OpenAI-compatible route examples available but explicitly under optional/secondary headings.

4. **Tighten pricing and value language**  
   Avoid proxy-only request framing; align with local-first savings and directional reliability insights.

5. **Keep demo-electron as reference harness**  
   Ensure demo instructions mirror primary SDK behavior without becoming the product center.

6. **Add quick consistency checks**  
   Verify all docs reference current endpoint names and env vars from v1 routes, not demo-only defaults unless clearly marked legacy.

## Risks and failure modes

- **Message drift:** docs may lag behind API behavior if updated too early.
- **Over-claiming:** pricing/marketing may imply precise accounting beyond telemetry guarantees.
- **Proxy recentering:** optional path might accidentally appear primary through ordering/copy.

## Validation steps

- Manual walkthrough of README + website docs as a new user.
- Verify demo-electron setup still works with documented env variables.
- Spot-check for stale `/api/demo/*` references in user-facing docs where non-legacy paths should be used.

## Completion criteria

- [ ] README and website show the same SDK-first onboarding sequence.
- [ ] Proxy compatibility is consistently labeled optional/secondary.
- [ ] Pricing/value language matches directional telemetry model.
- [ ] Demo-electron remains clearly positioned as a regression/reference app.

## Out of scope

- New product features beyond docs/adoption clarity.
- Major redesign of website information architecture.
- Enterprise-specific deployment playbooks.

## Status

**pending**
