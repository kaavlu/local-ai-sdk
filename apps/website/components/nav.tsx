'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './logo'

const links = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: 'https://github.com/kaavlu/local-ai-sdk', label: 'GitHub', external: true },
]

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            dyno
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              {...(link.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className="text-sm text-foreground-secondary hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/docs#quickstart"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-foreground-secondary hover:border-foreground-muted hover:text-foreground"
          >
            Quickstart
          </Link>
          <Link
            href="https://dynodev.vercel.app/signin"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Get Started
          </Link>
        </div>

        <button
          className="md:hidden text-foreground-secondary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-6 pb-6 pt-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                onClick={() => setMobileOpen(false)}
                className="text-sm text-foreground-secondary hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-3">
              <Link
                href="/docs#quickstart"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-border-strong px-4 py-2.5 text-center text-sm text-foreground-secondary hover:text-foreground"
              >
                Quickstart
              </Link>
              <Link
                href="https://dynodev.vercel.app/signin"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
