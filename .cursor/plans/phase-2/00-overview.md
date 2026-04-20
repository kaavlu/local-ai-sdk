# Dyno phase 2 plan — overview

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical architecture and decision rules).

**Purpose of this folder:** Convert the completed recovery work into an execution-ready Phase 2 focused on **product hardening** and **SDK developer experience**: stable embeddings SDK contract, zero-custom-provider managed config onboarding (`projectApiKey`), explicit local runtime lifecycle semantics, and dashboard visibility that reflects the local-first promise.

**Phase 2 framing:** Recovery established SDK-first direction and removed major proxy-first drift. Phase 2 turns that into a robust beta loop for early adopters:
- SDK contract quality and reliability first
- SDK onboarding ergonomics second (`projectApiKey` + managed config by default)
- runtime lifecycle compatibility third
- dashboard operational truth close behind
- control-plane config/telemetry hardening in support of those surfaces
- docs/adoption polish after product behavior is stable

---

## Stage plan files

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-embeddings-sdk-contract-v1.md](./01-embeddings-sdk-contract-v1.md) | `phase2-sdk-contract-v1` |
| 2 | [02-sdk-api-key-managed-config-onboarding.md](./02-sdk-api-key-managed-config-onboarding.md) | `phase2-sdk-managed-config-onboarding` |
| 3 | [03-local-runtime-lifecycle-contract.md](./03-local-runtime-lifecycle-contract.md) | `phase2-runtime-contract` |
| 4 | [04-dashboard-local-first-signals.md](./04-dashboard-local-first-signals.md) | `phase2-dashboard-signals` |
| 5 | [05-config-and-telemetry-hardening.md](./05-config-and-telemetry-hardening.md) | `phase2-config-telemetry-hardening` |
| 6 | [06-docs-demo-adoption-loop.md](./06-docs-demo-adoption-loop.md) | `phase2-docs-adoption-loop` |

---

## Stage ordering and dependencies

```text
phase2-sdk-contract-v1
  └─> phase2-sdk-managed-config-onboarding
        └─> phase2-runtime-contract
              ├─> phase2-dashboard-signals
              └─> phase2-config-telemetry-hardening
                    └─> phase2-docs-adoption-loop
phase2-dashboard-signals ─────────────────┘
```

- **`phase2-sdk-contract-v1` first:** locks API semantics, reason taxonomy, and fallback behavior before UI/API hardening layers encode unstable fields.
- **`phase2-sdk-managed-config-onboarding` second:** makes `projectApiKey`-first integration the default SDK path and removes mandatory custom config-provider wiring for standard usage.
- **`phase2-runtime-contract` third:** turns stage-1 reliability guardrails into explicit compatibility behavior and lifecycle contract after SDK onboarding shape is stable.
- **`phase2-dashboard-signals` fourth:** should reflect real SDK/runtime behavior, not placeholder or speculative event semantics.
- **`phase2-config-telemetry-hardening` fifth:** versioning, validation, and idempotency are safer once reason/event fields are stable.
- **`phase2-docs-adoption-loop` last:** external docs and adoption narratives should trail product truth to avoid drift.

---

## Repo anchors (Phase 2 focus)

| Area | Path | Phase 2 role |
|------|------|--------------|
| SDK runtime contract + DX | `packages/sdk-ts` | Mature embeddings API, batch behavior, fallback semantics, telemetry transport, managed config onboarding |
| Local runtime | `packages/agent` | Lifecycle/readiness/capabilities contract for SDK compatibility |
| Control plane ingest and resolver | `apps/control-plane-api` | Config/telemetry hardening, payload validation, schema/version compatibility |
| Dashboard product surface | `apps/dashboard-web` | Local-first operational visibility and integration guidance fidelity |
| Docs + reference harness | `apps/website`, `apps/demo-electron`, `README.md` | Canonical SDK-first onboarding and adoption loop |

---

## Phase 2 acceptance bar

Phase 2 is complete when:
1. Embeddings SDK contract is stable, tested, and documented.
2. SDK supports managed config onboarding (`projectApiKey`) without requiring a custom `ProjectConfigProvider` for standard integrations.
3. Runtime lifecycle behavior is explicit and compatible across agent versions.
4. Dashboard shows directional local hit/fallback/reliability signals aligned with SDK events.
5. Config and telemetry APIs are versioned and hardened enough for incremental rollout.
6. Docs/demo/onboarding consistently present SDK + local runtime as primary and hosted proxy as optional.

---

*Initial Phase 2 decomposition created from the approved plan. All stage files begin in `pending` status.*
