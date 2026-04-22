# Dyno phase 6 plan — pre-demo SDK hardening

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical architecture and decision rules).

**Purpose of this folder:** Turn the existing SDK + runtime + dashboard stack into something you can **confidently show externally**: one obvious onboarding path, resilient config when the control plane blips, visible telemetry without bespoke wiring, a crisp fallback-credential boundary, and a generation demo that does not embarrass you on first load.

**Phase 6 framing:** Phase 3–5 established contracts, dashboard UX, and local generation. Phase 6 is **polish and trust** before demos and early SDK distribution:

- one **golden path** quickstart (docs + snippets + env matrix)
- **durable config resilience** beyond in-process TTL cache
- **default telemetry backhaul** so pilots see signals without inventing sinks
- **fallback credential story** aligned with app-owned secrets (resolver/dashboard optional modes)
- **local generation demo UX** (warmup, latency expectations, honest capability copy)

This phase intentionally **does not** add a new “demo verification gate” script; you can fold that into scripts later if desired.

---

## Stage plan files

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-golden-path-quickstart.md](./01-golden-path-quickstart.md) | `phase6-golden-path-quickstart` |
| 2 | [02-config-resilience-beyond-memory-cache.md](./02-config-resilience-beyond-memory-cache.md) | `phase6-config-disk-resilience` |
| 3 | [03-default-telemetry-backhaul.md](./03-default-telemetry-backhaul.md) | `phase6-default-telemetry` |
| 4 | [04-fallback-credential-boundary.md](./04-fallback-credential-boundary.md) | `phase6-fallback-credential-boundary` |
| 5 | [05-local-generation-demo-ux.md](./05-local-generation-demo-ux.md) | `phase6-local-generation-demo-ux` |

---

## Stage ordering and dependencies

```text
phase6-golden-path-quickstart
  └─> phase6-config-disk-resilience
        └─> phase6-default-telemetry
              └─> phase6-fallback-credential-boundary
                    └─> phase6-local-generation-demo-ux
```

- **Golden path first:** narrative and env matrix must match reality before you harden persistence and telemetry.
- **Config resilience second:** cold start and offline-ish behavior must not contradict the quickstart promises.
- **Default telemetry third:** once config identity is stable, default sinks can target the right project and auth.
- **Fallback boundary fourth:** avoid shipping demos that accidentally teach “put OpenAI keys in the dashboard” as the default.
- **Generation demo UX last:** depends on honest fallback/config copy and optional telemetry for “what happened.”

---

## Repo anchors (Phase 6 focus)

| Area | Path | Phase 6 role |
|------|------|--------------|
| GA SDK surface | `packages/sdk-ts/src/dyno.ts`, `packages/sdk-ts/src/index.ts`, `packages/sdk-ts/README.md` | Single quickstart story |
| Config fetch + cache | `packages/sdk-ts/src/demo-http-config-provider.ts`, `packages/sdk-ts/src/embeddings-runtime.ts`, `packages/sdk-ts/src/generation-runtime.ts` | Disk-backed or durable LKG cache |
| Telemetry | `packages/sdk-ts/src/embeddings-runtime.ts`, `packages/sdk-ts/src/telemetry-http-sink.ts`, `packages/sdk-ts/src/dyno.ts` | Default sink wiring + payload correctness |
| Control plane ingestion | `apps/control-plane-api/src/server.ts` (`POST /telemetry/events`, tests) | Contract alignment for default sink |
| Dashboard resolver | `apps/dashboard-web/lib/server/sdk-config-resolver.ts`, project UI | Optional upstream secret relay vs app-owned |
| Local generation | `packages/agent/src/models/generate-text-model.ts`, `packages/agent/src/executors/generate-text.ts`, `apps/demo-electron` | Warmup, copy, harness behavior |
| Root docs | `README.md`, `apps/website/app/docs` | One canonical path |

---

## Phase 6 acceptance bar

Phase 6 is complete when:

1. A new developer can follow **one** documented path from zero to `Dyno.init` + `generateText` / `embedText` without reconciling conflicting snippets.
2. Project config survives **resolver unavailability** within defined staleness rules (not only in-memory TTL).
3. **Opt-in or default** telemetry reaches the hosted plane with project attribution, without blocking inference.
4. **Default** integration story does not require storing provider API keys in Dyno; any dashboard-stored upstream key path is explicitly labeled non-default / advanced.
5. Demo and docs set expectations for **first-token latency** and memory behavior for local `generate_text`.

---

*Stage files start in **pending** status until you mark them complete in each file’s Status section.*
