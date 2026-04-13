'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { CodeBlock } from '../code-block'

const heroCode = `import OpenAI from "openai"

const dyno = new OpenAI({
  apiKey: process.env.DYNO_API_KEY,
  baseURL: "http://127.0.0.1:8788/v1",
})

const res = await dyno.embeddings.create({
  model: "text-embedding-3-small",
  input: "How do I reset my password?",
})

const embedding = res.data[0].embedding
// Local when possible. Cloud when needed.`

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-22 pb-14 md:pt-28 md:pb-20">
      <div className="hero-glow pointer-events-none absolute inset-0" />
      <div className="dot-pattern pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border-strong bg-card px-4 py-1.5 text-xs text-foreground-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                Now in public beta
              </div>

              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                Run AI locally.
                <br />
                <span className="text-primary">Fall back to the cloud.</span>
              </h1>

              <p className="mt-5 max-w-lg text-lg leading-relaxed text-foreground-secondary">
                Dyno is an SDK that routes inference to on-device models when
                possible and falls back to cloud providers when not. Cut costs
                without sacrificing reliability.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link
                  href="https://dashboard.dyno.dev"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-hover"
                >
                  Get Started
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-6 py-3 text-sm text-foreground-secondary hover:border-foreground-muted hover:text-foreground"
                >
                  View Docs
                </Link>
              </div>

              <p className="mt-5 font-mono text-sm text-foreground-muted">
                npm install openai
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <CodeBlock code={heroCode} filename="app.ts" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
