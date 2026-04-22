# Script Catalog

This index is the canonical map for repo-level scripts.

## Root NPM Entrypoints

`clean`, `build`, `typecheck`, `typecheck:verbose`, `dev:agent`, `dev:agent:9000`, `dev:all:legacy`, `dev:control-plane`, `dev:app`, `dev:runtime-manager`, `dev:dashboard`, `dev:all`, `demo:start`, `doctor:sdk`, `check:repo-hygiene`, `test:sdk:smoke`, `test:control-plane`, `stop:agent`, `stop:app`, `stop:dashboard`, `stop:all`, `demo:stop`, `reset:db`, `reset:agent`

## Active Operational Scripts

- `scripts/clean.cjs` — remove generated build output for selected workspaces.
- `scripts/demo-start.mjs` — orchestrated demo startup with resolver checks.
- `scripts/dyno-doctor.mjs` — SDK/runtime diagnostic runner.
- `scripts/stop-app.mjs` — best-effort demo Electron stop helper.
- `scripts/stop-dashboard.mjs` — best-effort dashboard dev-port cleanup helper.

## Verification Scripts (Active)

- `scripts/sdk-smoke-test.mjs`

Use root `package.json` scripts when available instead of calling files directly.

## Archived / Legacy Scripts

Archived lanes are kept for historical validation and migration reference:

- `scripts/archive/phase4-generate-proof.mjs`
- `scripts/archive/sdk-runtime-matrix.mjs`
- `scripts/archive/step17-comprehensive-verify.mjs`
- `scripts/archive/step13-verify.ps1`
- `scripts/archive/step14-verify.ps1`
- `scripts/archive/step14-manual-verify.ps1`
- `scripts/archive/step15-manual-verify.ps1`
- `scripts/archive/step16-verify.ps1`
- `scripts/archive/step16-verify.mjs`
- `scripts/archive/step17-verify.mjs`
- `scripts/archive/step18-verify.mjs`
- `scripts/archive/step19-verify.mjs`
- `scripts/archive/step19-focused-verify.mjs`
- `scripts/archive/step19-runtime-selftest.mjs`

See `docs/archive/legacy-demo-lanes.md` for rationale and ownership notes.
