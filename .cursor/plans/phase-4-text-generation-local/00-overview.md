# Dyno phase 4 plan — local text generation

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical architecture and decision rules).

**Purpose of this folder:** Add a local-first text generation lane to the SDK/runtime stack so developers can run generation on the same user device when viable and reliably fall back to app-owned cloud providers.

**Phase 4 framing:** Ship the smallest credible local generation product in three moves:
- one local runtime workload for generation with deterministic lifecycle behavior
- one SDK contract for `generateText(...)` that mirrors existing local-first + fallback semantics
- one validation and DX pass that proves `Xenova/distilgpt2` (or similar small model) runs locally end-to-end

---

## Stage plan files

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-agent-local-generation-workload.md](./01-agent-local-generation-workload.md) | `phase4-agent-generate-workload` |
| 2 | [02-sdk-generation-contract-and-fallback.md](./02-sdk-generation-contract-and-fallback.md) | `phase4-sdk-generate-contract` |
| 3 | [03-local-validation-docs-and-demo.md](./03-local-validation-docs-and-demo.md) | `phase4-local-generate-validation` |

---

## Stage ordering and dependencies

```text
phase4-agent-generate-workload
  └─> phase4-sdk-generate-contract
        └─> phase4-local-generate-validation
```

- **`phase4-agent-generate-workload` first:** local generation must exist and be stable before exposing SDK APIs.
- **`phase4-sdk-generate-contract` second:** contract/fallback semantics should be finalized before docs and demo workflows.
- **`phase4-local-generate-validation` last:** validate and package operator/developer guidance against the real implementation.

---

## Repo anchors (Phase 4 focus)

| Area | Path | Phase 4 role |
|------|------|--------------|
| Local runtime workloads | `packages/agent/src/workloads`, `packages/agent/src/models`, `packages/agent/src/executors` | Add `generate_text` workload, model lifecycle, warmup, and debug/readiness hooks |
| Runtime scheduling/lifecycle | `packages/agent/src/models/workload-model-runtime.ts`, `packages/agent/src/index.ts` | Extend residency/eviction/timeout behavior for generation |
| SDK surface | `packages/sdk-ts/src/dyno.ts`, `packages/sdk-ts/src/index.ts`, `packages/sdk-ts/src/types.ts` | Add `generateText` GA contract and result types |
| SDK runtime logic | `packages/sdk-ts/src/*runtime*.ts` | Add local preflight + fallback execution flow for generation |
| Verification and docs | `scripts`, `README.md`, `apps/website/app/docs`, `apps/demo-electron` | Prove and document local `distilgpt2` execution workflow |

---

## Phase 4 acceptance bar

Phase 4 is complete when:
1. Local runtime can execute `generate_text` jobs using `Xenova/distilgpt2` (or a similar small local model).
2. SDK exposes a stable local-first generation entrypoint with explicit fallback semantics.
3. Model residency and eviction avoid load/unload thrash in normal interactive use.
4. Team can run a repeatable local verification flow that demonstrates on-device generation.
5. Docs and snippets position generation in the SDK/runtime lane (hosted proxy remains secondary).

---

*Initial Phase 4 decomposition created from current local-first architecture and Phase 3 contract patterns. All stage files begin in `pending` status.*
