# Stage: Reference demo and hygiene

## Stage name

**reference-demo-and-hygiene** (`06-reference-demo-and-hygiene.md`)

## Objective

Treat [apps/demo-electron](../../../apps/demo-electron) as a **reference/regression harness** (per recovery overview), not the product center. Complete **mechanical hygiene**: rename placeholder `apps/dashboard-web` package name, clarify **`packages/sdk-ts` export boundaries** for demo vs primary APIs, and ensure the demo app tracks **stage 1** entrypoints. Optionally document **`/api/demo/*` naming** strategy alongside stage 3’s product routes.

## Why this stage exists

[AGENTS.md](../../../AGENTS.md) §4 step 4 mentions testing SDK and runtime in a sandbox — demos are useful but must not drive architecture. Separately, [apps/dashboard-web/package.json](../../../apps/dashboard-web/package.json) still uses `"name": "my-project"`, which confuses tooling and onboarding. [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) currently mixes production client and demo helpers — stage 6 finishes **boundary cleanup** without expanding product scope.

## Dependencies on earlier stages

- **[01-sdk-first-contract-and-fallback.md](./01-sdk-first-contract-and-fallback.md)** — Demo app should import the **primary** SDK API for Dyno mode once it exists ([apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts) uses `createDemoProjectSdkContext`, `HttpDemoConfigProvider`, `DynoSdk`).
- **[02-local-runtime-reliability-guardrails.md](./02-local-runtime-reliability-guardrails.md)** — Optional: demo validates timeout behavior; not blocking for rename-only work.

**Full demo E2E honesty:** ideally after **[04-dashboard-website-sdk-first-onboarding.md](./04-dashboard-website-sdk-first-onboarding.md)** so env and URLs match docs — but **package rename and export structure** can proceed after stage 1.

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts) | Dyno vs Gemini backend; `DYNO_PROJECT_ID`, `DYNO_CONFIG_RESOLVER_URL` |
| [apps/demo-electron/package.json](../../../apps/demo-electron/package.json) | Dependency on `@dyno/sdk-ts` |
| [apps/dashboard-web/package.json](../../../apps/dashboard-web/package.json) | `"name": "my-project"` |
| [package.json](../../../package.json) | Workspace scripts referencing `-w ./apps/dashboard-web` |
| [packages/sdk-ts/src/index.ts](../../../packages/sdk-ts/src/index.ts) | Public exports |
| [packages/sdk-ts/package.json](../../../packages/sdk-ts/package.json) | `exports` field |

## Files and directories likely to change

- `apps/dashboard-web/package.json` — `name` field (coordinate with npm workspace scripts if any tool filters by name)
- `packages/sdk-ts/package.json` — optional `exports` subpaths for `demo` vs main
- `packages/sdk-ts/src/index.ts` — re-export layout
- `apps/demo-electron/src/main.ts` — import paths if exports move
- Root `README.md` — workspace names / install instructions if package rename affects `-w` flags

## Detailed substeps (grounded in repo)

1. **Rename dashboard workspace package**  
   Change `name` in [apps/dashboard-web/package.json](../../../apps/dashboard-web/package.json) from `my-project` to a Dyno-specific name (e.g. `dashboard-web` or `@dyno/dashboard-web`). Grep for `my-project` and update references.

2. **Verify root scripts**  
   [package.json](../../../package.json) uses `npm run dev -w ./apps/dashboard-web` — path-based; likely unchanged. Confirm no script uses `-w my-project`.

3. **SDK exports**  
   If stage 1 introduced primary API + demo modules, finalize:
   - root export: primary only, or
   - `exports["./demo"]` for `createDemoProjectSdkContext`, demo providers per Node export maps in [packages/sdk-ts/package.json](../../../packages/sdk-ts/package.json).

4. **Demo-electron imports**  
   Update [apps/demo-electron/src/main.ts](../../../apps/demo-electron/src/main.ts) to use new import paths if demo is split; verify `npm run build -w demo-electron` (or repo script) if present.

5. **README touch-up**  
   [README.md](../../../README.md): list workspace package names accurately after rename.

6. **Demo scope statement**  
   Add short README under `apps/demo-electron/` (only if missing) stating: reference app, not production SKU — **if** no readme exists; do not add large new docs otherwise.

7. **Coordinate with stage 3**  
   If `/api/demo/*` remains, document in one place (overview or stage 3 notes) that “demo” is legacy naming for resolver routes — no extra code in this stage beyond cross-links in plan updates if desired.

## Risks and failure modes

- **Workspace breakage:** renaming npm package name can break tools expecting `my-project` — grep monorepo first.
- **Dual import paths:** subpath exports require consumer `package.json` `moduleResolution` compatibility — verify TypeScript/Node settings for `packages/sdk-ts`.
- **Scope creep:** rewriting demo UI or adding features — out of scope.

## Validation steps

- `npm install` at repo root succeeds.
- `npm run dev -w ./apps/dashboard-web` (or project’s equivalent) still runs.
- `npm run build -w @dyno/sdk-ts` and demo-electron build (if in CI) succeed.
- Grep confirms no stray `my-project` where it referred to dashboard.

## Completion criteria

- [x] `apps/dashboard-web/package.json` **name** is not a placeholder; references updated.
- [x] `packages/sdk-ts` exports reflect **primary vs demo** boundaries as decided in stage 1.
- [x] `apps/demo-electron` imports resolve against final export map; Dyno mode still documented as reference harness.
- [x] No unnecessary new features added to demo app.

## Out of scope

- New demo features, UI polish, or Electron packaging for distribution
- Changing stage 3 product route implementations (already covered there)
- Altering proxy implementation — **stage 5**

## Status

**completed**

## Execution notes

- Verified `apps/dashboard-web/package.json` already uses `"name": "dashboard-web"`; no rename change required in this stage execution.
- Removed transitional demo re-export from `packages/sdk-ts/src/index.ts` so demo helpers are accessed via `@dyno/sdk-ts/demo`.
- Added `typesVersions` mapping for `demo` in `packages/sdk-ts/package.json` so TypeScript consumers using classic `moduleResolution: "node"` can resolve `@dyno/sdk-ts/demo`.
- Updated demo app imports in `apps/demo-electron/src/main.ts` and `apps/demo-electron/src/preload.ts`:
  - kept primary runtime client import (`DynoSdk`, `MachineStateInput`) on `@dyno/sdk-ts`
  - moved demo config helpers/types to `@dyno/sdk-ts/demo`
- Updated root `README.md` wording to reflect that demo helpers are no longer root re-exports.
- Added `apps/demo-electron/README.md` with a concise statement that demo-electron is a reference/regression harness, not a production SKU.
