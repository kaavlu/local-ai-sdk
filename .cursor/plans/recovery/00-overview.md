# Dyno recovery plan — overview

**Source of truth:** [AGENTS.md](../../../AGENTS.md) (canonical product direction, architecture boundaries, priorities).

**Purpose of this folder:** Persist an execution-ready recovery sequence that moves the monorepo from its current **hosted-proxy–heavy, demo-coupled** shape toward the intended **SDK + local runtime + control plane (config + analytics)** architecture.

**Terminology (public docs / README):** Dyno is **SDK-first**; **local-first** with **developer-owned** cloud fallback; **control plane** = **configuration + telemetry** (the hosted **OpenAI-compatible** API is an **optional secondary** lane, not mainline inference routing).

**Stage plan files (expanded):**

| # | File | Stage slug |
|---|------|------------|
| 1 | [01-sdk-first-contract-and-fallback.md](./01-sdk-first-contract-and-fallback.md) | `sdk-first-contract-and-fallback` |
| 2 | [02-local-runtime-reliability-guardrails.md](./02-local-runtime-reliability-guardrails.md) | `local-runtime-reliability-guardrails` |
| 3 | [03-product-config-telemetry-plane.md](./03-product-config-telemetry-plane.md) | `product-config-telemetry-plane` |
| 4 | [04-dashboard-website-sdk-first-onboarding.md](./04-dashboard-website-sdk-first-onboarding.md) | `dashboard-website-sdk-first-onboarding` |
| 5 | [05-optional-proxy-secondary-lane.md](./05-optional-proxy-secondary-lane.md) | `optional-proxy-secondary-lane` |
| 6 | [06-reference-demo-and-hygiene.md](./06-reference-demo-and-hygiene.md) | `reference-demo-and-hygiene` |

**Repo anchors (current layout):**

| Area | Path | Role today (relevant to recovery) |
|------|------|-----------------------------------|
| TypeScript SDK | `packages/sdk-ts` | Primary SDK surface for the local runtime + demo config helpers; local-or-cloud orchestration still evolving toward AGENTS.md |
| Local runtime | `packages/agent` | Localhost agent: jobs, readiness, real `embed_text` / `classify_text`; cloud path still mock-oriented in pipeline |
| Control plane API | `apps/control-plane-api` | Config resolution + telemetry; optional OpenAI-compatible `/v1/*` (auth via dashboard resolver; embeddings + cloud upstream for hosted path) |
| Dashboard | `apps/dashboard-web` | Supabase projects/config, `/api/demo/*` resolver + auth, integration snippets defaulting to OpenAI→Dyno base URL |
| Marketing | `apps/website` | SDK messaging vs OpenAI baseURL quickstart tension |
| Reference demo | `apps/demo-electron` | Validates agent + resolver; not the sellable product surface |

---

## Recovery plan (full ordered sequence)

1. **Define the SDK as the primary integration surface** — high-level API that: loads/caches project config, evaluates local viability, invokes `packages/agent` when appropriate, invokes **developer-supplied** cloud fallback (not Dyno-relayed secrets to devices), emits telemetry best-effort. Keep low-level `DynoSdk` agent calls as an advanced/internal surface if still needed.
2. **Align local runtime contract with that SDK** — explicit health/readiness probes, bounded local execution (timeouts, fail-fast), predictable behavior when local is skipped, documented lifecycle expectations for `packages/agent` (localhost binding, ports, worker behavior).
3. **Introduce product-grade control-plane surfaces for config + telemetry** — replace reliance on `/api/demo/project-config/*` and ad hoc patterns as the *implicit* production contract with versioned, cache-friendly SDK config delivery and telemetry ingestion wired to existing `request_executions` / dashboard reads where applicable (`apps/control-plane-api`, `apps/dashboard-web` server routes).
4. **Reframe dashboard and website onboarding** — default integration path: `@dyno/sdk-ts` (or successor package name) + local runtime; OpenAI-compatible `8788` path documented as **secondary** (sandbox/enterprise/testing per AGENTS.md). Update `project-page-view-model.ts` snippets, `project-integration-card.tsx`, and `apps/website` docs/hero/pricing so they do not imply the hosted proxy is mainline.
5. **Constrain the optional proxy lane** — `apps/control-plane-api` OpenAI routes remain useful but must not absorb roadmap priority; explicit labeling, minimal necessary maintenance, no expansion that competes with SDK/runtime work.
6. **Keep `apps/demo-electron` as a regression/reference harness** — not a roadmap driver; optional alignment only after core SDK loop is stable.
7. **Hygiene that unblocks execution** — e.g. rename `apps/dashboard-web` package from placeholder `my-project` to a Dyno-specific name; isolate demo-only exports under explicit compatibility boundaries in `packages/sdk-ts`.

---

## Major execution stages (slug-based)

Stages are ordered for **contract-first** recovery: the SDK and runtime semantics must exist before stable config APIs and before GTM/dashboard copy that references those APIs.

| Order | Slug | Status | Summary |
|-------|------|--------|---------|
| 1 | `sdk-first-contract-and-fallback` | **pending** | New primary SDK API in `packages/sdk-ts`: config loading + cache hooks, local-vs-cloud decision orchestration, developer-owned fallback adapter, telemetry hooks; demote demo helpers from default path. |
| 2 | `local-runtime-reliability-guardrails` | **pending** | Harden `packages/agent` + SDK integration: bounded local attempts, timeouts, health/readiness contract used by SDK, one vertical slice (e.g. embeddings) proven E2E without worse-than-cloud behavior. |
| 3 | `product-config-telemetry-plane` | **pending** | Add stable config + telemetry ingestion in `apps/control-plane-api` and/or `apps/dashboard-web` route handlers; migrate off `/api/demo/*` as the core SDK dependency; preserve shims during transition. |
| 4 | `dashboard-website-sdk-first-onboarding` | **pending** | Update `apps/dashboard-web` (integration card, setup copy, view models) and `apps/website` (quickstart, pricing framing) to match SDK-first mainline; optional proxy clearly secondary. |
| 5 | `optional-proxy-secondary-lane` | **pending** | Governance + docs for `apps/control-plane-api` OpenAI compatibility: secondary mode, no feature race with SDK; billing/metrics language aligned with telemetry-first reality. |
| 6 | `reference-demo-and-hygiene` | **pending** | `apps/demo-electron` alignment smoke tests; package rename (`dashboard-web`), `sdk-ts` export boundaries, demo route naming strategy. |

---

## Dependencies between stages

```text
sdk-first-contract-and-fallback
  └─> local-runtime-reliability-guardrails
        └─> product-config-telemetry-plane
              └─> dashboard-website-sdk-first-onboarding
                    └─> optional-proxy-secondary-lane
reference-demo-and-hygiene  ──(can start after stage 1; completes after 2–4 for honest E2E)──>
```

- **`sdk-first-contract-and-fallback` → `local-runtime-reliability-guardrails`:** The agent cannot be “hardened” in a vacuum; the SDK must define what “try local” means (timeouts, failure modes, when to call fallback).
- **`local-runtime-reliability-guardrails` → `product-config-telemetry-plane`:** Telemetry events and config payloads should reflect real SDK/runtime semantics, not proxy-only paths.
- **`product-config-telemetry-plane` → `dashboard-website-sdk-first-onboarding`:** Dashboard snippets and env vars must point at stable, non-demo-prefixed APIs where possible; otherwise onboarding lies about the product.
- **`dashboard-website-sdk-first-onboarding` → `optional-proxy-secondary-lane`:** GTM and UI must already treat proxy as secondary before investing in proxy governance (avoids doubling down on the wrong surface).
- **`reference-demo-and-hygiene`:** Parallelizable after stage 1 for mechanical hygiene; full demo validation waits until stages 2–4 prove the loop.

---

## Why this ordering is correct

1. **AGENTS.md prioritizes SDK/runtime over hosted proxy** — contract work in `packages/sdk-ts` and `packages/agent` must lead, or control-plane and dashboard changes will keep optimizing the wrong path.
2. **Config and telemetry APIs depend on stable client behavior** — `product-config-telemetry-plane` needs known event shapes and fetch cadence from the SDK, not the reverse.
3. **Dashboard and website currently encode proxy-first onboarding** (`project-page-view-model.ts`, integration card, website docs) — changing them before the SDK and APIs exist risks churn and false documentation.
4. **The monorepo already couples control-plane auth to `apps/dashboard-web` resolver routes** — migrating to product-grade endpoints is a deliberate stage after the SDK knows what it needs to fetch and send.

---

## Stage detail (execution pointers, not vague)

### `sdk-first-contract-and-fallback` — **pending**

- **Primary paths:** `packages/sdk-ts` (`src/client.ts`, `src/index.ts`, demo modules), types for config + fallback.
- **Exit idea:** A documented primary API that implements App → SDK → local runtime → developer fallback → telemetry intent from AGENTS.md §2, §5.2–5.3, §6, §8–9.

### `local-runtime-reliability-guardrails` — **pending**

- **Primary paths:** `packages/agent` (`src/index.ts`, `src/policy`, `src/worker`, `src/jobs/pipeline.ts`), SDK call sites.
- **Exit idea:** Worst-case path matches “call cloud directly” baseline for the supported slice; no unbounded local hangs in the SDK-controlled path.

### `product-config-telemetry-plane` — **pending**

- **Primary paths:** `apps/control-plane-api` (`src/project-context.ts`, `src/auth`, `src/persistence`), `apps/dashboard-web/app/api/demo/**` (to be superseded or shimmed), Supabase-backed tables consumed by `lib/data/dashboard-data.ts`.
- **Exit idea:** SDK reads config and posts telemetry without treating `/api/demo/*` as the permanent name or sole implementation of production config.

### `dashboard-website-sdk-first-onboarding` — **pending**

- **Primary paths:** `apps/dashboard-web/lib/data/project-page-view-model.ts`, `apps/dashboard-web/app/projects/_components/project-integration-card.tsx`, `apps/website/app/docs/page.tsx`, `apps/website/components/sections/hero.tsx`, pricing.
- **Exit idea:** First-run developer path matches SDK-first; proxy documented as optional.

### `optional-proxy-secondary-lane` — **pending**

- **Primary paths:** `apps/control-plane-api/src/server.ts`, routing under `src/routing`, executors.
- **Exit idea:** Proxy remains supported for listed secondary uses in AGENTS.md §12 without roadmap competition against SDK/runtime.

### `reference-demo-and-hygiene` — **pending**

- **Primary paths:** `apps/demo-electron`, `apps/dashboard-web/package.json`, `packages/sdk-ts` exports.
- **Exit idea:** No placeholder package names blocking releases; demo app tracks the real SDK entrypoints.

---

*Last updated: recovery plan seed from AGENTS.md + monorepo structure. All stages above remain **pending** until individually marked complete in follow-on plan files.*
