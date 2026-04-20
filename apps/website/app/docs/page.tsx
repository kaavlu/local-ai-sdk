'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Code2, Rocket, Settings } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const sdkInstallCode = `npm install @dyno/sdk-ts`

const optionalOpenAiInstallCode = `npm install openai`

const directSdkCode = `import OpenAI from "openai"
import { Dyno } from "@dyno/sdk-ts"

const provider = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const dyno = await Dyno.init({
  projectApiKey: process.env.DYNO_PROJECT_API_KEY!,
  fallback: {
    adapter: async ({ text }) => {
      const response = await provider.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      })
      return { embedding: response.data[0]!.embedding }
    },
  },
})

const result = await dyno.embedText("Hello, world!")
console.log(result.decision, result.reason)

const status = await dyno.getStatus()
console.log(status.runtime.ready, status.runtime.runtimeSource)

// Optional but recommended on shutdown:
await dyno.shutdown()`

const optionalOpenAiUsageCode = `import OpenAI from "openai"

// Optional: point the OpenAI SDK at the hosted OpenAI-compatible API (sandbox, demos, tooling).
// In dashboard snippets this base URL comes from NEXT_PUBLIC_DYNO_BASE_URL.
const dyno = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: process.env.DYNO_OPENAI_BASE_URL ?? "http://127.0.0.1:8788/v1",
})

const res = await dyno.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

console.log(res.data[0].embedding)  // float[]`

const sections = [
  {
    icon: Rocket,
    title: 'Quickstart',
    description:
      'Install @dyno/sdk-ts, initialize Dyno once, and run your first local-first request.',
    href: '#quickstart',
  },
  {
    icon: Settings,
    title: 'Configuration',
    description:
      'Project policy from the dashboard; the SDK applies it on-device with developer-owned cloud credentials.',
    href: '#config',
  },
  {
    icon: Code2,
    title: 'SDK Reference',
    description:
      '@dyno/sdk-ts for the local runtime; optional hosted OpenAI-compatible API for secondary use cases.',
    href: '#reference',
  },
  {
    icon: BookOpen,
    title: 'Guides',
    description:
      'Step-by-step guides for common patterns: embeddings, completions, execution policies, and more.',
    href: '#guides',
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
        {/* Header */}
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Documentation
          </h1>
          <p className="mt-4 text-lg text-foreground-secondary">
            Dyno is SDK-first: integrate <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">@dyno/sdk-ts</code> and the local runtime for on-device execution with your existing cloud fallback. The hosted control plane provides configuration and telemetry—not the default per-request inference router.
          </p>
        </div>

        {/* Section cards */}
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
                  href="https://dashboard.dyno.dev"
                  className="text-primary hover:underline"
                >
                  Dyno dashboard
                </Link>
                , create a project, and generate a <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">DYNO_PROJECT_API_KEY</code>. Keep fallback provider credentials in your app (for example <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">OPENAI_API_KEY</code>) and wire them through <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.adapter</code>.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                3. Run an embedding via the SDK GA surface
              </h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                Runtime lifecycle is managed internally by Dyno. The default fallback contract is adapter-first (<code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.adapter</code>) so credentials stay app-owned. The stable GA surface remains <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">Dyno.init</code>, <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">embedText/embedTexts</code>, <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">getStatus</code>, and <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">shutdown</code>.
              </p>
              <div className="mt-3 max-w-2xl">
                <CodeBlock
                  code={directSdkCode}
                  filename="local-first.ts"
                  showLineNumbers
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">GA contract (what is stable)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                <li>Initialize once per app process with <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">Dyno.init(...)</code>.</li>
                <li>Run embeddings through <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.embedText</code> or <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.embedTexts</code>.</li>
                <li>Prefer app-owned <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">fallback.adapter</code>; <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">baseUrl/apiKey/model</code> remains a convenience wrapper.</li>
                <li>Inspect lifecycle via <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.getStatus()</code> and close cleanly with <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">dyno.shutdown()</code>.</li>
                <li>Low-level runtime client methods remain available for advanced/internal lanes and are not part of the default integration story.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                Optional: OpenAI SDK against the hosted OpenAI-compatible API
              </h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                For sandbox, demos, or compatibility testing, you can point the OpenAI client at Dyno&apos;s optional OpenAI-compatible endpoint. This is secondary to the SDK + local runtime integration described above.
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

        {/* Coming soon sections */}
        <div className="mt-24 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground-muted">
            Full SDK reference, configuration guides, and API documentation
            coming soon.
          </p>
          <div className="mt-4">
            <Link
              href="https://dashboard.dyno.dev"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              Get started with the dashboard
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
