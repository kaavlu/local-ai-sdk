# AGENTS.md

## Dyno — Canonical Product and Architecture Source of Truth

This file is the single source of truth for Dyno’s product direction, architecture boundaries, and implementation priorities.

If code, UI, infra, or roadmap decisions conflict with this file, this file wins unless it is explicitly revised.

---

# 1. Core Product Definition

## What Dyno is

Dyno is a **local-first AI execution platform for apps**.

A developer integrates the Dyno SDK into their app so that, at runtime, the app can:
- run supported AI workloads on the **same end user’s own device** when appropriate
- otherwise fall back to the developer’s **existing cloud provider**
- report telemetry and value signals back to Dyno’s hosted control plane when possible

Dyno’s hosted backend is primarily responsible for:
- project configuration
- policy distribution
- analytics / telemetry ingestion
- billing / account management
- sandboxing / testing workflows
- developer visibility into savings, fallback behavior, and failures

Dyno’s hosted backend is **not** the canonical hot-path inference router in the main product vision.

## What Dyno is not

Dyno is **not**:
- a distributed inference marketplace across random users’ devices
- a system that routes User C’s request to User D’s laptop
- primarily a hosted OpenAI proxy product
- primarily a cloud inference provider replacement
- a product that requires per-request external coordination in the common path
- a product that ships the developer’s fallback provider credentials from Dyno to end-user devices

---

# 2. Canonical Runtime Model

## Primary runtime path

The default production runtime path is:

```text
App -> Dyno SDK
       -> local runtime on this same user device, if viable
       -> otherwise existing cloud provider fallback
```

This means:
- the real-time local-vs-cloud decision happens in the **SDK/runtime layer**, not in Dyno’s hosted backend
- the local runtime is tied to the **same user device** making the request
- if local execution is not viable, the app falls back to the app’s configured cloud provider path

## Secondary hosted path

Dyno may still support a hosted OpenAI-compatible proxy path for:
- sandbox testing
- internal demos
- controlled experiments
- some enterprise/server-side deployments
- developer tooling

But this hosted proxy is **not** the default mainline architecture of the product.

If a design decision favors the hosted proxy at the expense of the SDK/local-runtime architecture, that is likely the wrong choice.

---

# 3. Core Product Promise

Dyno’s core promise is:

> Run AI workloads on the user’s own device when it makes sense, and preserve the reliability of the developer’s existing cloud provider when it does not.

A slightly sharper version:

> Dyno helps apps opportunistically keep inference on-device, without forcing developers to give up their existing cloud fallback path.

This means the product must preserve two things at once:
- **local execution opportunity**
- **cloud reliability guarantee**

If Dyno ever makes the app feel less reliable than the cloud-only baseline, Dyno is failing its core product promise.

---

# 4. Canonical Example

## Startup X — Notes team

A software engineer on the Notes team at Startup X currently sends notes summarization requests to Gemini.

With Dyno:
1. The engineer signs up for Dyno.
2. In the Dyno dashboard, they create a project called `notes`.
3. They configure:
   - fallback provider behavior
   - local execution policy
   - rollout rules
   - supported use case(s)
4. They test the Dyno SDK and local runtime in a sandbox environment.
5. They integrate Dyno SDK where direct Gemini summarization previously happened.
6. In production, end-user devices run:
   - local summarization when the device/runtime/policy conditions allow
   - Gemini fallback when local execution is not viable
7. Dyno receives telemetry when possible and shows:
   - local hit rate
   - fallback reasons
   - estimated savings
   - request outcomes

In this model:
- Dyno is not brokering every inference request through its own servers
- Dyno is not moving requests between unrelated users’ devices
- Dyno is not replacing Gemini; it is orchestrating local-first execution around Gemini

---

# 5. Architectural Layers

Dyno has three core layers.

## 5.1 Hosted Control Plane / Dashboard

The control plane is responsible for:
- authentication and accounts
- billing and subscriptions
- workspace/project management
- project configuration and policy
- SDK config distribution
- telemetry ingestion
- value and reliability visibility
- sandbox/dev workflows

The control plane is **not** the primary per-request execution decision maker in the long-term architecture.

## 5.2 Dyno SDK

The Dyno SDK is the main runtime integration surface for developers.

Its responsibilities include:
- loading and caching project configuration from Dyno
- evaluating whether local execution is viable right now on this device
- invoking the local runtime if appropriate
- otherwise invoking the developer’s existing cloud fallback path
- emitting telemetry/events to Dyno when possible

The SDK is the product core. If the SDK is clunky, brittle, or unclear, the product fails even if the dashboard is strong.

## 5.3 Local Runtime

The local runtime is the device-side execution engine.

Its responsibilities include:
- executing supported local workloads
- exposing a stable local execution interface to the SDK
- managing model presence / warmup / lifecycle
- health checking
- fast failure when local execution is not possible

The local runtime is a first-class product surface, not an implementation detail.

---

# 6. Inference Ownership and Fallback Ownership

## Who owns cloud fallback credentials

The developer continues to own their fallback provider relationship.

This means:
- the developer already has Gemini/OpenAI/etc. configured in their app stack
- Dyno should wrap or integrate with that existing cloud path
- Dyno should **not** require the app to rely on Dyno-owned provider credentials in the common architecture

Dyno should not become a provider-secret relay to end-user devices.

## Canonical fallback principle

Dyno’s cloud fallback should, by default, use the developer’s **existing provider client and credentials path**.

That is the cleanest and safest product shape.

---

# 7. Per-User Device Affinity

Dyno does not distribute work across unrelated user devices.

For any given request, the only eligible local execution target is:
- the **same user’s own device**, if that device is currently capable of serving the request

Otherwise:
- the request falls back to cloud

This constraint is non-negotiable in the near-term product.

Examples:
- User A’s request may run on User A’s device
- User C’s request may not run on User D’s device
- idle capacity on one user’s machine does not make another user’s requests locally eligible

Dyno is **local-or-cloud per user**, not distributed edge scheduling across users.

---

# 8. Local Execution Decision Model

The SDK/runtime makes the local-vs-cloud decision on-device.

## Inputs to that decision may include
- device memory pressure
- CPU/GPU availability
- current user activity / idle state
- charging / battery state
- app state
- local runtime health
- supported use case/model availability
- project policy fetched from Dyno

## The decision output is simple
- `local`
- or `cloud`

This decision must be:
- fast
- bounded
- predictable
- failure-safe

The SDK should never create a worse user experience than simply calling the cloud provider directly.

---

# 9. Configuration Model

## Hosted config is necessary

The app should periodically fetch project config from Dyno.

Hosted config exists so that developers can centrally manage:
- local execution policy
- rollout settings
- feature flags
- use-case configuration
- telemetry/reporting settings
- future entitlements and billing-driven controls

## Runtime behavior for config fetch

The SDK should:
- fetch config periodically
- cache the latest known good config locally
- continue operating using cached config if Dyno is temporarily unreachable

Inference should not break simply because the config service is temporarily unavailable.

## Config enforcement philosophy

Early on, project config can be advisory and enforced by the SDK/runtime.
This is acceptable.

Over time, config integrity and enforcement may become stricter, but that is not required for initial product correctness.

---

# 10. Telemetry Model

Telemetry is important but not guaranteed to be perfect in the near term.

That is acceptable.

## Canonical telemetry position

Telemetry from SDK/runtime to Dyno is:
- useful
- directional
- eventually consistent when needed
- best-effort in the near term

Telemetry is **not** the primary correctness mechanism for inference execution.

## Dashboard implications

The dashboard should present usage/savings/reliability data as:
- useful operational insight
- directional value visibility

It should not claim perfect ground-truth accounting if the product architecture does not support that yet.

This especially matters for:
- savings estimates
- request counts
- local hit rate
- fallback reasons

These can be highly useful before they are perfectly canonical.

---

# 11. Dashboard Role

The Dyno dashboard is the control and visibility layer.

It should allow developers to:
- sign up and pay
- create projects
- configure local execution policy
- configure fallback provider metadata / integration assumptions as needed
- test/sandbox the SDK and runtime
- inspect savings and fallback behavior
- inspect failures and recent activity
- manage rollout / experimentation over time

The dashboard is not the runtime hot path for every production request.

If a feature assumes the dashboard/control plane must sit in the hot path for ordinary app inference, that feature should be challenged.

---

# 12. Role of the Existing Hosted OpenAI-Compatible Surface

The existing hosted API/proxy work is not wasted.

It remains useful for:
- sandbox and local developer testing
- internal validation
- hosted fallback/testing modes
- enterprise/server-heavy deployment patterns
- proving request/response shape compatibility
- certain observability and billing workflows

But it should no longer be treated as the primary default product architecture.

If there is tension between:
- improving the hosted proxy
- improving the SDK + local runtime

the SDK + local runtime should generally win.

---

# 13. Canonical Product Surface Priority Order

Dyno should now be thought of in this order:

1. **SDK/runtime product**
2. **local execution engine**
3. **hosted config + analytics control plane**
4. **optional hosted proxy/testing path**

Not the other way around.

---

# 14. Reliability Requirements

Dyno must never make the app feel less reliable than the cloud-only baseline.

## Reliability principles
- local execution must fail fast
- fallback must be predictable
- the SDK should avoid hangs and long ambiguous stalls
- if cloud could succeed, Dyno should not be the reason the request fails
- worst-case behavior should resemble the developer’s existing cloud-only flow

## Operational philosophy
Dyno is only worth adopting if the developer can believe:

> Worst case, Dyno behaves like my current cloud path. Best case, it reduces cloud usage and cost.

That is the trust threshold.

---

# 15. Product Scope Boundaries

## In scope
- local-first inference on the same end-user device
- cloud fallback using the developer’s existing provider path
- project-based policy and config
- telemetry and value visibility
- developer dashboard/control plane
- sandbox/testing workflows
- SDK integration into client-side apps
- local runtime lifecycle and health

## Out of scope for now
- cross-user distributed inference
- routing requests across arbitrary idle user devices
- full global edge scheduling
- perfect telemetry accounting
- full multi-cloud brokerage in the hot path
- replacing the developer’s provider relationship entirely
- forcing all traffic through Dyno servers

---

# 16. Canonical Near-Term Technical Priorities

Given this architecture, the most important future work should prioritize:

## 16.1 SDK Contract
Define clearly:
- how the app calls Dyno
- how the developer integrates fallback provider usage
- how the SDK chooses local vs cloud
- what API shape is exposed to the app

## 16.2 Local Runtime Packaging and Lifecycle
Define clearly:
- how the local runtime is installed
- how it is updated
- how it starts/connects
- how the SDK health-checks it
- how it reports readiness to the SDK

## 16.3 Config Sync
Define clearly:
- config fetch cadence
- local cache behavior
- stale-config behavior
- offline behavior

## 16.4 Telemetry Backhaul
Define clearly:
- what events are emitted
- what is best-effort
- what is omitted intentionally
- how the dashboard interprets those signals

## 16.5 Fallback Integration Pattern
Define clearly:
- how Dyno uses the developer’s existing provider path
- whether Dyno wraps an existing provider client
- whether the SDK exposes its own provider abstraction
- what credential ownership assumptions hold

---

# 17. Canonical Strategic Positioning

Dyno should be positioned as:

> a local-first AI execution layer for apps

not as:
- a generic hosted inference proxy
- an edge marketplace
- a cloud provider replacement

A strong positioning sentence:

> Dyno helps apps opportunistically run AI workloads on the user’s own device, while preserving the reliability of the developer’s existing cloud fallback.

A more developer-centric version:

> Dyno is an SDK + runtime that adds local-first inference to your app without forcing you to give up your current provider path.

---

# 18. Decision Rules

Use these rules when making product or architecture decisions.

## Rule 1
If a decision makes Dyno more like a hosted inference router and less like a local-first SDK/runtime platform, challenge it.

## Rule 2
If a decision assumes requests can be moved across unrelated users’ devices, reject it.

## Rule 3
If a decision requires Dyno to own the developer’s fallback provider credentials in the common production path, challenge it.

## Rule 4
If a decision improves the SDK/runtime install, execution, fallback, or visibility story, it is likely aligned.

## Rule 5
If a decision makes local execution less reliable than cloud-only behavior, reject it.

## Rule 6
If a feature only makes sense when all traffic passes through Dyno servers, treat it as secondary unless explicitly intended for sandbox/testing or enterprise hosted mode.

---

# 19. Current State vs Target State

## Current state
The project currently contains substantial work toward:
- hosted control-plane APIs
- hosted OpenAI-compatible endpoints
- project-backed config
- API keys
- telemetry/value visibility
- dashboard workflows

This work remains valuable.

## Target state
The project should evolve so that:
- the dashboard/control plane becomes configuration + analytics + billing infrastructure
- the SDK becomes the main developer integration surface
- the local runtime becomes the core device-side execution engine
- hosted proxy paths become optional/supporting modes rather than the primary architecture

This is the intended evolution path.

---

# 20. Final Canonical Summary

Dyno is a **control plane + SDK + local runtime** system for local-first AI in apps.

The developer configures projects, fallback behavior, and policy in Dyno’s hosted dashboard.
The app integrates Dyno SDK.
At runtime, the SDK decides whether to execute on the same end user’s own device or fall back to the developer’s existing cloud provider.
Dyno receives telemetry when possible and gives the developer visibility into savings, fallback behavior, and failures.

The long-term product is **not** a distributed compute network and **not** primarily a hosted per-request inference broker.
It is a local-first orchestration layer that makes on-device execution usable without sacrificing cloud reliability.

---

# 21. Instruction for Future Work

All future design, implementation, UI, and roadmap work should be evaluated against this file.

If a new idea conflicts with this architecture, it should be treated as:
- a special mode,
- an experimental path,
- or a different product direction,

not as an implicit default.

---

# 22. Developer Experience Default (Zero Runtime Knobs)

Dyno's canonical SDK developer experience should be:

1. instantiate Dyno once (for example `Dyno.init(...)`)
2. replace direct cloud inference calls with Dyno SDK calls

By default, app developers should **not** be required to configure:
- runtime mode flags
- host adapter selection
- helper launch arguments
- process lifecycle orchestration
- runtime health/readiness wiring

These are internal responsibilities of the SDK/runtime/host-adapter layer.

## Fallback ownership default

In the default architecture, fallback provider URL/key remain app-owned configuration inputs.
Dyno should not require dashboard-managed relay of provider secrets for common-path integration.

## DX decision rule

If a proposed SDK integration requires app developers to manage runtime internals by default, challenge or reject it unless clearly marked as an advanced/internal-only mode.

