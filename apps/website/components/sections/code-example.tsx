'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CodeBlock } from '../code-block'

const openaiCompatCode = `import OpenAI from "openai"

const dyno = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: "http://127.0.0.1:8788/v1",
})

const res = await dyno.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

const embedding = res.data[0].embedding
// Routing handled. Local or cloud — transparent.`

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
  const [tab, setTab] = useState<Tab>('openai')

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
              Swap baseURL and apiKey.
              <br />
              That&apos;s the migration.
            </h2>
            <p className="mt-3 text-foreground-secondary leading-relaxed">
              Use the OpenAI SDK you already know — just point it at Dyno.
              No new client library to learn. Or use the direct SDK for
              explicit control over local vs. cloud execution.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-block rounded-md bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
                npm install openai
              </span>
              <span className="inline-block rounded-md bg-card px-3 py-1.5 font-mono text-xs text-foreground-muted">
                npm install @dyno/sdk-ts
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
                  onClick={() => setTab('openai')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                    tab === 'openai'
                      ? 'bg-[#0a0a12] text-foreground border-b border-primary'
                      : 'text-foreground-muted hover:text-foreground-secondary'
                  }`}
                >
                  OpenAI-compatible
                </button>
                <button
                  onClick={() => setTab('direct')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                    tab === 'direct'
                      ? 'bg-[#0a0a12] text-foreground border-b border-primary'
                      : 'text-foreground-muted hover:text-foreground-secondary'
                  }`}
                >
                  Direct SDK
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
                ? 'Same OpenAI SDK. Different baseURL. Automatic routing.'
                : 'Full control over execution policy and local/cloud routing.'}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
