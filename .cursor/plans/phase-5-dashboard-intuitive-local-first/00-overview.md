# Dyno phase 5 plan — intuitive developer dashboard

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical architecture and decision rules).

**Purpose of this folder:** Move the dashboard from "feature-rich but dense" to "obvious, truthful, and developer-first" by enforcing capability truth, simplifying setup, deprecating hosted OpenAI-shaped UX, and improving visual hierarchy.

**Phase 5 framing:** Ship the smallest credible dashboard uplift in five moves:
- define and enforce UI capability truth (no dead controls)
- create one explicit first-success setup journey
- simplify runtime configuration to a basic-first flow
- deprecate OpenAI-compatible dashboard surfaces from default UX
- polish visual hierarchy so the UI feels sharp, not monotone

---

## Stage plan files

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-capability-truth-audit.md](./01-capability-truth-audit.md) | `phase5-capability-truth-audit` |
| 2 | [02-primary-journey-first-success.md](./02-primary-journey-first-success.md) | `phase5-primary-journey-first-success` |
| 3 | [03-runtime-ux-simplification-and-control-gating.md](./03-runtime-ux-simplification-and-control-gating.md) | `phase5-runtime-ux-simplification` |
| 4 | [04-openai-shape-deprecation.md](./04-openai-shape-deprecation.md) | `phase5-openai-shape-deprecation` |
| 5 | [05-dashboard-visual-polish.md](./05-dashboard-visual-polish.md) | `phase5-dashboard-visual-polish` |

---

## Stage ordering and dependencies

```text
phase5-capability-truth-audit
  └─> phase5-primary-journey-first-success
        └─> phase5-runtime-ux-simplification
              └─> phase5-openai-shape-deprecation
                    └─> phase5-dashboard-visual-polish
```

- **`phase5-capability-truth-audit` first:** removes UI/runtime truth gaps before redesign.
- **`phase5-primary-journey-first-success` second:** defines the main developer onboarding path.
- **`phase5-runtime-ux-simplification` third:** trims complexity after journey guardrails exist.
- **`phase5-openai-shape-deprecation` fourth:** removes legacy UX once SDK-first path is complete.
- **`phase5-dashboard-visual-polish` last:** visual pass should style finalized information architecture.

---

## Repo anchors (Phase 5 focus)

| Area | Path | Phase 5 role |
|------|------|--------------|
| Project page composition | `apps/dashboard-web/app/projects/[projectId]/page.tsx` | Reorder cards and add explicit setup journey + readiness |
| Runtime form UX | `apps/dashboard-web/app/projects/_components/project-config-form.tsx` | Basic/advanced split, capability gating, clearer names |
| Integration UX | `apps/dashboard-web/app/projects/_components/project-integration-card.tsx` | SDK-first only; remove optional OpenAI-shaped primary surface |
| Setup/readiness | `apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx` | Convert to checklist + blockers + next action CTAs |
| Telemetry/value cards | `apps/dashboard-web/app/projects/_components/project-local-first-signals-card.tsx`, `project-value-summary-card.tsx`, `project-recent-requests-card.tsx` | Keep directional framing while improving scanability |
| View-model support | `apps/dashboard-web/lib/data/project-page-view-model.ts` | Provide journey progress + capability metadata |
| Projects/overview pages | `apps/dashboard-web/app/dashboard/page.tsx`, `apps/dashboard-web/app/projects/page.tsx` | Align top-level copy to SDK/runtime-first positioning |

---

## Phase 5 acceptance bar

Phase 5 is complete when:
1. The project page exposes one clear "first successful request" journey with explicit blockers and action CTAs.
2. Runtime configuration only presents active/implemented controls by default; unsupported controls are clearly gated.
3. OpenAI-compatible integration snippets are removed from default dashboard UX.
4. Dashboard copy consistently reinforces SDK/runtime-first architecture and directional telemetry semantics.
5. Visual hierarchy feels distinct and developer-friendly (clear status emphasis, reduced monotone surfaces).

---

*Initial Phase 5 decomposition created from current dashboard structure and AGENTS.md architecture constraints. All stage files begin in `pending` status.*
