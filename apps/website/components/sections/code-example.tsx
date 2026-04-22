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

const directSdkCode = `import OpenAI from "openai"
import { Dyno } from "@dynosdk/ts"

const provider = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

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

const output = await dyno.generateText("Summarize this support conversation")
console.log(output.decision, output.reason, output.output)`

type Tab = 'openai' | 'direct'

export function CodeExample() {
  const [tab, setTab] = useState<Tab>('direct')

  return (
    <section className="relative py-16 md:py-24" id="integration">
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
              Production apps integrate{' '}
              <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">
                @dynosdk/ts
              </code>{' '}
              through the GA <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">Dyno.init</code>{' '}
              flow. Low-level <code className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground-secondary">DynoSdk</code>{' '}
              APIs remain an advanced lane in docs.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-block rounded-md bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
                npm install @dynosdk/ts
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
                  SDK (default)
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
                : 'Primary path: Dyno.init + generateText/embedText with app-owned fallback adapters.'}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
