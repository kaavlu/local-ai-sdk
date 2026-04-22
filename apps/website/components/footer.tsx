import Link from 'next/link'
import { Logo } from './logo'

const footerLinks = {
  Product: [
    { label: 'Pricing', href: '/pricing' },
    { label: 'Quickstart', href: '/docs#quickstart' },
    { label: 'Architecture', href: '/docs#architecture' },
    { label: 'Dashboard', href: 'https://dynodev.vercel.app' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'SDK Reference', href: '/docs#reference' },
    { label: 'Advanced APIs', href: '/docs#advanced' },
    { label: 'GitHub', href: 'https://github.com/kaavlu/local-ai-sdk' },
  ],
  Legal: [
    { label: 'Privacy (coming soon)', href: '#' },
    { label: 'Terms (coming soon)', href: '#' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={22} />
              <span className="text-base font-semibold text-foreground">
                dyno
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground-secondary">
              SDK-first local AI with developer-owned cloud fallback. Config and telemetry in the control plane.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-foreground">
                {category}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground-secondary hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row">
          <p className="text-sm text-foreground-muted">
            &copy; {new Date().getFullYear()} Dyno Labs. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="https://x.com/dyno_dev"
              className="text-sm text-foreground-muted hover:text-foreground-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              X / Twitter
            </Link>
            <Link
              href="https://github.com/kaavlu/local-ai-sdk"
              className="text-sm text-foreground-muted hover:text-foreground-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
