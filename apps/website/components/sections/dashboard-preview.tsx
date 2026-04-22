'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export function DashboardPreview() {
  return (
    <section
      id="control-plane"
      className="relative border-t border-border py-16 md:py-24 scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Dashboard & control plane
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Configure policy and review telemetry
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-foreground-secondary">
            Create projects, tune local-first policy, and inspect directional
            telemetry. Dyno&apos;s control plane drives configuration and
            visibility while execution decisions stay in the SDK/runtime.
          </p>
        </div>

        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
        >
          <div className="browser-frame mx-auto max-w-5xl shadow-2xl shadow-black/40">
            <div className="browser-frame-bar">
              <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
              <span className="ml-3 text-xs text-foreground-muted">
                dynodev.vercel.app
              </span>
            </div>
            <div className="relative">
              <Image
                src="/dashboard-preview.png"
                alt="Dyno dashboard showing project configuration and telemetry"
                width={1920}
                height={1080}
                className="w-full"
                priority={false}
              />
            </div>
          </div>
        </motion.div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-3">
          {[
            {
              title: 'Project management',
              desc: 'Organize workloads into projects with isolated configs and API keys.',
            },
            {
              title: 'Local-first policy',
              desc: 'Choose local-first, balanced, or cloud-only per project. Enforced by the SDK/runtime on-device.',
            },
            {
              title: 'Telemetry & visibility',
              desc: 'Review directional signals from reported executions—local hit rate, fallback reasons, and cost estimates where available.',
            },
          ].map((item) => (
            <div key={item.title} className="text-center">
              <h3 className="text-sm font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm text-foreground-secondary">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
