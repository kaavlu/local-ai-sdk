# @dynosdk/ts

TypeScript SDK for Dyno local-first AI execution.

`@dynosdk/ts` is the primary integration surface for running workloads on the same end user's device when viable, then falling back to your existing cloud provider path when needed.

## Install

```bash
npm install @dynosdk/ts
```

## Quick start

```ts
import { Dyno } from '@dynosdk/ts';
import OpenAI from 'openai';

const provider = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    generateTextAdapter: async ({ text }) => {
      const response = await provider.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: text }],
      });

      return {
        output: response.choices[0]?.message?.content ?? '',
        model: 'gpt-4.1-mini',
      };
    },
  },
});

const result = await dyno.generateText('Summarize Dyno in one sentence.');
console.log(result.decision, result.reason, result.output);

await dyno.shutdown();
```

Canonical onboarding source: root `README.md` section `Golden path quickstart (Phase 6 default)`.

Quick env checklist (same as root docs):

- Required: `DYNO_PROJECT_API_KEY`
- Required for adapter-first fallback: provider key in app code (for example `OPENAI_API_KEY`)
- Optional resolver override: `DYNO_CONFIG_RESOLVER_URL` (default `http://127.0.0.1:3000`)
- Optional durable config cache dir (Node, disk mode): `DYNO_PROJECT_CONFIG_CACHE_DIR`
- Optional advanced runtime override: `DYNO_AGENT_URL`
- Optional telemetry backhaul URL (recommended for pilots): `DYNO_TELEMETRY_URL`
- Optional telemetry bearer key (if ingest endpoint requires auth): `DYNO_TELEMETRY_API_KEY`
- Optional secondary convenience-wrapper envs: `DYNO_FALLBACK_BASE_URL`, `DYNO_FALLBACK_API_KEY`, `DYNO_FALLBACK_MODEL`, `DYNO_FALLBACK_GENERATION_MODEL`, `DYNO_FALLBACK_GENERATE_PATH`

Project config cache semantics (managed onboarding):

- default: in-memory cache only (`ttlMs=30000`, `allowStaleOnError=true`, `maxStaleMs=600000`)
- cold start with no cache + resolver failure: fail fast with `config_load_failed`
- optional durable mode: `projectConfigCache.persistence = 'disk'` (Node-only) to reuse LKG across process restarts

Telemetry defaults:

- when `DYNO_TELEMETRY_URL` is set, `Dyno.init(...)` auto-appends `createHttpTelemetrySink(...)`
- telemetry remains best-effort: sink failures are swallowed and never alter execution/fallback decisions
- telemetry auth is optional at SDK layer: pass `DYNO_TELEMETRY_API_KEY` when backend expects bearer auth

## Core APIs

- `Dyno.init(...)`
- `dyno.embedText(...)`
- `dyno.embedTexts(...)`
- `dyno.generateText(...)`
- `dyno.getStatus()`
- `dyno.shutdown()`

## Requirements

- Node.js `>=18`

## Links

- Docs: `README.md` at the repository root
- Issues: <https://github.com/kaavlu/local-ai-sdk/issues>
