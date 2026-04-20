# Dyno phase 3 plan — overview

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical architecture and decision rules).

**Purpose of this folder:** Convert the Phase 2 foundation into a **pitch-ready SDK product package** centered on one cohesive default integration path, clear reliability contract, and measurable value signals that teams can trust during pilots.

**Phase 3 framing:** Phase 2 made the SDK and local-first flow credible. Phase 3 makes it sellable:
- one narrow, explicit GA SDK contract
- one clear fallback contract with app-owned credentials
- one zero-runtime-knob developer experience across docs + dashboard copy
- one explicit runtime readiness contract and diagnostics lane
- one unified resolver/auth/config semantics path
- one telemetry-to-value proof-pack for pilots

---

## Stage plan files

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-sdk-ga-contract-and-surface-hardening.md](./01-sdk-ga-contract-and-surface-hardening.md) | `phase3-sdk-ga-surface` |
| 2 | [02-fallback-contract-and-adapter-guidance.md](./02-fallback-contract-and-adapter-guidance.md) | `phase3-fallback-contract` |
| 3 | [03-zero-runtime-knobs-dx-and-ui-copy.md](./03-zero-runtime-knobs-dx-and-ui-copy.md) | `phase3-zero-knob-dx` |
| 4 | [04-runtime-readiness-contract-and-doctor.md](./04-runtime-readiness-contract-and-doctor.md) | `phase3-runtime-contract-doctor` |
| 5 | [05-managed-config-auth-resolver-unification.md](./05-managed-config-auth-resolver-unification.md) | `phase3-resolver-unification` |
| 6 | [06-telemetry-value-proof-pack.md](./06-telemetry-value-proof-pack.md) | `phase3-telemetry-proof-pack` |

---

## Stage ordering and dependencies

```text
phase3-sdk-ga-surface
  └─> phase3-fallback-contract
        └─> phase3-zero-knob-dx
              ├─> phase3-runtime-contract-doctor
              └─> phase3-resolver-unification
                    └─> phase3-telemetry-proof-pack
phase3-runtime-contract-doctor ────────────────┘
```

- **`phase3-sdk-ga-surface` first:** freezes the primary product surface before docs, dashboard, and telemetry narratives lock in.
- **`phase3-fallback-contract` second:** fallback semantics must be explicit before diagnostics and value reporting can be trusted.
- **`phase3-zero-knob-dx` third:** docs/dashboard copy should reflect the finalized contract and fallback boundary.
- **`phase3-runtime-contract-doctor` fourth:** runtime guarantees and diagnostics should be implemented once default DX is stable.
- **`phase3-resolver-unification` fifth:** auth/config resolver standardization should follow confirmed runtime + SDK contract assumptions.
- **`phase3-telemetry-proof-pack` last:** value storytelling should use stable schemas and semantics from prior stages.

---

## Repo anchors (Phase 3 focus)

| Area | Path | Phase 3 role |
|------|------|--------------|
| Primary SDK surface | `packages/sdk-ts` | Lock GA API, fallback contract, runtime diagnostics hooks |
| Local runtime | `packages/agent` | Runtime contract implementation + doctor probes |
| Resolver/auth/control plane | `apps/control-plane-api`, `apps/dashboard-web/app/api/v1` | Unify SDK config/auth semantics |
| Dashboard integration guidance | `apps/dashboard-web/app/projects/_components`, `apps/dashboard-web/lib/data` | Enforce zero-knob guidance and coherent snippets |
| Docs + proof artifacts | `README.md`, `apps/website/app/docs`, `apps/sdk-phase2-demo`, `scripts` | Pitch-ready docs, demos, and pilot evidence loop |

---

## Phase 3 acceptance bar

Phase 3 is complete when:
1. A narrow GA SDK contract is frozen and documented as the default integration.
2. Fallback contract is explicit, adapter-first, and clearly app-owned.
3. Docs + dashboard copy consistently enforce zero runtime knobs in default flows.
4. Runtime readiness guarantees and a doctor/diagnostics command are available.
5. Managed config/auth resolver behavior is unified under one production lane.
6. Telemetry outputs are transformed into reusable pilot value evidence.

---

*Initial Phase 3 decomposition created from approved priorities. All stage files begin in `pending` status.*
