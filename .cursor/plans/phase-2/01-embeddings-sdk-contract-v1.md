# Stage: Embeddings SDK contract v1

## Stage name

**phase2-sdk-contract-v1** (`01-embeddings-sdk-contract-v1.md`)

## Objective

Finalize a stable, production-credible embeddings contract in `@dyno/sdk-ts` that preserves the AGENTS architecture: **SDK decides local vs cloud on-device**, local path is bounded, cloud fallback is developer-owned, and telemetry is best-effort.

## Why this stage exists

Recovery established a working primary runtime API, but follow-up notes still call out contract gaps (reason taxonomy depth, stale-cache behavior tests, timeout compatibility coverage). Phase 2 needs a locked v1 contract before dashboard and control-plane semantics are hardened around it.

## Dependencies on earlier stages

- Builds on completed recovery stages:
  - [../recovery/01-sdk-first-contract-and-fallback.md](../recovery/01-sdk-first-contract-and-fallback.md)
  - [../recovery/02-local-runtime-reliability-guardrails.md](../recovery/02-local-runtime-reliability-guardrails.md)
  - [../recovery/03-product-config-telemetry-plane.md](../recovery/03-product-config-telemetry-plane.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [packages/sdk-ts/src/embeddings-runtime.ts](../../../packages/sdk-ts/src/embeddings-runtime.ts) | Primary orchestration path and reason mapping |
| [packages/sdk-ts/src/types.ts](../../../packages/sdk-ts/src/types.ts) | Public contract and reason/event typing |
| [packages/sdk-ts/src/config-provider.ts](../../../packages/sdk-ts/src/config-provider.ts) | Config interfaces and cache wrapper behavior |
| [packages/sdk-ts/src/telemetry-http-sink.ts](../../../packages/sdk-ts/src/telemetry-http-sink.ts) | Best-effort transport semantics |
| [packages/sdk-ts/src/client.ts](../../../packages/sdk-ts/src/client.ts) | Agent probe and job wait behavior |
| [packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts](../../../packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts) | Existing runtime + telemetry assertions |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public exports to keep stable |
| [README.md](../../../README.md) | Canonical SDK usage documentation |

## Files and directories likely to change

- `packages/sdk-ts/src/embeddings-runtime.ts`
- `packages/sdk-ts/src/types.ts`
- `packages/sdk-ts/src/config-provider.ts`
- `packages/sdk-ts/src/telemetry-http-sink.ts`
- `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts`
- `README.md`

## Detailed substeps (grounded in repo)

1. **Lock reason taxonomy and failure classes**  
   Normalize output reason values under stable categories (`preflight`, `local_execution`, `fallback`, `config`) and ensure each terminal path maps deterministically.

2. **Clarify fallback semantics**  
   Make behavior explicit for:
   - fallback disabled + local failure
   - fallback enabled + fallback failure
   - fallback timeout/error surface relative to local attempt metadata

3. **Add batch embeddings path (`embedTexts`)**  
   Introduce a deterministic batch API and specify telemetry accounting rules (single event vs per-item events, partial failures, aggregate latency).

4. **Harden config cache/offline behavior**  
   Define default TTL, stale-use rules, and explicit no-cache behavior on cold-start resolver failure.

5. **Harden telemetry sink behavior**  
   Keep telemetry non-blocking while adding bounded retry/backoff and queue limits for repeated network failures.

6. **Document v1 contract**  
   Update root docs with one canonical embeddings integration example and a concise contract section describing decisions, reasons, and fallback ownership assumptions.

7. **Expand tests to contract level**  
   Add tests for:
   - readiness timeout and debug endpoint compatibility
   - stale-cache fallback and cold-start failure paths
   - telemetry non-blocking with retry budget exhaustion
   - batch embeddings success/failure accounting

## Risks and failure modes

- **Contract churn:** dashboard/control-plane code may lock onto unstable reason strings.
- **Performance regression:** retries or batch logic may add latency to hot path.
- **API confusion:** exposing too many runtime variants can blur primary path.

## Validation steps

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
- Manual trace: local success, local timeout, readiness blocked, fallback error; verify decision/reason outputs remain stable.

## Completion criteria

- [x] Embeddings runtime contract (single + batch) is documented, typed, and covered by automated tests.
- [x] Reason taxonomy is stable and suitable for dashboard/control-plane consumers.
- [x] Config cache/offline behavior is explicit and verified by tests.
- [x] Telemetry path remains non-blocking with bounded retry/queue behavior.

## Out of scope

- New non-embeddings workloads as primary scope (text generation, classify, etc.)
- Dashboard UI changes (handled by stage 3 in this folder)
- Control-plane schema/version changes (handled by stage 4 in this folder)

## Status

**completed**

## Stage notes

- Added stable runtime reason contract in `packages/sdk-ts/src/embeddings-runtime.ts` with explicit `reasonCategory` (`preflight`, `local_execution`, `fallback`, `config`) and typed reason values for terminal paths.
- Clarified fallback behavior:
  - fallback-disabled paths now fail with explicit `fallback_disabled` messaging
  - fallback adapter failures surface `fallback_adapter_error` / `fallback_adapter_timeout` with local-attempt reason context
- Added deterministic batch embeddings API `embedTexts()` with optional `failFast`, per-item result capture, and one aggregate telemetry event (`embeddings_batch_execution`) containing item/success/failure counts.
- Hardened config cache behavior in `CachedProjectConfigProvider`:
  - default TTL remains bounded
  - stale-on-error is explicit and configurable
  - `ttlMs: 0` enforces no-cache mode and cold-start failures are not masked
- Hardened telemetry transport in `createHttpTelemetrySink()` with bounded in-memory queue, retry budget, and backoff while preserving non-blocking runtime behavior.
- Updated SDK exports and README contract notes to document batch semantics, reason taxonomy, and telemetry behavior.
- Expanded SDK tests in `packages/sdk-ts/src/__tests__/embeddings-runtime.telemetry.test.ts` to cover reason category mapping, stale-cache/cold-start semantics, fallback timeout signaling, batch telemetry accounting, and telemetry retry budget exhaustion.

## Validation run

- `npm run typecheck -w @dyno/sdk-ts`
- `npm run test -w @dyno/sdk-ts`
