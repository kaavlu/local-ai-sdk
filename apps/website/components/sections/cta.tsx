'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export function CTA() {
  return (
    <section className="relative border-t border-border py-20 md:py-28">
      <div className="cta-glow pointer-events-none absolute inset-0" />

      <motion.div
        className="relative mx-auto max-w-2xl px-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.45 }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Start cutting cloud usage without giving up reliability
        </h2>
        <p className="mt-4 text-lg text-foreground-secondary">
          Create a project, tune local-first policy in the dashboard, and wire up
          the SDK and local runtime.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="https://dashboard.dyno.dev"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-7 py-3.5 text-sm text-foreground-secondary hover:border-foreground-muted hover:text-foreground"
          >
            View Docs
          </Link>
        </div>

        <p className="mt-6 text-sm text-foreground-muted">
          Free tier available. No credit card required.
        </p>
      </motion.div>
    </section>
  )
}
