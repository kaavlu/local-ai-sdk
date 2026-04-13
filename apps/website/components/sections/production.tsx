'use client'

import { motion } from 'framer-motion'

const features = [
  {
    title: 'TypeScript & Python SDKs',
    description: 'First-class support for both ecosystems. Typed clients with full autocomplete.',
  },
  {
    title: 'Provider-agnostic',
    description:
      'Works with OpenAI, Anthropic, local GGUF models, and more. Add providers without code changes.',
  },
  {
    title: 'Sub-100ms routing',
    description:
      'The SDK adds negligible latency. Routing decisions happen locally before the request leaves your app.',
  },
  {
    title: 'Open configuration',
    description:
      'Routing rules are project-level, auditable, and managed from the dashboard. No vendor lock-in.',
  },
  {
    title: 'Embeddings & completions',
    description:
      'Supports embedding models and generative models. Route any inference type through Dyno.',
  },
  {
    title: 'Secure by default',
    description:
      'API keys are project-scoped. Local inference never leaves the device. Cloud calls use your own provider keys.',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

export function Production() {
  return (
    <section className="relative py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Production ready
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Built for real workloads
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-foreground-secondary">
            Dyno isn&apos;t a prototype. It&apos;s infrastructure you can depend
            on in production.
          </p>
        </div>

        <motion.div
          className="mt-12 grid gap-x-8 gap-y-8 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <h3 className="text-sm font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground-secondary">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
