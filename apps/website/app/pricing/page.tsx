'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For developers exploring local-first inference.',
    cta: 'Get Started',
    ctaHref: 'https://dashboard.dyno.dev',
    highlight: false,
    features: [
      '1 project',
      '10,000 routed requests / month',
      'Local-first routing',
      'Community support',
      'Dashboard access',
    ],
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For teams shipping AI-powered products.',
    cta: 'Start Free Trial',
    ctaHref: 'https://dashboard.dyno.dev',
    highlight: true,
    features: [
      'Unlimited projects',
      '500,000 routed requests / month',
      'Advanced routing strategies',
      'Priority support',
      'Request analytics & monitoring',
      'Team members',
      'API key management',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with compliance or scale requirements.',
    cta: 'Book a Demo',
    ctaHref: 'mailto:sales@dyno.dev',
    highlight: false,
    features: [
      'Unlimited everything',
      'Custom routing rules',
      'SLA guarantee',
      'Dedicated support',
      'On-prem deployment option',
      'SSO & audit logs',
      'Custom integrations',
    ],
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

export default function PricingPage() {
  return (
    <div className="pt-32 pb-24 md:pt-44 md:pb-36">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-foreground-secondary">
            Start free. Scale when you need to. No surprises.
          </p>
        </div>

        {/* Tiers */}
        <motion.div
          className="mt-16 grid gap-6 md:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {tiers.map((tier) => (
            <motion.div
              key={tier.name}
              variants={itemVariants}
              className={`relative flex flex-col rounded-xl border p-8 ${
                tier.highlight
                  ? 'border-primary/40 bg-card shadow-lg shadow-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-white">
                  Most popular
                </div>
              )}

              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {tier.name}
                </h2>
                <p className="mt-1 text-sm text-foreground-secondary">
                  {tier.description}
                </p>
              </div>

              <div className="mt-6">
                <span className="text-4xl font-bold text-foreground">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="ml-1 text-sm text-foreground-muted">
                    {tier.period}
                  </span>
                )}
              </div>

              <Link
                href={tier.ctaHref}
                className={`mt-8 block rounded-lg py-2.5 text-center text-sm font-medium ${
                  tier.highlight
                    ? 'bg-primary text-white hover:bg-primary-hover'
                    : 'border border-border-strong text-foreground-secondary hover:border-foreground-muted hover:text-foreground'
                }`}
              >
                {tier.cta}
              </Link>

              <ul className="mt-8 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-foreground-secondary"
                  >
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* FAQ teaser */}
        <div className="mx-auto mt-24 max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-foreground">Questions?</h2>
          <p className="mt-3 text-foreground-secondary">
            Reach out at{' '}
            <a
              href="mailto:hello@dyno.dev"
              className="text-primary hover:underline"
            >
              hello@dyno.dev
            </a>{' '}
            or{' '}
            <Link href="/docs" className="text-primary hover:underline">
              check the docs
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
