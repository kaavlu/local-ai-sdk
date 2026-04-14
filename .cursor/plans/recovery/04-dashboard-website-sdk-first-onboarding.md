# Stage: Dashboard and website SDK-first onboarding

## Stage name

**dashboard-website-sdk-first-onboarding** (`04-dashboard-website-sdk-first-onboarding.md`)

## Objective

Align **developer-facing onboarding** with [AGENTS.md](../../../AGENTS.md) §2, §11–13: the **default** integration story is **Dyno SDK + local runtime**; the **OpenAI-compatible** `control-plane-api` base URL is **secondary** (sandbox, enterprise, tooling). Update dashboard integration snippets and marketing/docs/pricing so they do not imply the hosted proxy is mainline.

## Why this stage exists

[apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) defaults `NEXT_PUBLIC_DYNO_BASE_URL` to `http://127.0.0.1:8788/v1` and builds OpenAI SDK snippets. [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) states integration via OpenAI-compatible requests with a Dyno API key. [apps/website/components/sections/hero.tsx](../../../apps/website/components/sections/hero.tsx) and [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) lead with `openai` + `baseURL` to port 8788. That contradicts the recovery plan and AGENTS.md priority order (SDK/runtime first, optional proxy fourth).

## Dependencies on earlier stages

- **[01-sdk-first-contract-and-fallback.md](./01-sdk-first-contract-and-fallback.md)** — Stable **primary SDK import path** and usage pattern to show in UI/docs.
- **[03-product-config-telemetry-plane.md](./03-product-config-telemetry-plane.md)** — Env vars and URLs for config (if snippets mention where config is loaded from) should reference **product** surfaces, not only `/api/demo/*`.

**Optional dependency:** [02-local-runtime-reliability-guardrails.md](./02-local-runtime-reliability-guardrails.md) — Copy can mention timeouts/reliability once defined; not blocking for text-only doc updates.

## Files and directories to inspect

| Path | Why |
|------|-----|
| [apps/dashboard-web/lib/data/project-page-view-model.ts](../../../apps/dashboard-web/lib/data/project-page-view-model.ts) | `buildOpenAiEmbeddingsSnippet`, `buildOpenAiChatSnippet`, default base URL |
| [apps/dashboard-web/app/projects/_components/project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx) | Integration section title and footnote |
| [apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) | “Next step” copy pointing at integration snippet |
| [apps/dashboard-web/app/projects/[projectId]/page.tsx](../../../apps/dashboard-web/app/projects/[projectId]/page.tsx) | Wires view model into cards |
| [apps/website/components/sections/hero.tsx](../../../apps/website/components/sections/hero.tsx) | Hero code sample |
| [apps/website/app/docs/page.tsx](../../../apps/website/app/docs/page.tsx) | Quickstart vs `DynoSdk` alternative |
| [apps/website/app/pricing/page.tsx](../../../apps/website/app/pricing/page.tsx) | “routed requests / month” framing |

## Files and directories likely to change

- `apps/dashboard-web/lib/data/project-page-view-model.ts` — add SDK-first snippet builders; reorder or tab content in view model
- `apps/dashboard-web/app/projects/_components/project-integration-card.tsx` — UI for primary vs optional OpenAI proxy tab
- `apps/website/**` — hero, docs, pricing copy
- `apps/dashboard-web/lib/data/project-page-view-model.test.ts` — update expectations if tests assert snippet strings

## Detailed substeps (grounded in repo)

1. **View model: dual snippets**  
   Extend `ProjectPageViewModel.integration` (or adjacent fields) to carry:
   - **Primary:** `@dyno/sdk-ts` import + minimal orchestration example using the stage 1 API (embeddings or chosen slice).
   - **Secondary:** existing OpenAI `baseURL` snippet targeting `8788`, explicitly labeled optional / server-side testing.

2. **Integration card**  
   Update [project-integration-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-integration-card.tsx): title/description/footer line “Dyno routes requests…” to match **on-device** decision wording per AGENTS.md §8. Avoid claiming the dashboard or hosted URL is the default runtime router for production client apps.

3. **Setup summary**  
   Adjust [project-setup-summary-card.tsx](../../../apps/dashboard-web/app/projects/_components/project-setup-summary-card.tsx) “Next step” strings so “first request” refers to SDK integration first; proxy second where relevant.

4. **Website hero**  
   Replace or supplement [hero.tsx](../../../apps/website/components/sections/hero.tsx) code block: lead with SDK import, or add clear caption that OpenAI baseURL is optional hosted testing.

5. **Docs page**  
   Reorder [docs/page.tsx](../../../apps/website/app/docs/page.tsx): “Quickstart” = SDK-first; move OpenAI-compatible block under “Optional: hosted OpenAI-compatible endpoint” or similar.

6. **Pricing**  
   Review [pricing/page.tsx](../../../apps/website/app/pricing/page.tsx): “routed requests” implies proxy traffic — align language with telemetry/config-based value (AGENTS.md §10) or label proxy routing explicitly as one billing signal.

7. **Env vars**  
   Document `NEXT_PUBLIC_DYNO_BASE_URL` purpose: if retained for proxy snippets, name it so it is not confused with SDK config endpoint (stage 3).

## Risks and failure modes

- **Doc drift:** snippets updated before stage 1 API is stable — **coordinate** release order or pin snippet to committed API version string.
- **Over-promising:** website claims features not in repo — keep examples aligned with actual exports from `packages/sdk-ts`.
- **Regression:** unit tests in `project-page-view-model.test.ts` fail on string changes — update tests in same change.

## Validation steps

- Manual: open project detail page — integration section shows SDK-first.
- Manual: website `/` and `/docs` — primary CTA matches SDK-first story.
- `npm run test:unit` (or equivalent) for `dashboard-web` if CI runs `project-page-view-model.test.ts`.

## Completion criteria

- [ ] Dashboard project integration presents **SDK + local runtime** as the default path; OpenAI-compatible proxy is **clearly secondary**.
- [ ] Website hero and docs ordering match AGENTS.md §12–13 (proxy optional).
- [ ] Pricing/marketing language does not **only** describe centralized “routed requests” as the product’s core value without qualification.
- [ ] Tests updated if they assert old default copy.

## Out of scope

- Implementing new dashboard features (sandbox UI, playgrounds) — not required by recovery plan
- Changing Supabase schema — **stage 3** if needed
- Proxy internal code — **stage 5**
- `package.json` rename — **stage 6**

## Status

**pending**
