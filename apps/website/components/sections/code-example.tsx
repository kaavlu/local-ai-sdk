'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CodeBlock } from '../code-block'

const openaiCompatCode = `import OpenAI from "openai"

// Optional: OpenAI SDK → hosted OpenAI-compatible endpoint (sandbox, demos, tooling).
const dyno = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: "http://127.0.0.1:8788/v1",
})

const res = await dyno.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

const embedding = res.data[0].embedding`

const directSdkCode = `import { DynoSdk } from "@dyno/sdk-ts"

const sdk = new DynoSdk()

const job = await sdk.createJob({
  taskType: "embed_text",
  payload: { text: "How do I reset my password?" },
  executionPolicy: "cloud_allowed",
  localMode: "interactive",
})

const done = await sdk.waitForJobCompletion(job.id)
const result = await sdk.getJobResult(job.id)`

type Tab = 'openai' | 'direct'

export function CodeExample() {
  const [tab, setTab] = useState<Tab>('direct')

  return (
    <section className="relative py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45 }}
          >
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              Integration
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Start with the SDK and local runtime.
              <br />
              Add the optional HTTP API when you need it.
            </h2>
            <p className="mt-3 text-foreground-secondary leading-relaxed">
              Production apps integrate <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">@dyno/sdk-ts</code> and the local runtime. The OpenAI-compatible endpoint is an optional path for sandbox, enterprise, and compatibility—not the default architecture.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-block rounded-md bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
                npm install @dyno/sdk-ts
              </span>
              <span className="inline-block rounded-md bg-card px-3 py-1.5 font-mono text-xs text-foreground-muted">
                npm install openai
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-[#0a0a12]">
              <div className="flex border-b border-white/[0.04] bg-[#08080d]">
                <button
                  type="button"
                  onClick={() => setTab('direct')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                    tab === 'direct'
                      ? 'bg-[#0a0a12] text-foreground border-b border-primary'
                      : 'text-foreground-muted hover:text-foreground-secondary'
                  }`}
                >
                  Direct SDK
                </button>
                <button
                  type="button"
                  onClick={() => setTab('openai')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                    tab === 'openai'
                      ? 'bg-[#0a0a12] text-foreground border-b border-primary'
                      : 'text-foreground-muted hover:text-foreground-secondary'
                  }`}
                >
                  OpenAI-compatible
                </button>
              </div>

              <div className="[&_.code-block]:border-0 [&_.code-block]:rounded-none [&_.code-block]:shadow-none [&_.code-block>div:first-child]:hidden">
                <CodeBlock
                  code={tab === 'openai' ? openaiCompatCode : directSdkCode}
                  showLineNumbers
                />
              </div>
            </div>

            <p className="mt-2.5 text-center text-xs text-foreground-muted">
              {tab === 'openai'
                ? 'Hosted OpenAI-compatible API — secondary to the SDK + local runtime path.'
                : 'Primary path: local vs cloud decisions in the SDK/runtime on the user’s device.'}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
