# Stage: Optional OpenAI proxy secondary lane

## Stage name

**optional-proxy-secondary-lane** (`05-optional-proxy-secondary-lane.md`)

## Objective

**Explicitly govern** the existing OpenAI-compatible surface in [apps/control-plane-api](../../../apps/control-plane-api) as a **secondary** product lane per [AGENTS.md](../../../AGENTS.md) §12: useful for sandbox, demos, enterprise/server patterns, compatibility — **not** the default mainline. Document behavior, avoid roadmap competition with SDK/runtime work, and align observability language with **directional** usage (§10).

## Why this stage exists

[apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) implements `/v1/models`, `/v1/embeddings`, `/v1/chat/completions` with resolver-backed project context and Supabase logging. Embeddings can route local via agent or cloud upstream; chat is cloud-only ([apps/control-plane-api/src/routing/execution-decision.ts](../../../apps/control-plane-api/src/routing/execution-decision.ts)). This is valuable but must not absorb priority or be mistaken for the architecture in AGENTS.md §2 (on-device decision). Stage 5 is **governance + documentation + minimal maintenance discipline**, not feature expansion unless strictly secondary.

## Dependencies on earlier stages

- **[04-dashboard-website-sdk-first-onboarding.md](./04-dashboard-website-sdk-first-onboarding.md)** — GTM and dashboard already treat proxy as secondary; this stage aligns **codebase docs**, README, and **control-plane** package description with that story.
- **[03-product-config-telemetry-plane.md](./03-product-config-telemetry-plane.md)** — Resolver URL configuration should be stable for operators running proxy.

**Prior stages 1–2** inform what “mainline” is so proxy docs do not contradict them.

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/control-plane-api/src/server.ts](../../../apps/control-plane-api/src/server.ts) | Handlers, model IDs `dyno-embeddings-1`, `dyno-chat-1` |
| [apps/control-plane-api/src/routing/execution-decision.ts](../../../apps/control-plane-api/src/routing/execution-decision.ts) | Chat → cloud only |
| [apps/control-plane-api/package.json](../../../apps/control-plane-api/package.json) | Description: “Phase 1 embeddings” |
| [README.md](../../../README.md) | Control plane section |
| [apps/control-plane-api/src/__tests__/](../../../apps/control-plane-api/src/__tests__/) | Behavioral contract for proxy |

## Files and directories likely to change

- `apps/control-plane-api/README.md` — **if** one exists; else root `README.md` only
- `README.md` (root) — clarify proxy vs SDK path
- `apps/control-plane-api/package.json` — description field
- Optional: `apps/control-plane-api/src/server.ts` — add response header or comment block pointing integrators to SDK-first (non-breaking)

## Detailed substeps (grounded in repo)

1. **Package identity**  
   Update `description` in [apps/control-plane-api/package.json](../../../apps/control-plane-api/package.json) to state: OpenAI-compatible **optional** surface for testing/sandbox/enterprise; not the primary Dyno integration path.

2. **Root README**  
   In [README.md](../../../README.md) “Core Components” / `control-plane-api` section: add one paragraph matching AGENTS.md §12–13 ordering (SDK/runtime → control plane config → optional proxy).

3. **Operational notes**  
   Document env vars already used: `DYNO_CONFIG_RESOLVER_URL`, `DYNO_AGENT_BASE_URL`, Supabase keys — who runs this service (developer machine vs server) vs who runs SDK (end-user app).

4. **Feature freeze discipline**  
   Record explicit **non-goals** for this package in README or plan: e.g. no new chat surface features until SDK milestones; bugfixes and compatibility only.

5. **Telemetry wording**  
   Cross-check [apps/control-plane-api/src/persistence/request-executions.ts](../../../apps/control-plane-api/src/persistence/request-executions.ts) — dashboard metrics from proxy remain valid as **hosted-traffic** signal, not full local-hit ground truth (AGENTS.md §10); document in README if misleading.

6. **Tests as contract**  
   Keep `npm run test -w control-plane-api` green; no removal of routes without deprecation policy.

## Risks and failure modes

- **Accidental expansion:** adding streaming chat, new models, or complex routing in proxy — violates recovery “do not invent work” — challenge per AGENTS.md §12.
- **Confusing operators:** teams deploy only control-plane-api thinking it is the product — documentation must repeat SDK-first.
- **Billing mismatch:** if pricing still says “routed requests,” tie README note to stage 4 pricing alignment.

## Validation steps

- README and package description readable without implying proxy is step one for app integration.
- `npm run test:control-plane` (root script) passes.

## Completion criteria

- [x] `apps/control-plane-api/package.json` description and root README section state **secondary** role per AGENTS.md §12.
- [x] Explicit **non-goals** or maintenance policy for proxy lane recorded (markdown only acceptable).
- [x] No new proxy features added in this stage unless required to fix incorrect/misleading behavior.

## Out of scope

- Implementing streaming chat, new endpoints, or multi-provider routing in proxy
- SDK or agent feature work — **stages 1–2**
- Dashboard UI — **stage 4** (already sets GTM); this stage is control-plane/docs alignment
- Demo route removal — **stage 3** / **stage 6**

## Status

**completed**

## Implementation notes

- Updated [README.md](../../../README.md) `apps/control-plane-api` section to reinforce SDK/runtime-first ordering and proxy-secondary positioning.
- Added explicit operator model notes: control-plane proxy runs on developer/server infrastructure; end-user integrations remain SDK + local runtime.
- Added proxy telemetry wording to avoid over-claiming dashboard metrics as full local-first ground truth.
- Added explicit secondary-lane maintenance policy and non-goals (no proxy-first feature expansion; compatibility/correctness/reliability fixes only; route removals require deprecation path).
- Confirmed [apps/control-plane-api/package.json](../../../apps/control-plane-api/package.json) already has the intended secondary-lane description; no additional change needed.

## Validation run

- Ran `npm run test:control-plane` from repo root.
- Result: pass (`25/25` tests).

## Follow-up tasks discovered

- Optional: add a dedicated `apps/control-plane-api/README.md` that mirrors the root guidance for operators who land directly in that workspace.
- Optional: if pricing copy still references "all routed traffic," align wording to "hosted proxy traffic" in dashboard/product copy to stay consistent with directional telemetry framing.
