'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Code2, Rocket, Settings } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const sdkInstallCode = `npm install @dynosdk/ts`

const optionalOpenAiInstallCode = `npm install openai`

const goldenPathEnvTable = `| Variable | Required? | Used by | Default |
| --- | --- | --- | --- |
| DYNO_PROJECT_API_KEY | Yes | Managed config auth in Dyno.init | none |
| OPENAI_API_KEY (or equivalent) | Yes (adapter-first path) | App-owned fallback adapters | none |
| DYNO_CONFIG_RESOLVER_URL | Optional | Managed config resolver endpoint | http://127.0.0.1:3000 |
| DYNO_AGENT_URL | Optional (advanced) | Runtime endpoint override | auto-resolved local runtime |
| DYNO_RUNTIME_HELPER_PATH | Optional (advanced) | Runtime helper override | auto-discovery |
| DYNO_FALLBACK_BASE_URL | Optional (secondary wrapper) | SDK HTTP fallback convenience wrapper | none |
| DYNO_FALLBACK_API_KEY | Optional (secondary wrapper) | SDK HTTP fallback convenience wrapper | none |
| DYNO_FALLBACK_MODEL | Optional (secondary wrapper) | Embeddings wrapper model | text-embedding-3-small |
| DYNO_FALLBACK_GENERATION_MODEL | Optional (secondary wrapper) | Generation wrapper model | gpt-4.1-mini |
| DYNO_FALLBACK_GENERATE_PATH | Optional (secondary wrapper) | Generation wrapper path | /chat/completions |`

const quickstartCode = `import OpenAI from "openai"
import { Dyno } from "@dynosdk/ts"

const provider = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    generateTextAdapter: async ({ text }) => {
      const response = await provider.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: text }],
      })
      return {
        output: response.choices[0]?.message?.content ?? "",
        model: "gpt-4.1-mini",
      }
    },
  },
})

const result = await dyno.generateText("Summarize Dyno in one sentence.")
console.log(result.decision, result.reason, result.output)

const status = await dyno.getStatus()
console.log(status.runtime.ready, status.runtime.lastError)

// Optional but recommended on shutdown:
await dyno.shutdown()`

const optionalOpenAiUsageCode = `import OpenAI from "openai"

// Optional secondary lane: hosted OpenAI-compatible API.
const client = new OpenAI({
  apiKey: process.env.DYNO_API_KEY!,
  baseURL: process.env.DYNO_OPENAI_BASE_URL ?? "http://127.0.0.1:8788/v1",
})

const res = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

console.log(res.data[0].embedding)`

const advancedSdkCode = `import { DynoSdk } from "@dynosdk/ts"

// Advanced/internal lane: low-level runtime HTTP client.
const sdk = new DynoSdk({ baseUrl: "http://127.0.0.1:8787" })

const job = await sdk.createJob({
  taskType: "generate_text",
  payload: { text: "Summarize this chat", max_new_tokens: 96 },
  executionPolicy: "cloud_allowed",
  localMode: "interactive",
})

await sdk.waitForJobCompletion(job.id)
const result = await sdk.getJobResult(job.id)`

const sdkReferenceRows = [
  {
    method: 'Dyno.init(options)',
    args: 'projectApiKey, fallback.generateTextAdapter + fallback.adapter (preferred), optional configResolverUrl/projectId/telemetrySinks',
    returns: 'Promise<Dyno>',
  },
  {
    method: 'dyno.embedText(text)',
    args: 'text: string',
    returns: '{ embedding, decision, reason, reasonCategory, projectConfig }',
  },
  {
    method: 'dyno.generateText(text, options?)',
    args: 'text: string, options?: { maxNewTokens?: number, temperature?: number, topP?: number }',
    returns: '{ output, decision, reason, reasonCategory, model, usage, projectConfig }',
  },
  {
    method: 'dyno.embedTexts(texts, options?)',
    args: 'texts: string[], options?: { failFast?: boolean }',
    returns: '{ itemCount, successCount, failureCount, results, durationMs }',
  },
  {
    method: 'dyno.getStatus()',
    args: 'none',
    returns:
      '{ runtime: { state, healthy, ready, lastError, runtimeSource, runtimeVersion, helperPath, agentBaseUrl } }',
  },
  {
    method: 'dyno.shutdown(reason?)',
    args: "reason?: string (default 'sdk_shutdown')",
    returns: 'Promise<void>',
  },
]

const stableReasonTaxonomy = [
  {
    category: 'preflight',
    reasons: [
      'agent_unavailable',
      'readiness_probe_failed',
      'local_not_ready_interactive',
      'local_not_ready_background',
      'local_not_ready_conservative',
    ],
  },
  {
    category: 'local_execution',
    reasons: [
      'local_job_completed',
      'local_job_failed',
      'local_job_cancelled',
      'local_job_incomplete',
      'local_job_timeout',
      'local_agent_error',
      'local_failure',
    ],
  },
  {
    category: 'fallback',
    reasons: ['fallback_disabled', 'fallback_adapter_timeout', 'fallback_adapter_error'],
  },
  {
    category: 'config',
    reasons: ['config_load_failed', 'invalid_project_use_case'],
  },
]

const sections = [
  {
    icon: Rocket,
    title: 'Quickstart',
    description:
      'Install @dynosdk/ts, initialize Dyno once, and run your first local-first request.',
    href: '#quickstart',
  },
  {
    icon: Settings,
    title: 'Architecture',
    description:
      'Local-vs-cloud decisions happen on the same user device; cloud fallback stays app-owned.',
    href: '#architecture',
  },
  {
    icon: Code2,
    title: 'SDK Reference',
    description:
      'Stable GA API surface for Dyno.init, generateText, embedText/embedTexts, getStatus, and shutdown.',
    href: '#reference',
  },
  {
    icon: BookOpen,
    title: 'Implemented today',
    description:
      'Current local workloads and runtime boundaries, including where fallback is app-owned vs mocked.',
    href: '#implemented-today',
  },
  {
    icon: Code2,
    title: 'Advanced APIs',
    description:
      'Low-level DynoSdk runtime APIs and optional OpenAI-compatible hosted endpoint for secondary use cases.',
    href: '#advanced',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export default function DocsPage() {
  return (
    <div className="pt-24 pb-24 md:pt-32 md:pb-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Documentation
          </h1>
          <p className="mt-4 text-lg text-foreground-secondary">
            Dyno is SDK-first: integrate{' '}
            <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">
              @dynosdk/ts
            </code>{' '}
            and run local-first on the same user device when viable. When local
            is not viable, Dyno falls back through your app-owned cloud provider
            path.
          </p>
        </div>

        <motion.div
          className="mt-14 grid gap-5 md:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {sections.map((section) => (
            <motion.a
              key={section.title}
              href={section.href}
              variants={itemVariants}
              className="card-glow group flex gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border-strong"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <section.icon size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  {section.title}
                  <ArrowRight
                    size={14}
                    className="text-foreground-muted transition-transform group-hover:translate-x-1"
                  />
                </h3>
                <p className="mt-1 text-sm text-foreground-secondary">
                  {section.description}
                </p>
              </div>
            </motion.a>
          ))}
        </motion.div>

        {/* Quickstart inline */}
        <div id="quickstart" className="mt-24 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground">Quickstart</h2>

          <div className="mt-8 space-y-10">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                1. Install the Dyno SDK
              </h3>
              <div className="mt-3 max-w-xl">
                <CodeBlock code={sdkInstallCode} showLineNumbers={false} />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                2. Get your API key
              </h3>
              <p className="mt-2 text-sm text-foreground-secondary">
                Sign in to the{' '}
                <Link
                  href="https://dynodev.vercel.app"
                  className="text-primary hover:underline"
                >
                  Dyno dashboard
                </Link>
                , create a project, and generate a <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">DYNO_PROJECT_API_KEY</code>. Keep fallback provider credentials in your app (for example <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">OPENAI_API_KEY</code>) and wire them through <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.adapter</code>.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                3. Run generation via the SDK GA surface
              </h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                Runtime lifecycle is managed internally by Dyno. The default
                generation fallback contract is adapter-first (
                <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">
                  fallback.generateTextAdapter
                </code>
                ) so credentials stay app-owned.
              </p>
              <div className="mt-3 max-w-2xl">
                <CodeBlock
                  code={quickstartCode}
                  filename="local-first.ts"
                  showLineNumbers
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                Golden-path env matrix
              </h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                Keep this table aligned with root docs. Adapter-first fallback is
                the default; <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">DYNO_FALLBACK_*</code>{' '}
                variables are the optional convenience wrapper lane.
              </p>
              <div className="mt-3 max-w-3xl">
                <CodeBlock
                  code={goldenPathEnvTable}
                  filename="env-matrix.md"
                  showLineNumbers={false}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">GA contract (what is stable)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                <li>Initialize once per app process with <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">Dyno.init(...)</code>.</li>
                <li>Run local-first generation with <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.generateText</code> and observe <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">decision/reason</code> metadata.</li>
                <li>Run embeddings through <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.embedText</code> or <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.embedTexts</code>.</li>
                <li>Prefer app-owned adapters (<code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.generateTextAdapter</code> and <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.adapter</code>); <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">baseUrl/apiKey/model</code> remains a convenience wrapper.</li>
                <li>Inspect lifecycle via <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.getStatus()</code> and close cleanly with <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.shutdown()</code>.</li>
                <li>Low-level runtime client methods remain available for advanced/internal lanes and are not part of the default integration story.</li>
              </ul>
            </div>
          </div>
        </div>

        <div id="architecture" className="mt-24 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground">Architecture contract</h2>
          <div className="mt-4 rounded-xl border border-border bg-card p-6">
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground-secondary">
              <li>Local-vs-cloud execution is decided in the SDK/runtime on the end-user device.</li>
              <li>The only local target is the same user device for that request.</li>
              <li>Cloud fallback is app-owned by default through your provider client and credentials.</li>
              <li>Dyno control plane handles project config, policy distribution, and directional telemetry.</li>
              <li>Optional hosted OpenAI-compatible API is a secondary mode for sandbox and compatibility lanes.</li>
            </ul>
          </div>
        </div>

        <div id="reference" className="mt-24 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground">SDK Reference (compact)</h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            Stable GA surface for{' '}
            <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">
              @dynosdk/ts
            </code>
            . Default fallback story is app-owned adapters;{' '}
            <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">
              baseUrl/apiKey/model
            </code>{' '}
            remains an optional convenience wrapper.
          </p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-3 font-semibold text-foreground">Method</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Arguments</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Returns</th>
                </tr>
              </thead>
              <tbody>
                {sdkReferenceRows.map((row) => (
                  <tr key={row.method} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3 text-foreground">
                      <code className="rounded bg-background px-1.5 py-0.5 text-xs">{row.method}</code>
                    </td>
                    <td className="px-4 py-3 text-foreground-secondary">{row.args}</td>
                    <td className="px-4 py-3 text-foreground-secondary">{row.returns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-base font-semibold text-foreground">Stable reason taxonomy</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {stableReasonTaxonomy.map((bucket) => (
              <div key={bucket.category} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs">{bucket.category}</code>
                </p>
                <p className="mt-2 text-xs leading-6 text-foreground-secondary">
                  {bucket.reasons.map((reason) => (
                    <span key={reason} className="mr-2 inline-block">
                      <code className="rounded bg-background px-1.5 py-0.5">{reason}</code>
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div id="implemented-today" className="mt-24 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground">Implemented today</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Local workloads</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                <li><code className="rounded bg-background px-1.5 py-0.5">embed_text</code></li>
                <li><code className="rounded bg-background px-1.5 py-0.5">generate_text</code></li>
                <li><code className="rounded bg-background px-1.5 py-0.5">classify_text</code></li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Runtime boundaries</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                <li>Agent cloud lane is currently a mock executor (<code className="rounded bg-background px-1.5 py-0.5">cloud_mock</code>).</li>
                <li>Production cloud fallback is app-owned via SDK adapters.</li>
                <li>Readiness and model residency constraints can cause local bypass.</li>
              </ul>
            </div>
          </div>
        </div>

        <div id="advanced" className="mt-24 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground">Advanced APIs (non-default)</h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            Use these lanes when you explicitly need low-level runtime control
            or compatibility workflows. Most apps should stay on the GA SDK
            surface.
          </p>
          <div className="mt-4 grid gap-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">DynoSdk low-level runtime client</h3>
              <div className="mt-3 max-w-2xl">
                <CodeBlock code={advancedSdkCode} filename="advanced-runtime.ts" showLineNumbers />
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Optional OpenAI-compatible API</h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                For sandbox, demos, or compatibility testing, point the OpenAI
                SDK at Dyno&apos;s optional hosted endpoint.
              </p>
              <div className="mt-3 max-w-xl">
                <CodeBlock code={optionalOpenAiInstallCode} showLineNumbers={false} />
              </div>
              <div className="mt-4 max-w-2xl">
                <CodeBlock
                  code={optionalOpenAiUsageCode}
                  filename="optional-openai-compat.ts"
                  showLineNumbers
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 text-sm text-foreground-muted">
          Need help with production integration? Contact{' '}
          <Link href="mailto:hello@dyno.dev" className="text-primary hover:underline">
            hello@dyno.dev
          </Link>
          .
        </div>
      </div>
    </div>
  )
}
