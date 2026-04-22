<div align="center">

# Dyno

**Local-first AI execution for apps**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
![License](https://img.shields.io/badge/license-MIT-blue)
[![Monorepo](https://img.shields.io/badge/workspace-npm-cc3534)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)

</div>

## What is Dyno?

Dyno is an SDK + runtime platform that helps apps run AI workloads on the **same end user device** when viable, then fall back to the app's **existing cloud provider path** when local execution is not.

With Dyno, teams get:

- local-first execution without giving up cloud reliability
- developer-owned fallback credentials and provider relationships
- hosted configuration, policy control, and telemetry visibility

## Quick Start

Dyno uses npm workspaces and requires Node 18+.

```bash
npm install
npm run build
```

Start the local demo flow:

```bash
npm run demo:start
```

Run SDK diagnostics:

```bash
npm run doctor:sdk
```

## SDK Integration (Golden Path)

```ts
import { Dyno } from "@dynosdk/ts";
import OpenAI from "openai";

const provider = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    adapter: async ({ text }) => {
      const response = await provider.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return { embedding: response.data[0]?.embedding ?? [] };
    },
    generateTextAdapter: async ({ text }) => {
      const response = await provider.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: text }],
      });
      return {
        output: response.choices[0]?.message?.content ?? "",
        model: "gpt-4.1-mini",
      };
    },
  },
});

const result = await dyno.generateText("Summarize Dyno in one sentence.");
console.log(result.decision, result.reason, result.output);
await dyno.shutdown();
```

Required environment variables:

- `DYNO_PROJECT_API_KEY`
- cloud provider key used by your fallback adapter (for example `OPENAI_API_KEY`)

## Architecture At a Glance

Dyno is organized around three core layers:

1. **SDK (`packages/sdk-ts`)**: default integration surface (`Dyno.init`, `embedText`, `generateText`)
2. **Local runtime (`packages/agent`)**: device-side execution engine and readiness checks
3. **Control plane (`apps/dashboard-web`, `apps/control-plane-api`)**: hosted config and telemetry

The OpenAI-compatible routes in `apps/control-plane-api` are supported for sandbox/compatibility workflows, but they are secondary to the SDK + local runtime path.

## Monorepo Layout

```text
.
├─ packages/
│  ├─ agent
│  └─ sdk-ts
├─ apps/
│  ├─ control-plane-api
│  ├─ dashboard-web
│  ├─ demo-electron
│  ├─ sdk-phase2-demo
│  └─ website
└─ scripts/
```

## Common Commands

- `npm run dev:agent` - run the local runtime
- `npm run dev:control-plane` - run the control-plane API
- `npm run dev:dashboard` - run the dashboard
- `npm run dev:app` - run the Electron demo
- `npm run test:sdk:smoke` - run SDK smoke coverage
- `npm run test:control-plane` - run control-plane tests

## Contributing

Contributions are welcome. Open an issue or PR, and include tests for behavior changes when possible.

## License

MIT (`LICENSE`)
