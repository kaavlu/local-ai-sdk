# SDK/Agent Deprecation Matrix

Compatibility shims are retained intentionally; this matrix tracks phased removal.

| Surface | Location | Status | Consumer Risk | Target Phase |
|---|---|---|---|---|
| `DemoProject*` aliases | `packages/sdk-ts/src/config-provider.ts` | Deprecated, still exported | Medium (external imports possible) | Phase 2 (announce + replace), Phase 3 (remove) |
| Legacy readiness env `LOCAL_AI_READINESS_BYPASS` | `packages/agent/src/worker/readiness.ts` | Deprecated, still honored | Low/Medium (local tooling scripts) | Phase 2 (migrate scripts), Phase 3 (remove) |
| Legacy data dir env `LOCAL_AGENT_DATA_DIR` and `.local-agent-data` fallback | `packages/agent/src/db/paths.ts` | Legacy compatibility path | Medium | Phase 2 (migrate docs/scripts), Phase 4 (remove fallback) |
| Legacy `policy` job compatibility | `packages/agent/src/jobs/index.ts` and `packages/sdk-ts/src/types.ts` | Backward compatibility maintained | High | Phase 2 (telemetry usage audit), Phase 4+ (remove) |

## Quarterly Review Checklist

- Verify active internal scripts no longer require legacy env names.
- Confirm no current app code depends on deprecated type aliases.
- Re-evaluate removal phase based on compatibility telemetry and release notes.
