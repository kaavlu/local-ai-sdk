# Stage: Golden path quickstart (single onboarding story)

## Stage name

**phase6-golden-path-quickstart** (`01-golden-path-quickstart.md`)

## Objective

Reduce onboarding to **one canonical path**: environment variables, code snippet, and “what runs locally” explanation that all agree. A reader should not need to merge `README.md`, `packages/sdk-ts/README.md`, website docs, and demo READMEs mentally.

## Why this stage exists

Pre-demo trust is mostly **cognitive load**. If three docs disagree on required env vars or on whether `generateTextAdapter` is required vs HTTP fallback, external viewers assume the product is unfinished.

## Dependencies on earlier stages

- Builds on: [../phase-3/01-sdk-ga-contract-and-surface-hardening.md](../phase-3/01-sdk-ga-contract-and-surface-hardening.md)
- Builds on: [../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md](../phase-3/03-zero-runtime-knobs-dx-and-ui-copy.md)
- Builds on: [../phase-4-text-generation-local/03-local-validation-docs-and-demo.md](../phase-4-text-generation-local/03-local-validation-docs-and-demo.md)

## Files and directories to inspect

| Path | Why |
|------|-----|
| [README.md](../../../README.md) | Root quickstart, scripts, env tables |
| [packages/sdk-ts/README.md](../../../packages/sdk-ts/README.md) | Package-level GA example |
| [packages/sdk-ts/src/dyno.ts](../../../packages/sdk-ts/src/dyno.ts) | Actual `DynoInitOptions` + fallback requirements |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) (or adjacent docs routes) | Public docs snippets |
| [apps/sdk-phase2-demo/README.md](../../../apps/sdk-phase2-demo/README.md) | Env matrix for compare demo |
| [apps/demo-electron/README.md](../../../apps/demo-electron/README.md) | Harness env + doctor/smoke flow |

## Files and directories likely to change

- `README.md`
- `packages/sdk-ts/README.md`
- `apps/website/...` docs components/pages that embed SDK examples
- Optionally `apps/dashboard-web` project onboarding cards if they duplicate snippets

## Detailed substeps

1. **Inventory every “getting started” surface**  
   List each file that shows `Dyno.init` or env vars. Note conflicts (e.g. embeddings-only vs generation, adapter-first vs `baseUrl`/`apiKey` only).

2. **Pick one canonical snippet per use case**  
   - **Minimum viable:** `Dyno.init` + `projectApiKey` + `fallback.generateTextAdapter` (and/or `fallback.adapter` for embeddings-only apps).  
   - **Secondary:** convenience `fallback.baseUrl` + `fallback.apiKey` explicitly labeled “quick test / secondary.”

3. **Define a single env matrix table**  
   Columns: variable, required?, used by, default. Include: `DYNO_PROJECT_API_KEY`, `DYNO_CONFIG_RESOLVER_URL`, `DYNO_AGENT_URL` / `DYNO_RUNTIME_HELPER_PATH`, fallback vars, optional generation model paths. Align defaults with `ManagedProjectConfigProvider` (`DEFAULT_LOCAL_RESOLVER_URL`) and runtime controller defaults.

4. **Add a “choose your path” decision tree (short)**  
   - Managed config (dashboard + project API key) vs custom `ProjectConfigProvider` (advanced).  
   - When to run `npm run doctor:sdk` vs `npm run test:sdk:smoke` vs `npm run dev:all`.

5. **De-duplicate snippets**  
   Prefer one source of truth: either inline in root README with package README pointing to it, or shared doc section linked from both. Avoid drift.

6. **Verify copy-paste**  
   From a clean clone: `npm install`, `npm run build`, set only documented vars, run one embedding call and one generation call per canonical path.

## Risks and failure modes

- Docs promise “zero knobs” but still list many env vars—mitigate with “minimal” vs “full pilot” tiers.
- Website docs lag repo README—mitigate with explicit “last verified against commit” note or CI check list.

## Cursor verification gate (before marking complete)

- `npm run build` (or minimal `npm run build -w @dynosdk/ts -w @dyno/agent` if you scope)
- `npm run test -w @dynosdk/ts`
- Manual: follow **only** the updated golden path doc on a fresh mental model (no other files).

## Completion criteria

- [x] One canonical quickstart path is named and repeated consistently across root + package README + public docs.
- [x] Env matrix matches implementation defaults in `dyno.ts`, `demo-http-config-provider.ts`, and `default-runtime-controller.ts`.
- [x] Secondary/advanced paths are labeled and do not appear as the first snippet.

## Out of scope

- New SDK API shapes (unless a doc bug reveals a real API gap—then file a follow-up issue).
- Marketing site redesign.

## Status

**completed** (2026-04-22)

## Stage notes

- Implemented:
  - Added canonical section `Golden path quickstart (Phase 6 default)` in root `README.md`.
  - Added one env matrix table and short "choose your path" decision flow in root docs.
  - Updated `packages/sdk-ts/README.md` to explicitly point to the canonical root quickstart and keep env guidance aligned.
  - Updated website docs (`apps/website/app/docs/page.tsx`) with a matching env matrix and corrected `Dyno.init` argument guidance.
  - Updated `apps/sdk-phase2-demo/README.md` to mark adapter-first fallback as default and wrapper envs as optional secondary.
- Verification:
  - `npm run -w website build` (pass)
  - `npm run -w @dynosdk/ts test` (pass)
  - `ReadLints` on changed files (no diagnostics)
- Manual verification notes:
  - Commands decision flow is now explicit (`doctor:sdk`, `test:sdk:smoke`, `dev:all`) in canonical quickstart.
  - Adapter-first vs convenience-wrapper ordering is now consistent across root/package/website/demo docs.
