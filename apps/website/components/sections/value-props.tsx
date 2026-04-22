'use client'

import { motion } from 'framer-motion'
import { DollarSign, Shield, Layers } from 'lucide-react'

const values = [
  {
    icon: DollarSign,
    title: 'Reduce cloud usage when local is viable',
    description:
      'Dyno can shift qualifying requests to on-device execution and preserve cloud for the requests that need it. Savings are workload-dependent and measured directionally.',
  },
  {
    icon: Shield,
    title: 'Reliability-first fallback behavior',
    description:
      'Local execution fails fast and falls back to your existing cloud provider path through app-owned adapters and credentials.',
  },
  {
    icon: Layers,
    title: 'Same-device local execution model',
    description:
      'Dyno runs local inference on the same end-user device when possible. It is local-or-cloud per user, not cross-user device routing.',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
}

export function ValueProps() {
  return (
    <section
      id="why-dyno"
      className="relative border-t border-border py-16 md:py-24 scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Why Dyno
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Real outcomes, not buzzwords
          </h2>
        </div>

        <motion.div
          className="mt-12 grid gap-5 md:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {values.map((value) => (
            <motion.div
              key={value.title}
              variants={itemVariants}
              className="card-glow group rounded-xl border border-border bg-card p-7 transition-colors hover:border-border-strong"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <value.icon size={20} className="text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {value.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                {value.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
