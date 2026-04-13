'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Code2, Rocket, Settings } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

const installCode = `npm install openai`

const usageCode = `import OpenAI from "openai"

// Point the OpenAI SDK at your local Dyno control plane
const dyno = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: "http://127.0.0.1:8788/v1",
})

// Make an embeddings request — Dyno routes automatically
const res = await dyno.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

console.log(res.data[0].embedding)  // float[]`

const directSdkCode = `import { DynoSdk } from "@dyno/sdk-ts"

const sdk = new DynoSdk()

const job = await sdk.createJob({
  taskType: "embed_text",
  payload: { text: "Hello, world!" },
  executionPolicy: "cloud_allowed",
  localMode: "interactive",
})

const done = await sdk.waitForJobCompletion(job.id)
const result = await sdk.getJobResult(job.id)`

const sections = [
  {
    icon: Rocket,
    title: 'Quickstart',
    description:
      'Install the OpenAI SDK, configure your Dyno API key, and make your first routed inference call in under 5 minutes.',
    href: '#quickstart',
  },
  {
    icon: Settings,
    title: 'Configuration',
    description:
      'Set routing strategies, configure provider fallbacks, and tune local model preferences per project.',
    href: '#config',
  },
  {
    icon: Code2,
    title: 'SDK Reference',
    description:
      'OpenAI-compatible API reference and direct @dyno/sdk-ts API for local-first execution control.',
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
            Everything you need to integrate Dyno into your application.
            Use the OpenAI SDK you already know, or the direct SDK for full control.
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
                1. Install the OpenAI SDK
              </h3>
              <div className="mt-3 max-w-xl">
                <CodeBlock code={installCode} showLineNumbers={false} />
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
                , create a project, and generate a <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">DYNO_API_KEY</code>.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                3. Make your first request (OpenAI-compatible)
              </h3>
              <div className="mt-3 max-w-2xl">
                <CodeBlock
                  code={usageCode}
                  filename="app.ts"
                  showLineNumbers
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                Alternative: Direct SDK for execution control
              </h3>
              <p className="mt-2 mb-3 text-sm text-foreground-secondary">
                When you need explicit control over local vs. cloud execution
                policy, use <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">@dyno/sdk-ts</code> directly.
              </p>
              <div className="max-w-2xl">
                <CodeBlock
                  code={directSdkCode}
                  filename="local-control.ts"
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
