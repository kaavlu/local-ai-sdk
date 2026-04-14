# Stage: Local runtime reliability guardrails

## Stage name

**local-runtime-reliability-guardrails** (`02-local-runtime-reliability-guardrails.md`)

## Objective

Ensure the **SDK-controlled path** through `packages/agent` is **bounded and failure-safe** per [AGENTS.md](../../../AGENTS.md) §8, §14: fast local-vs-cloud decision, **fail-fast** local execution, **no worse than cloud-only baseline** when local is skipped or fails. Concretely: align probes, timeouts, and job completion behavior with the **primary SDK API** from stage 1 for at least one vertical slice (e.g. `embed_text` embeddings).

## Why this stage exists

The agent already implements policy, readiness, and real local workloads ([packages/agent/src/policy/index.ts](../../../packages/agent/src/policy/index.ts), [packages/agent/src/jobs/pipeline.ts](../../../packages/agent/src/jobs/pipeline.ts)), but the **SDK** must define upper bounds (wait-for-job timeouts, when to abandon local and call fallback). Without this stage, local execution can still stall or obscure errors relative to calling the cloud provider directly.

## Dependencies on earlier stages

- **[01-sdk-first-contract-and-fallback.md](./01-sdk-first-contract-and-fallback.md)** — Must define the primary orchestration API and fallback adapter so this stage wires **concrete** timeout and error-handling rules into that API (not only into raw `waitForJobCompletion`).

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/agent/src/index.ts](../../../packages/agent/src/index.ts) | Routes: `/health`, `/jobs`, `/debug/readiness`, `/machine-state`, warmup |
| [packages/agent/src/worker/readiness.ts](../../../packages/agent/src/worker/readiness.ts) | Readiness gates, bypass env vars |
| [packages/agent/src/policy/index.ts](../../../packages/agent/src/policy/index.ts) | `resolveExecutionDecision`, execution policies |
| [packages/agent/src/jobs/pipeline.ts](../../../packages/agent/src/jobs/pipeline.ts) | Local vs `cloud_mock` execution; real workload path |
| [packages/agent/src/jobs/index.ts](../../../packages/agent/src/jobs/index.ts) | Job lifecycle, validation |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | `waitForJobCompletion` defaults (poll interval, timeout) |
| Stage 1 SDK entrypoints (after implementation) | Where orchestration and fallback are invoked |

## Files and directories likely to change

- `packages/sdk-ts/src/**/*.ts` — orchestration layer: timeouts, error mapping to fallback
- `packages/agent/src/**/*.ts` — only if contract gaps require (e.g. explicit cancel, tighter health semantics); prefer SDK-side bounds first per recovery ordering

## Detailed substeps (grounded in repo)

1. **Define the reliability contract**  
   Document maximum time the SDK will wait for: agent TCP connect, `/health`, optional `/debug/readiness`, job completion for `embed_text`. Map agent states (`queued`, `running`, `completed`, `failed`) to SDK actions (retry vs fallback vs surface error).

2. **Align with existing `waitForJobCompletion`**  
   [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) uses default `timeoutMs` (e.g. 10000) and 300ms polling — evaluate whether embeddings need longer max duration **only** at orchestration layer with explicit user-facing cap.

3. **Health and readiness probes**  
   Use `DynoSdk.healthCheck()` and, if needed, `getDebugMetrics` or readiness-related endpoints already exposed by agent (`/debug/readiness` in [packages/agent/src/index.ts](../../../packages/agent/src/index.ts)) — list which probes the primary SDK path calls before enqueueing local work.

4. **Single vertical slice E2E**  
   Prove: agent down → fallback runs; agent up but job fails → fallback or error per stage 1 contract; local success → no fallback. Use `apps/demo-electron` only as an optional manual harness, not as the definition of done.

5. **Cloud mock vs real fallback**  
   Agent’s `cloud_mock` ([packages/agent/src/executors/index.ts](../../../packages/agent/src/executors/index.ts)) is **not** the product fallback — stage 1’s **developer adapter** is. Ensure the orchestration path does not conflate agent-side mock cloud with real cloud fallback.

6. **Environment and dev bypass**  
   Document interaction with `DYNO_READINESS_BYPASS` / legacy env names in agent — SDK should not rely on bypass for production behavior; document for local dev only.

## Risks and failure modes

- **Over-editing agent:** large changes to worker concurrency or pipeline before SDK bounds are clear — prefer SDK timeouts first.
- **False success:** demo-electron “works” while generic app integration fails — validate via the **primary SDK API**, not only demo.
- **Long local inference:** Transformers workloads may exceed naive timeouts — product may need user-tunable caps or separate “max local wait” for embeddings; document tradeoff.

## Validation steps

- `npm run typecheck -w @dyno/sdk-ts` and `npm run typecheck -w @dyno/agent` pass after changes.
- Scripted or manual scenario matrix: agent stopped; agent running, job failure; agent running, success.
- Confirm no code path leaves the user **worse off** than calling their cloud client directly when local is declined or errors (AGENTS.md §14).

## Completion criteria

- [ ] Primary SDK orchestration path (stage 1) applies **documented** timeouts and error mapping for the chosen vertical slice.
- [ ] Local attempt is **bounded**; fallback invocation is **predictable** when local is unavailable or fails.
- [ ] Readiness/health usage is explicit (which endpoints, in what order).
- [ ] No reliance on hosted `control-plane-api` for this stage’s definition of done.

## Out of scope

- New product config HTTP endpoints — **stage 3**
- Dashboard “ready for requests” semantics — **stage 4**
- Proxy labeling — **stage 5**
- Package rename / export cleanup — **stage 6**

## Status

**pending**
