'use client'

import { motion } from 'framer-motion'
import { Code2, GitBranch, Zap } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: Code2,
    title: 'Your app calls Dyno',
    description:
      'Replace your direct provider call with a single Dyno SDK call. Same API surface, zero friction.',
  },
  {
    number: '02',
    icon: GitBranch,
    title: 'Dyno evaluates the request',
    description:
      'Model availability, device capability, and your routing configuration determine the optimal target.',
  },
  {
    number: '03',
    icon: Zap,
    title: 'Routes to the best target',
    description:
      'Runs locally on-device when possible. Falls back to cloud providers automatically when not.',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
}

export function HowItWorks() {
  return (
    <section className="relative py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Three steps. Zero infra changes.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-foreground-secondary">
            Dyno sits between your application and AI providers. Your code
            doesn&apos;t change — Dyno handles the routing.
          </p>
        </div>

        <motion.div
          className="mt-12 grid gap-5 md:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {steps.map((step) => (
            <motion.div
              key={step.number}
              variants={itemVariants}
              className="card-glow group relative rounded-xl border border-border bg-card p-7 transition-colors hover:border-border-strong"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <step.icon size={20} className="text-primary" />
                </div>
                <span className="text-sm font-mono text-foreground-muted">
                  {step.number}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
