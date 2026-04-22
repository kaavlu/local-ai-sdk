# Repo Hygiene Checklist

Use this checklist in PR review and CI.

- Generated output is not tracked (`.next`, `dist`, `*.tsbuildinfo`, local logs, `supabase/.temp`).
- Root script catalog in `docs/ops/scripts.md` matches `package.json` script entrypoints.
- New scripts are categorized as active or archived.
- Archived assets are documented in `docs/archive/legacy-demo-lanes.md`.
- Deprecated compatibility surfaces are updated in `docs/ops/deprecation-matrix.md`.
